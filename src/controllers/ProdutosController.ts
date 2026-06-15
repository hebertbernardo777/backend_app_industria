import type { Request, Response } from "express";
import { ProdutosService } from "../services/ProdutosService.js";

const service = new ProdutosService();

export class ProdutosController {
  static async listarProdutosEtiqueta(req: Request, res: Response) {
    try {
      const data = await service.listarProdutosEtiqueta();
      return res.json(data);
    } catch (error: any) {
      console.error("Erro ao listar produtos para etiqueta:", error);

      return res.status(500).json({
        ok: false,
        message: error?.message || "Erro ao listar produtos.",
      });
    }
  }
}