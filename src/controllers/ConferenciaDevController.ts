import type { Request, Response } from "express";
import { ConferenciaDevService } from "../services/ConferenciaDevService.js";

const service = new ConferenciaDevService();

function toNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function toStringValue(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  return undefined;
}

function toRefugo(v: unknown): "S" | "N" | undefined {
  const s = toStringValue(v)?.trim().toUpperCase();
  if (s === "S" || s === "N") return s;
  return undefined;
}

export class ConferenciaDevController {
  static async inserir(req: Request, res: Response) {
    try {
      const SEQ = toNumber(req.body?.SEQ);
      const CODBARRA = toStringValue(req.body?.CODBARRA);
      const CODPROD = toNumber(req.body?.CODPROD);
      const REFUGO = toRefugo(req.body?.REFUGO);
      const PESO = toNumber(req.body?.PESO);
      const QTDNEG = toNumber(req.body?.QTDNEG);

      if (!SEQ) {
        return res.status(400).json({
          ok: false,
          message: "Parâmetro SEQ é obrigatório.",
        });
      }

      const data = await service.inserir({
        SEQ,
        CODBARRA,
        CODPROD,
        REFUGO,
        PESO,
        QTDNEG,
      });

      return res.status(201).json({
        ok: true,
        message: "Conferência inserida com sucesso.",
        data,
      });
    } catch (error: any) {
      return res.status(error?.statusCode || 500).json({
        ok: false,
        message: error?.message || "Erro interno ao inserir conferência.",
      });
    }
  }
}