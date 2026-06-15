import type { Request, Response } from "express";
import { ProdutosGrupoRefugoService } from "../services/ProdutosGrupoRefugoService.js";

export class ProdutosGrupoRefugoController {
  static async listar(req: Request, res: Response) {
    try {
      const data = await ProdutosGrupoRefugoService.listarProdutosGrupo();

      return res.status(200).json({
        ok: true,
        total: data.length,
        data,
      });
    } catch (error: any) {
      console.error("Erro ao listar produtos do grupo:", error);

      return res.status(500).json({
        ok: false,
        message: "Erro ao consultar produtos.",
        error: error?.message ?? "Erro interno",
      });
    }
  }
}