import type { Request, Response } from "express";
import {
  AppError,
  ConferenciaCargaService,
} from "../services/ConferenciaCargaService.js";

const service = new ConferenciaCargaService();

function handleError(res: Response, error: unknown) {
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      ok: false,
      message: error.message,
    });
  }

  const message =
    error instanceof Error ? error.message : "Erro interno do servidor.";

  console.error("Erro ConferenciaCargaController:", error);

  return res.status(500).json({
    ok: false,
    message,
  });
}

export class ConferenciaCargaController {
  static async listarCargas(req: Request, res: Response) {
    try {
      const codEqpExp =
        typeof req.query.codEqpExp === "string"
          ? req.query.codEqpExp
          : Array.isArray(req.query.codEqpExp) && typeof req.query.codEqpExp[0] === "string"
            ? req.query.codEqpExp[0]
            : undefined;

      const data = await service.listarCargasPorEquipe(codEqpExp);

      return res.json({
        ok: true,
        data,
      });
    } catch (error) {
      return handleError(res, error);
    }
  }

  static async obterCarga(req: Request, res: Response) {
    try {
      const { seqOc } = req.params;

      const data = await service.obterCarga(seqOc);

      return res.json({
        ok: true,
        data,
      });
    } catch (error) {
      return handleError(res, error);
    }
  }

  static async listarPedidos(req: Request, res: Response) {
    try {
      const { seqOc } = req.params;

      const data = await service.listarPedidos(seqOc);

      return res.json({
        ok: true,
        data,
      });
    } catch (error) {
      return handleError(res, error);
    }
  }

  static async listarResumoItens(req: Request, res: Response) {
    try {
      const { seqOc } = req.params;

      const nunota =
        typeof req.query.nunota === "string"
          ? req.query.nunota
          : Array.isArray(req.query.nunota) && typeof req.query.nunota[0] === "string"
            ? req.query.nunota[0]
            : undefined;

      const data = await service.listarResumoItens(seqOc, nunota);

      return res.json({
        ok: true,
        data,
      });
    } catch (error) {
      return handleError(res, error);
    }
  }

  static async listarEtiquetasConferidas(req: Request, res: Response) {
    try {
      const { seqOc } = req.params;

      const data = await service.listarEtiquetasConferidas(seqOc);

      return res.json({
        ok: true,
        data,
      });
    } catch (error) {
      return handleError(res, error);
    }
  }

  static async registrarBipagem(req: Request, res: Response) {
    try {
      const { seqOc } = req.params;

      const data = await service.registrarBipagem({
        seqOc: Number(seqOc),
        codBarra: req.body?.codBarra,
        modoConferencia: req.body?.modoConferencia,
        nunota: req.body?.nunota,
      });

      return res.status(201).json(data);
    } catch (error) {
      return handleError(res, error);
    }
  }

  static async finalizarCarga(req: Request, res: Response) {
    try {
      const { seqOc } = req.params;

      const data = await service.finalizarCarga(seqOc);

      return res.json(data);
    } catch (error) {
      return handleError(res, error);
    }
  }
}