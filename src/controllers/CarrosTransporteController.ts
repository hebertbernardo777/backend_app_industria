import type { Request, Response } from "express";
import { CarrosTransporteService } from "../services/CarrosTransporteService.js";

const service = new CarrosTransporteService();

export class CarrosTransporteController {
  static async listar(req: Request, res: Response) {
    const data = await service.listar();

    return res.json({
      ok: true,
      total: data.length,
      data,
    });
  }
}