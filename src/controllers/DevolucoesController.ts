import type { Request, Response } from "express";
import { DevolucoesService, ServiceError } from "../services/DevolucoesService.js";

const service = new DevolucoesService();

type SN = "S" | "N";
type TipoLancamento = "E" | "S" | "R";

function parseTipoLancamento(value: unknown): TipoLancamento {
  const v = String(value ?? "").toUpperCase().trim();

  if (v === "E" || v === "ETIQUETA") return "E";
  if (v === "S" || v === "SEM_ETIQUETA") return "S";
  if (v === "R" || v === "REFUGO") return "R";

  throw new ServiceError(
    "tipoLancamento inválido. Use E, S, R ou ETIQUETA, SEM_ETIQUETA, REFUGO.",
    400
  );
}

function parseSN(value: unknown, fallback: SN = "N"): SN {
  const v = String(value ?? fallback).toUpperCase().trim();
  return v === "S" ? "S" : "N";
}

function getApiErrorMessage(error: unknown) {
  if (error instanceof ServiceError) {
    return { statusCode: error.statusCode, message: error.message };
  }

  if (error instanceof Error) {
    return { statusCode: 500, message: error.message };
  }

  return { statusCode: 500, message: "Erro interno do servidor." };
}

function getSingleBodyValue(value: unknown) {
  if (Array.isArray(value)) return value[0];
  return value;
}

export class DevolucoesController {
  static async listarPendentes(req: Request, res: Response) {
    try {
      const data = await service.listarPendentes();
      return res.status(200).json(data);
    } catch (error) {
      const handled = getApiErrorMessage(error);
      console.error("Erro listarPendentes:", error);
      return res.status(handled.statusCode).json({
        ok: false,
        message: handled.message,
      });
    }
  }

  static async listarItens(req: Request, res: Response) {
    try {
      const seq = Number(req.params.seq);

      if (!Number.isFinite(seq) || seq <= 0) {
        return res.status(400).json({
          ok: false,
          message: "SEQ inválido.",
        });
      }

      const data = await service.listarItens(seq);
      return res.status(200).json(data);
    } catch (error) {
      const handled = getApiErrorMessage(error);
      console.error("Erro listarItens:", error);
      return res.status(handled.statusCode).json({
        ok: false,
        message: handled.message,
      });
    }
  }

  static async listarEtiquetasGeradas(req: Request, res: Response) {
    try {
      const seq = Number(req.params.seq);

      if (!Number.isFinite(seq) || seq <= 0) {
        return res.status(400).json({
          ok: false,
          message: "SEQ inválido.",
        });
      }

      const data = await service.listarEtiquetasGeradas(seq);
      return res.status(200).json({
        ok: true,
        data,
      });
    } catch (error) {
      const handled = getApiErrorMessage(error);
      console.error("Erro listarEtiquetasGeradas:", error);
      return res.status(handled.statusCode).json({
        ok: false,
        message: handled.message,
      });
    }
  }

  static async concluirDevolucao(req: Request, res: Response) {
    try {
      const seq = Number(req.params.seq);
      const body = req.body ?? {};
      const codUsu = Number(getSingleBodyValue(body.codUsu));

      if (!Number.isFinite(seq) || seq <= 0) {
        return res.status(400).json({
          ok: false,
          message: "SEQ inválido.",
        });
      }

      if (!Number.isFinite(codUsu) || codUsu <= 0) {
        return res.status(400).json({
          ok: false,
          message: "CODUSU inválido.",
        });
      }

      const data = await service.concluirDevolucao(seq, codUsu);
      return res.status(200).json(data);
    } catch (error) {
      const handled = getApiErrorMessage(error);
      console.error("Erro concluirDevolucao:", error);
      return res.status(handled.statusCode).json({
        ok: false,
        message: handled.message,
      });
    }
  }

  static async lancarConferencia(req: Request, res: Response) {
    try {
      const seq = Number(req.params.seq);
      const codProd = Number(req.params.codProd);

      if (!Number.isFinite(seq) || seq <= 0) {
        return res.status(400).json({
          ok: false,
          message: "SEQ inválido.",
        });
      }

      if (!Number.isFinite(codProd) || codProd <= 0) {
        return res.status(400).json({
          ok: false,
          message: "CODPROD inválido.",
        });
      }

      const body = req.body ?? {};

      const data = await service.lancarConferencia({
        seq,
        codProd,
        codUsu: Number(getSingleBodyValue(body.codUsu)),
        tipoLancamento: parseTipoLancamento(body.tipoLancamento),
        quantidade: Number(
          getSingleBodyValue(body.quantidade ?? body.qtdNeg ?? body.qtd)
        ),
        peso:
          getSingleBodyValue(body.peso) == null ||
          getSingleBodyValue(body.peso) === ""
            ? null
            : Number(getSingleBodyValue(body.peso)),
        codBarra:
          getSingleBodyValue(body.codBarra) == null
            ? null
            : String(getSingleBodyValue(body.codBarra)),
        gerouNovaEtiqueta: parseSN(body.gerouNovaEtiqueta),
        codProdRefugo:
          getSingleBodyValue(body.codProdRefugo) == null ||
          getSingleBodyValue(body.codProdRefugo) === ""
            ? null
            : Number(getSingleBodyValue(body.codProdRefugo)),
        obs:
          getSingleBodyValue(body.obs) == null
            ? null
            : String(getSingleBodyValue(body.obs)),
      });

      return res.status(201).json(data);
    } catch (error) {
      const handled = getApiErrorMessage(error);
      console.error("Erro lancarConferencia:", error);
      return res.status(handled.statusCode).json({
        ok: false,
        message: handled.message,
      });
    }
  }
}