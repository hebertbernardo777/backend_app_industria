import { Request, Response } from "express";
import { EtiquetasService } from "../services/EtiquetasService.js";

const service = new EtiquetasService();

export class EtiquetasController {
  static async listar(req: Request, res: Response) {
    try {
      const data = await service.listar({
        sequencia: req.query.sequencia as any,
        sequencias: req.query.sequencias as any,
        data: req.query.data as any,
        from: req.query.from as any,
        to: req.query.to as any,
        op: req.query.op as any,

        // NOVO: permite filtrar etiquetas pela máquina
        codwcp: req.query.codwcp as any,
      });

      return res.json(data);
    } catch (e: any) {
      const status = e?.status ?? 400;
      return res.status(status).json({
        error: true,
        message: e?.message ?? "Erro ao listar etiquetas.",
      });
    }
  }

  static async listarOpcoesCausaRefugo(req: Request, res: Response) {
    try {
      const data = await service.listarOpcoesCausaRefugo();
      return res.json(data);
    } catch (e: any) {
      const status = e?.status ?? 400;
      return res.status(status).json({
        error: true,
        message: e?.message ?? "Erro ao listar opções de causa de refugo.",
      });
    }
  }

  static async relatorioFimTurno(req: Request, res: Response) {
    try {
      const data = await service.relatorioFimTurno({
        data: req.query.data as any,
        turno: req.query.turno as any,

        // pode continuar usando maquina como parâmetro público
        // internamente o repository usa CODWCP
        maquina: req.query.maquina as any,
      });

      return res.json(data);
    } catch (e: any) {
      const status = e?.status ?? 400;
      return res.status(status).json({
        error: true,
        message: e?.message ?? "Erro ao gerar relatório de fim de turno.",
      });
    }
  }

  static async obter(req: Request, res: Response) {
    try {
      const sequencia = Number(req.params.sequencia);
      const data = await service.obter(sequencia);
      return res.json(data);
    } catch (e: any) {
      const status = e?.status ?? 400;
      return res.status(status).json({
        error: true,
        message: e?.message ?? "Erro ao obter etiqueta.",
      });
    }
  }

  static async obterPorCodigoBarra(req: Request, res: Response) {
    try {
      const codigoBarra =
        typeof req.params.codigoBarra === "string"
          ? req.params.codigoBarra
          : "";

      const data = await service.obterPorCodigoBarra(codigoBarra);
      return res.json(data);
    } catch (e: any) {
      const status = e?.status ?? 400;
      return res.status(status).json({
        error: true,
        message: e?.message ?? "Erro ao obter etiqueta por código de barras.",
      });
    }
  }

  static async criar(req: Request, res: Response) {
    try {
      // NÃO precisa mudar: req.body já leva CODWCP para o service
      const data = await service.criar(req.body);
      return res.status(201).json(data);
    } catch (e: any) {
      const status = e?.status ?? 400;
      return res.status(status).json({
        error: true,
        message: e?.message ?? "Erro ao criar etiqueta.",
      });
    }
  }

  static async atualizar(req: Request, res: Response) {
    try {
      const sequencia = Number(req.params.sequencia);

      // NÃO precisa mudar: req.body também pode levar CODWCP para atualizar
      const data = await service.atualizar(sequencia, req.body);

      return res.json(data);
    } catch (e: any) {
      const status = e?.status ?? 400;
      return res.status(status).json({
        error: true,
        message: e?.message ?? "Erro ao atualizar etiqueta.",
      });
    }
  }

  static async atualizarStatus(req: Request, res: Response) {
    try {
      const sequencia = Number(req.params.sequencia);
      const data = await service.atualizarStatus(
        sequencia,
        req.body?.STATUS_ETIQUETA
      );
      return res.json(data);
    } catch (e: any) {
      const status = e?.status ?? 400;
      return res.status(status).json({
        error: true,
        message: e?.message ?? "Erro ao atualizar status da etiqueta.",
      });
    }
  }

  static async incrementarReimpressao(req: Request, res: Response) {
    try {
      const sequencia = Number(req.params.sequencia);

      const data = await service.incrementarReimpressao(sequencia, {
        TURNO: req.body?.TURNO,
        JUSTIFICATIVA: req.body?.JUSTIFICATIVA,
        NOME: req.body?.NOME,
      });

      return res.json(data);
    } catch (e: any) {
      const status = e?.status ?? 400;
      return res.status(status).json({
        error: true,
        message: e?.message ?? "Erro ao registrar reimpressão.",
      });
    }
  }

  static async remover(req: Request, res: Response) {
    try {
      const sequencia = Number(req.params.sequencia);
      const data = await service.remover(sequencia);
      return res.json(data);
    } catch (e: any) {
      const status = e?.status ?? 400;
      return res.status(status).json({
        error: true,
        message: e?.message ?? "Erro ao remover etiqueta.",
      });
    }
  }
}
