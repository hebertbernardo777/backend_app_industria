// src/services/EtiquetasService.ts
import { EtiquetasRepository } from "../repositories/EtiquetasRepository.js";

function toDateOrNull(v: any): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(+d) ? null : d;
}

// Retorna "YYYY-MM-DD" (string) ou null
function parseDateParam(v: any): string | null {
  if (!v) return null;
  const s = String(v).trim();

  // YYYY-MM-DD
  const m1 = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m1) {
    const [, y, mm, dd] = m1;
    return `${y}-${mm}-${dd}`;
  }

  // DD/MM/YYYY
  const m2 = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (m2) {
    const [, dd, mm, y] = m2;
    return `${y}-${mm}-${dd}`;
  }

  return null;
}

export class EtiquetasService {
  constructor(private repo = new EtiquetasRepository()) {}

  async listar(params: any) {
    const f: {
      sequencia?: number;
      sequencias?: number[];
      dataStr?: string;
      fromStr?: string;
      toStr?: string;
    } = {};

    if (params.sequencia != null) f.sequencia = Number(params.sequencia);

    if (params.sequencias) {
      f.sequencias = String(params.sequencias)
        .split(",")
        .map((s: string) => Number(s.trim()))
        .filter((n: number) => Number.isFinite(n));
    }

    const dataStr = parseDateParam(params.data);
    if (params.data && !dataStr) throw new Error("Parâmetro 'data' inválido. Use YYYY-MM-DD ou DD/MM/YYYY.");
    if (dataStr) f.dataStr = dataStr;

    const fromStr = parseDateParam(params.from);
    if (params.from && !fromStr) throw new Error("Parâmetro 'from' inválido. Use YYYY-MM-DD ou DD/MM/YYYY.");
    if (fromStr) f.fromStr = fromStr;

    const toStrBase = parseDateParam(params.to);
    if (params.to && !toStrBase) throw new Error("Parâmetro 'to' inválido. Use YYYY-MM-DD ou DD/MM/YYYY.");
    if (toStrBase) f.toStr = toStrBase; // < TO_DATE(:toStr) + 1 (feito no repo)

    return this.repo.findMany(f);
  }

  async obter(sequencia: number) {
    if (!Number.isFinite(sequencia)) throw new Error("sequencia inválida");
    const row = await this.repo.findOne(sequencia);
    if (!row) throw Object.assign(new Error("não encontrado"), { status: 404 });
    return row;
  }

  async criar(body: any) {
    const DATA = toDateOrNull(body?.DATA) ?? new Date();
    const CODEMP = Number(body?.CODEMP);
    const CODFUNC = Number(body?.CODFUNC);
    const CODPROD = Number(body?.CODPROD);

    if (!Number.isFinite(CODEMP) || !Number.isFinite(CODFUNC) || !Number.isFinite(CODPROD)) {
      throw new Error("CODEMP, CODFUNC e CODPROD precisam ser numéricos.");
    }

    const novo = {
      DATA,
      TURNO: body?.TURNO ?? null,
      CODEMP,
      CODFUNC,
      CODPROD,
      PESO: body?.PESO != null ? Number(body.PESO) : null,
      OBS: body?.OBS ?? null,
      CODBARRA: body?.CODBARRA ?? null,
    };

    const seq = await this.repo.insert(novo as any);
    return { SEQUENCIA: seq };
  }

  async atualizar(sequencia: number, body: any) {
    if (!Number.isFinite(sequencia)) throw new Error("sequencia inválida");

    const patch: any = {};
    if ("DATA" in body) {
      const d = toDateOrNull(body.DATA);
      if (!d) throw new Error("DATA inválida");
      patch.DATA = d;
    }
    if ("TURNO" in body) patch.TURNO = body.TURNO ?? null;
    if ("CODEMP" in body) {
      const n = Number(body.CODEMP);
      if (!Number.isFinite(n)) throw new Error("CODEMP inválido");
      patch.CODEMP = n;
    }
    if ("CODFUNC" in body) {
      const n = Number(body.CODFUNC);
      if (!Number.isFinite(n)) throw new Error("CODFUNC inválido");
      patch.CODFUNC = n;
    }
    if ("CODPROD" in body) {
      const n = Number(body.CODPROD);
      if (!Number.isFinite(n)) throw new Error("CODPROD inválido");
      patch.CODPROD = n;
    }
    if ("PESO" in body) {
      patch.PESO = body.PESO != null ? Number(body.PESO) : null;
      if (patch.PESO != null && !Number.isFinite(patch.PESO)) throw new Error("PESO inválido");
    }
    if ("OBS" in body) patch.OBS = body.OBS ?? null;
    if ("CODBARRA" in body) patch.CODBARRA = body.CODBARRA ?? null;

    const affected = await this.repo.update(sequencia, patch);
    if (!affected) throw Object.assign(new Error("não encontrado"), { status: 404 });
    return { ok: true, rowsAffected: affected };
  }

  async remover(sequencia: number) {
    if (!Number.isFinite(sequencia)) throw new Error("sequencia inválida");
    const affected = await this.repo.remove(sequencia);
    if (!affected) throw Object.assign(new Error("não encontrado"), { status: 404 });
    return { ok: true, rowsAffected: affected };
  }
}
