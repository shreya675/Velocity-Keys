import type { ClientUser } from "../lib/types";

declare global {
  namespace Express {
    interface Request {
      user?: ClientUser;
    }
  }
}

export {};
