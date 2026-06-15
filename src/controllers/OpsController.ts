import type { Request, Response } from "express";
import { OpsService } from "../services/OpsService.js";

const service = new OpsService();

export class OpsController {
  static async listar(req: Request, res: Response) {
    const data = await service.listar(req.query);
    return res.json(data);
  }

  static async listarPlantas(req: Request, res: Response) {
    const data = await service.listarPlantas();
    return res.json(data);
  }

  static async listarMaquinas(req: Request, res: Response) {
    const data = await service.listarMaquinas(req.query);
    return res.json(data);
  }

  static async listarProdutosOp(req: Request, res: Response) {
    const data = await service.listarProdutosOp(req.query);
    return res.json(data);
  }

  static async detalharProdutoOp(req: Request, res: Response) {
    const data = await service.detalharProdutoOp({
      ...req.params,
      ...req.query,
    });

    return res.json(data);
  }

  static async criarOp(req: Request, res: Response) {
    const user: any = (req as any).user;

    const body = {
      ...req.body,
      codUsuInc:
        req.body?.codUsuInc ??
        user?.codigo ??
        user?.CODIGO ??
        user?.CODUSU ??
        user?.CODUSUINC ??
        0,
    };

    const data = await service.criarOp(body);
    return res.status(201).json(data);
  }

  static async listarOpsDaMaquina(req: Request, res: Response) {
    const data = await service.listarOpsDaMaquina(req.params);
    return res.json(data);
  }

  static async moverPrioridadeOp(req: Request, res: Response) {
    const data = await service.moverPrioridade(req.params, req.body);
    return res.json(data);
  }

  static async aceitarOp(req: Request, res: Response) {
    const user: any = (req as any).user;

    const body = {
      ...req.body,
      codexec:
        req.body?.codexec ??
        user?.codigo ??
        user?.CODIGO ??
        user?.CODUSU ??
        null,
    };

    const data = await service.aceitarOp(req.params, body);
    return res.json(data);
  }

  static async redimensionarLoteOp(req: Request, res: Response) {
    const data = await service.redimensionarLote(req.params, req.body);
    return res.json(data);
  }

  static async cancelarOp(req: Request, res: Response) {
    const data = await service.cancelarOp(req.params);
    return res.json(data);
  }

  static async suspenderOp(req: Request, res: Response) {
    const data = await service.suspenderOp(req.params);
    return res.json(data);
  }

  static async iniciarAtividadeOp(req: Request, res: Response) {
    const user: any = (req as any).user;

    const body = {
      ...req.body,
      codexec:
        req.body?.codexec ??
        user?.codigo ??
        user?.CODIGO ??
        user?.CODUSU ??
        null,
    };

    const data = await service.iniciarAtividade(req.params, body);
    return res.json(data);
  }

  static async finalizarAtividadeOp(req: Request, res: Response) {
    const user: any = (req as any).user;

    const body = {
      ...req.body,
      codexec:
        req.body?.codexec ??
        user?.codigo ??
        user?.CODIGO ??
        user?.CODUSU ??
        null,
    };

    const data = await service.finalizarAtividade(req.params, body);
    return res.json(data);
  }
}