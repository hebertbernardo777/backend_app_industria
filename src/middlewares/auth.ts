import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { ENV } from "../config/env.js";


export function authGuard(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return res.status(401).json({ error: true, message: "Token ausente." });
  }

  const token = auth.slice(7);
  try {
    const payload = jwt.verify(token, ENV.JWT_SECRET ?? "dev-secret");
    (req as any).user = payload; // { codigo, username }
    return next();
  } catch {
    return res.status(401).json({ error: true, message: "Token inválido ou expirado." });
  }
}
