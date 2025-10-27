import type { Request, Response } from "express";
import { EtiquetasService } from "../services/EtiquetasService.js";

const service = new EtiquetasService();

export class EtiquetasController {
  static async listar(req: Request, res: Response) {
    const data = await service.listar(req.query);
    res.json(data);
  }

  static async obter(req: Request, res: Response) {
    const seq = Number(req.params.sequencia);
    const data = await service.obter(seq);
    res.json(data);
  }

  static async criar(req: Request, res: Response) {
    const out = await service.criar(req.body);
    res.status(201).json(out);
  }

  static async atualizar(req: Request, res: Response) {
    const seq = Number(req.params.sequencia);
    const out = await service.atualizar(seq, req.body);
    res.json(out);
  }

  static async remover(req: Request, res: Response) {
    const seq = Number(req.params.sequencia);
    const out = await service.remover(seq);
    res.json(out);
  }
}
