import type { Request, Response } from "express";
import { RetrabalhoService } from "../services/RetrabalhoService.js";

const service = new RetrabalhoService();

export class RetrabalhoController {
  static async criar(req: Request, res: Response) {
    try {
      const data = await service.criar(req.body);
      res.status(201).json(data);
    } catch (error: any) {
      const status = error?.status && Number.isFinite(error.status) ? error.status : 400;
      res.status(status).json({
        ok: false,
        message: error?.message || "Erro ao processar retrabalho.",
      });
    }
  }
}