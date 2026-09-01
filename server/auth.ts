import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import type { ClientUser } from "../lib/types";

const registerSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(24).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(8)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const jwtSecret = () => process.env.JWT_SECRET ?? "dev-only-secret-change-me";

export function publicUser(user: { id: string; email: string; username: string; rating: number }): ClientUser {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    rating: user.rating
  };
}

export function signToken(user: ClientUser) {
  return jwt.sign({ sub: user.id, username: user.username }, jwtSecret(), { expiresIn: "14d" });
}

export async function register(req: Request, res: Response) {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid registration details." });

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  try {
    const user = await prisma.user.create({
      data: {
        email: parsed.data.email.toLowerCase(),
        username: parsed.data.username,
        passwordHash,
        ratingHistory: {
          create: { rating: 0, delta: 0 }
        }
      }
    });
    const safeUser = publicUser(user);
    return res.json({ user: safeUser, token: signToken(safeUser) });
  } catch {
    return res.status(409).json({ error: "Email or username is already taken." });
  }
}

export async function login(req: Request, res: Response) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid login details." });

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (!user) return res.status(401).json({ error: "Incorrect email or password." });

  const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Incorrect email or password." });

  const safeUser = publicUser(user);
  return res.json({ user: safeUser, token: signToken(safeUser) });
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
  if (!token) return res.status(401).json({ error: "Authentication required." });

  try {
    const decoded = jwt.verify(token, jwtSecret()) as { sub: string };
    const user = await prisma.user.findUnique({ where: { id: decoded.sub } });
    if (!user) return res.status(401).json({ error: "Authentication required." });
    req.user = publicUser(user);
    return next();
  } catch {
    return res.status(401).json({ error: "Authentication required." });
  }
}

export async function userFromToken(token?: string) {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, jwtSecret()) as { sub: string };
    const user = await prisma.user.findUnique({ where: { id: decoded.sub } });
    return user ? publicUser(user) : null;
  } catch {
    return null;
  }
}
