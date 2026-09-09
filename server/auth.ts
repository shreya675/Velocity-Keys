import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import type { ClientUser } from "../lib/types";

export const usernameSchema = z.string().trim().min(3).max(24).regex(/^[a-zA-Z0-9_]+$/);

const registerSchema = z.object({
  email: z.string().email(),
  username: usernameSchema,
  password: z.string().min(8)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const googleSchema = z.object({
  credential: z.string().min(20)
});

const jwtSecret = () => process.env.JWT_SECRET ?? "dev-only-secret-change-me";
const googleClient = () => new OAuth2Client(process.env.GOOGLE_CLIENT_ID ?? process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);

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
  if (!user.passwordHash) return res.status(401).json({ error: "Use Google sign-in for this account." });

  const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Incorrect email or password." });

  const safeUser = publicUser(user);
  return res.json({ user: safeUser, token: signToken(safeUser) });
}

export async function googleLogin(req: Request, res: Response) {
  const parsed = googleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid Google login response." });

  const clientId = process.env.GOOGLE_CLIENT_ID ?? process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) return res.status(500).json({ error: "Google sign-in is not configured." });

  try {
    const ticket = await googleClient().verifyIdToken({
      idToken: parsed.data.credential,
      audience: clientId
    });
    const payload = ticket.getPayload();
    const email = payload?.email?.toLowerCase();
    const googleId = payload?.sub;
    if (!email || !googleId || payload.email_verified !== true) {
      return res.status(401).json({ error: "Google account could not be verified." });
    }

    const existingByGoogle = await prisma.user.findUnique({ where: { googleId } });
    if (existingByGoogle) {
      const safeUser = publicUser(existingByGoogle);
      return res.json({ user: safeUser, token: signToken(safeUser) });
    }

    const existingByEmail = await prisma.user.findUnique({ where: { email } });
    if (existingByEmail) {
      const linked = await prisma.user.update({
        where: { id: existingByEmail.id },
        data: { googleId }
      });
      const safeUser = publicUser(linked);
      return res.json({ user: safeUser, token: signToken(safeUser) });
    }

    const username = await uniqueGoogleUsername(payload.name ?? email.split("@")[0]);
    const user = await prisma.user.create({
      data: {
        email,
        username,
        googleId,
        ratingHistory: {
          create: { rating: 0, delta: 0 }
        }
      }
    });
    const safeUser = publicUser(user);
    return res.json({ user: safeUser, token: signToken(safeUser) });
  } catch {
    return res.status(401).json({ error: "Google sign-in failed. Try again." });
  }
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

async function uniqueGoogleUsername(name: string) {
  const base = sanitizeUsername(name) || "racer";
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const suffix = attempt === 0 ? "" : String(Math.floor(100 + Math.random() * 9000));
    const username = `${base}${suffix}`.slice(0, 24);
    const existing = await prisma.user.findUnique({ where: { username } });
    if (!existing) return username;
  }
  return `racer${Date.now().toString(36)}`.slice(0, 24);
}

function sanitizeUsername(value: string) {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  return (cleaned.length >= 3 ? cleaned : `user_${cleaned}`).slice(0, 20);
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
