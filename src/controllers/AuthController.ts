import { Request, Response } from "express";
import { AuthService } from "../services/AuthService.js";

export class AuthController {
  // Login com USERNAME/PASSWORD (sem hash), checando ATIVO=1
  static async login(req: Request, res: Response) {
    const { username, password } = req.body ?? {};
    if (!username || !password) {
      return res.status(400).json({ error: true, message: "username e password são obrigatórios." });
    }

    const { token, user } = await AuthService.authenticate(username, password);
    return res.json({ user ,token});
  }

  // Troca de senha (sem hash), restrita ao próprio usuário
  // Aceita { oldPassword, newPassword } — o usuário autenticado vem do JWT
  static async changePassword(req: Request, res: Response) {
    const userFromToken = (req as any).user as { codigo: number; username: string } | undefined;
    const { oldPassword, newPassword } = req.body ?? {};

    if (!userFromToken) {
      return res.status(401).json({ error: true, message: "Não autenticado." });
    }
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: true, message: "oldPassword e newPassword são obrigatórios." });
    }

    await AuthService.changePassword({
      codigo: userFromToken.codigo,
      username: userFromToken.username,
      oldPassword,
      newPassword,
    });

    return res.json({ ok: true, message: "Senha atualizada com sucesso." });
  }

  // Informações do usuário autenticado (payload do token)
  static async me(_req: Request, res: Response) {
    const userFromToken = (res.req as any).user as { codigo: number; username: string } | undefined;
    return res.json({ user: userFromToken });
  }
}
