import { Request, Response } from "express";
import { PrintService } from "../services/PrinterService.js";

const allowedModels = ["default", "shipping", "maispvc", "maispvc-industrial"] as const;
type PrintModel = (typeof allowedModels)[number];

export class PrintController {
  static async print(req: Request, res: Response) {
    const sequencia = Number(req.params.sequencia);
    if (!Number.isFinite(sequencia)) {
      return res.status(400).json({ error: true, message: "sequencia inválida." });
    }

    const ip = (req.query.ip || req.body?.ip) as string | undefined;
    const port = (req.query.port || req.body?.port) as string | number | undefined;

    const modelQ = String(req.query.model ?? req.body?.model ?? "default").toLowerCase();

    const model: PrintModel = allowedModels.includes(modelQ as PrintModel)
      ? (modelQ as PrintModel)
      : "default";

    try {
      const out = await PrintService.printSequencia(sequencia, ip, port, model);
      return res.json(out);
    } catch (e: any) {
      const status = e?.status ?? 500;
      return res.status(status).json({
        error: true,
        message: e?.message ?? "Falha ao imprimir.",
      });
    }
  }
}