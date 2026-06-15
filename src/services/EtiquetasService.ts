import { STATUS_ETIQUETA, isStatusEtiqueta } from "../domain/StatusEtiqueta.js";
import { EtiquetasRepository, SN } from "../repositories/EtiquetasRepository.js";
import { ean13From12 } from "../utils/barcode.js";
import oracledb from "oracledb";

function toDateOrNull(v: any): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(+d) ? null : d;
}

function parseDateParam(v: any): string | null {
  if (!v) return null;
  const s = String(v).trim();

  const m1 = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m1) {
    const [, y, mm, dd] = m1;
    return `${y}-${mm}-${dd}`;
  }

  const m2 = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (m2) {
    const [, dd, mm, y] = m2;
    return `${y}-${mm}-${dd}`;
  }

  return null;
}

function strOrNull(v: any): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function numOrNull(v: any): number | null {
  if (v == null || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function intOrNull(v: any): number | null {
  if (v == null || String(v).trim() === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (!Number.isInteger(n)) return null;
  return n;
}

function snOrNull(v: any): SN | null {
  if (v == null) return null;
  const s = String(v).trim().toUpperCase();
  if (s === "S" || s === "N") return s as SN;
  return null;
}

function turnoReimpressaoOrThrow(v: any): string {
  const s = String(v ?? "").trim().toUpperCase();
  if (s === "A" || s === "B" || s === "C") return s;
  throw new Error("TURNO inválido. Use A, B ou C.");
}

function justificativaReimpressaoOrThrow(v: any): string {
  const s = String(v ?? "").trim();
  if (s === "1" || s === "2" || s === "3") return s;
  throw new Error(
    "JUSTIFICATIVA inválida. Use '1' para Problemas na impressora, '2' para Perda da etiqueta ou '3' para Outros."
  );
}

function generateCodBarraFromSequencia(sequencia: number): string {
  const base12 = String(sequencia).padStart(12, "0").slice(-12);
  return ean13From12(base12);
}

function normalizarCodBarra(v: any): string {
  return String(v ?? "")
    .replace(/[\r\n\t]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

type ListarParams = {
  sequencia?: number;
  sequencias?: number[] | string;
  data?: string;
  from?: string;
  to?: string;
  op?: number;
  codwcp?: number;
  limit?: number;
  ultimasHoras?: number;
};

type CriarEtiquetaInput = {
  DATA?: Date | null;
  TURNO?: string | null;

  CODEMP: number;
  CODFUNC: number;
  CODPROD: number;
  CODWCP?: number | null;

  PESO?: number | null;
  OBS?: string | null;

  CODBARRA?: string | null;

  OP?: number | null;
  TAMLOTE?: number | null;
  UNLOTE?: number | null;
  AVULSA?: SN | null;
  PCT?: number | null;

  REFUGO?: SN | null;
  CAUSAREFUGO?: string | null;
  RETRABALHO?: SN | null;

  CODIGOCARROPROD?: number | null;
  TARACARRO?: number | null;

  STATUS_ETIQUETA?: string | null;
  ID_RETRABALHO_ORIGEM?: number | null;
  ID_RETRABALHO_DEST?: number | null;
  REIMPRESSAO?: number | null;
};

type CriarEtiquetasRetrabalhoDestinoInput = {
  CODEMP: number;
  CODFUNC: number;
  TURNO?: string | null;
  OBS?: string | null;
  ID_RETRABALHO_DEST: number;

  CODPROD: number;
  CODWCP?: number | null;
  QUANTIDADE: number;
  PESO?: number | null;

  OP?: number | null;
  UNLOTE?: number | null;
  TAMLOTE?: number | null;
  PCT?: number | null;
  REFUGO?: SN | null;
  CAUSAREFUGO?: string | null;
  CODIGOCARROPROD?: number | null;
  TARACARRO?: number | null;
};

type RegistrarReimpressaoInput = {
  TURNO: string;
  JUSTIFICATIVA: string;
  NOME: string;
};

type RelatorioFimTurnoParams = {
  data: string;
  turno?: string | null;
  maquina?: string | number | null;
};

export class EtiquetasService {
  constructor(private repo = new EtiquetasRepository()) {}

  async listarOpcoesCausaRefugo() {
    return this.repo.findOpcoesCausaRefugo();
  }

  async listar(params: ListarParams) {
    const f: {
      sequencia?: number;
      sequencias?: number[];
      dataStr?: string;
      fromStr?: string;
      toStr?: string;
      op?: number;
      codwcp?: number;
      limit?: number;
      ultimasHoras?: number;
    } = {};

    const sequencia = intOrNull(params.sequencia);
    if (params.sequencia != null && sequencia == null) {
      throw new Error("Parâmetro 'sequencia' inválido (use inteiro).");
    }
    if (sequencia != null) f.sequencia = sequencia;

    if (params.sequencias) {
      f.sequencias = String(params.sequencias)
        .split(",")
        .map((s: string) => Number(s.trim()))
        .filter((n: number) => Number.isFinite(n) && Number.isInteger(n));
    }

    const op = intOrNull(params.op);
    if (params.op != null && op == null) {
      throw new Error("Parâmetro 'op' inválido (use inteiro).");
    }
    if (op != null) f.op = op;

    const codwcp = intOrNull(params.codwcp);
    if (params.codwcp != null && codwcp == null) {
      throw new Error("Parâmetro 'codwcp' inválido (use inteiro).");
    }
    if (codwcp != null) f.codwcp = codwcp;

    const limit = intOrNull(params.limit);
    if (params.limit != null && (limit == null || limit <= 0)) {
      throw new Error("Parâmetro 'limit' inválido (use inteiro maior que zero).");
    }
    if (limit != null) {
      f.limit = Math.min(limit, 500);
    }

    const ultimasHoras = numOrNull(params.ultimasHoras);
    if (
      params.ultimasHoras != null &&
      (ultimasHoras == null || ultimasHoras <= 0)
    ) {
      throw new Error("Parâmetro 'ultimasHoras' inválido (use número maior que zero).");
    }
    if (ultimasHoras != null) {
      f.ultimasHoras = Math.min(ultimasHoras, 168);
    }

    const dataStr = parseDateParam(params.data);
    if (params.data && !dataStr) {
      throw new Error("Parâmetro 'data' inválido. Use YYYY-MM-DD ou DD/MM/YYYY.");
    }
    if (dataStr) f.dataStr = dataStr;

    const fromStr = parseDateParam(params.from);
    if (params.from && !fromStr) {
      throw new Error("Parâmetro 'from' inválido. Use YYYY-MM-DD ou DD/MM/YYYY.");
    }
    if (fromStr) f.fromStr = fromStr;

    const toStrBase = parseDateParam(params.to);
    if (params.to && !toStrBase) {
      throw new Error("Parâmetro 'to' inválido. Use YYYY-MM-DD ou DD/MM/YYYY.");
    }
    if (toStrBase) f.toStr = toStrBase;

    return this.repo.findMany(f);
  }

  async obter(sequencia: number, connection?: oracledb.Connection) {
    if (!Number.isFinite(sequencia)) throw new Error("sequencia inválida");

    const row = await this.repo.findOne(sequencia, connection);
    if (!row) throw Object.assign(new Error("não encontrado"), { status: 404 });

    return row;
  }

  async obterPorCodigoBarra(codBarra: string, connection?: oracledb.Connection) {
    const codigo = normalizarCodBarra(codBarra);
    if (!codigo) throw new Error("Código de barras inválido.");

    const row = await this.repo.findByCodigoBarra(codigo, connection);
    if (!row) throw Object.assign(new Error("não encontrado"), { status: 404 });

    return row;
  }

  async obterValidaParaRetrabalho(
    filtro: { SEQUENCIA?: number | null; CODBARRA?: string | null },
    connection?: oracledb.Connection
  ) {
    const sequencia = intOrNull(filtro.SEQUENCIA);
    const codigo = normalizarCodBarra(filtro.CODBARRA);

    let etiqueta: any = null;

    if (sequencia != null) {
      etiqueta = await this.repo.findOne(sequencia, connection);
    } else if (codigo) {
      etiqueta = await this.repo.findByCodigoBarra(codigo, connection);
    } else {
      throw new Error("Informe SEQUENCIA ou CODBARRA da etiqueta.");
    }

    if (!etiqueta) {
      throw new Error(`Etiqueta não encontrada: ${codigo || sequencia}`);
    }

    const statusAtual = String(etiqueta.STATUS_ETIQUETA ?? "")
      .trim()
      .toUpperCase();

    if (statusAtual !== STATUS_ETIQUETA.VALIDA) {
      throw new Error(
        `Etiqueta ${etiqueta.CODBARRA} não está válida para retrabalho. Status atual: ${etiqueta.STATUS_ETIQUETA}`
      );
    }

    return etiqueta;
  }

  async criar(input: CriarEtiquetaInput, connection?: oracledb.Connection) {
    const DATA = input.DATA ?? new Date();

    const CODEMP = Number(input.CODEMP);
    const CODFUNC = Number(input.CODFUNC);
    const CODPROD = Number(input.CODPROD);

    if (!Number.isFinite(CODEMP) || !Number.isFinite(CODFUNC) || !Number.isFinite(CODPROD)) {
      throw new Error("CODEMP, CODFUNC e CODPROD precisam ser numéricos.");
    }

    const CODWCP = intOrNull(input.CODWCP);
    const OP = intOrNull(input.OP);
    const UNLOTE = intOrNull(input.UNLOTE);
    const TAMLOTE = numOrNull(input.TAMLOTE);
    let PCT = numOrNull(input.PCT);

    if (input.PCT != null && PCT == null) {
      throw new Error("PCT inválido (use número).");
    }

    if (PCT == null) {
      PCT = await this.repo.findQtdPctByCodProd(CODPROD, connection);
    }

    let PESO = input.PESO != null ? Number(input.PESO) : null;
    const OBS = strOrNull(input.OBS);
    const TURNO = strOrNull(input.TURNO);

    const REFUGO = snOrNull(input.REFUGO);
    const CAUSAREFUGO = strOrNull(input.CAUSAREFUGO);
    const RETRABALHO = snOrNull(input.RETRABALHO);
    const CODIGOCARROPROD = intOrNull(input.CODIGOCARROPROD);
    const TARACARRO = numOrNull(input.TARACARRO);
    const REIMPRESSAO = intOrNull(input.REIMPRESSAO) ?? 0;

    if (input.CODWCP != null && CODWCP == null) {
      throw new Error("CODWCP inválido (use inteiro).");
    }

    if (input.OP != null && OP == null) {
      throw new Error("OP inválido (use inteiro).");
    }
    if (input.UNLOTE != null && UNLOTE == null) {
      throw new Error("UNLOTE inválido (use inteiro).");
    }
    if (input.TAMLOTE != null && TAMLOTE == null) {
      throw new Error("TAMLOTE inválido (use número).");
    }
    if (input.PCT != null && PCT == null) {
      throw new Error("PCT inválido (use número).");
    }

    if (PESO != null && !Number.isFinite(PESO)) {
      throw new Error("PESO inválido (use número).");
    }
    if (PESO == null || PESO <= 0) {
      PESO = await this.repo.findPesoPadraoEtiquetaByCodProd(
        CODPROD,
        PCT,
        connection
      );
    }

    if (input.REFUGO != null && REFUGO == null) {
      throw new Error("REFUGO inválido (use 'S' ou 'N').");
    }

    if (input.RETRABALHO != null && RETRABALHO == null) {
      throw new Error("RETRABALHO inválido (use 'S' ou 'N').");
    }

    if (input.CODIGOCARROPROD != null && CODIGOCARROPROD == null) {
      throw new Error("CODIGOCARROPROD inválido (use inteiro).");
    }

    if (input.TARACARRO != null && TARACARRO == null) {
      throw new Error("TARACARRO inválido (use número).");
    }

    if (REIMPRESSAO < 0) {
      throw new Error("REIMPRESSAO inválida.");
    }

    let AVULSA: SN = snOrNull(input.AVULSA) ?? (OP ? "N" : "S");
    if (!OP) AVULSA = "S";

    const STATUS = strOrNull(input.STATUS_ETIQUETA) ?? STATUS_ETIQUETA.VALIDA;
    if (!isStatusEtiqueta(STATUS)) {
      throw new Error("STATUS_ETIQUETA inválido.");
    }

    const SEQUENCIA = await this.repo.nextSequencia(connection);

    let CODBARRA: string;
    if (input.CODBARRA != null && String(input.CODBARRA).trim() !== "") {
      CODBARRA = normalizarCodBarra(input.CODBARRA);
    } else {
      CODBARRA = generateCodBarraFromSequencia(SEQUENCIA);
    }

    const codigoJaExiste = await this.repo.existsByCodigoBarra(CODBARRA, connection);
    if (codigoJaExiste) {
      throw new Error(`CODBARRA já existe: ${CODBARRA}`);
    }

    const gs1FromDb = await this.repo.findGs1ByCodProd(CODPROD, connection);
    const CODBARRAGS1 = gs1FromDb ?? CODBARRA;

    const seq = await this.repo.insert(
      {
        SEQUENCIA,
        DATA,
        TURNO,
        CODEMP,
        CODFUNC,
        CODPROD,
        CODWCP,
        PESO,
        OBS,
        CODBARRA,
        CODBARRAGS1,
        OP,
        TAMLOTE,
        UNLOTE,
        AVULSA,
        PCT,
        REFUGO: REFUGO ?? null,
        CAUSAREFUGO,
        RETRABALHO: RETRABALHO ?? null,
        CODIGOCARROPROD,
        TARACARRO,
        STATUS_ETIQUETA: STATUS,
        ID_RETRABALHO_ORIGEM: intOrNull(input.ID_RETRABALHO_ORIGEM),
        ID_RETRABALHO_DEST: intOrNull(input.ID_RETRABALHO_DEST),
        REIMPRESSAO,
      },
      connection
    );

    return {
      SEQUENCIA: seq,
      CODBARRA,
      CODBARRAGS1,
      AVULSA,
      REFUGO: REFUGO ?? null,
      CAUSAREFUGO,
      RETRABALHO: RETRABALHO ?? null,
      STATUS_ETIQUETA: STATUS,
      REIMPRESSAO,
    };
  }

  async criarEtiquetasRetrabalhoDestino(
    input: CriarEtiquetasRetrabalhoDestinoInput,
    connection?: oracledb.Connection
  ) {
    const CODEMP = Number(input.CODEMP);
    const CODFUNC = Number(input.CODFUNC);
    const CODPROD = Number(input.CODPROD);
    const QUANTIDADE = intOrNull(input.QUANTIDADE);
    const ID_RETRABALHO_DEST = intOrNull(input.ID_RETRABALHO_DEST);

    if (!Number.isFinite(CODEMP) || !Number.isFinite(CODFUNC) || !Number.isFinite(CODPROD)) {
      throw new Error("CODEMP, CODFUNC e CODPROD são obrigatórios.");
    }

    if (QUANTIDADE == null || QUANTIDADE <= 0) {
      throw new Error("QUANTIDADE inválida para criação das etiquetas de destino.");
    }

    if (ID_RETRABALHO_DEST == null || ID_RETRABALHO_DEST <= 0) {
      throw new Error("ID_RETRABALHO_DEST inválido.");
    }

    const dataGeracao = new Date();
    const result: Array<{
      SEQUENCIA: number;
      CODBARRA: string;
      CODBARRAGS1: string;
      CODPROD: number;
      PESO: number | null;
      STATUS_ETIQUETA: string;
      REIMPRESSAO: number;
      CAUSAREFUGO: string | null;
    }> = [];

    for (let i = 0; i < QUANTIDADE; i++) {
      const criado = await this.criar(
        {
          DATA: dataGeracao,
          TURNO: strOrNull(input.TURNO),
          CODEMP,
          CODFUNC,
          CODPROD,
          CODWCP: intOrNull(input.CODWCP),
          PESO: numOrNull(input.PESO),
          OBS: strOrNull(input.OBS),
          OP: intOrNull(input.OP),
          TAMLOTE: numOrNull(input.TAMLOTE),
          UNLOTE: intOrNull(input.UNLOTE),
          PCT: numOrNull(input.PCT),
          AVULSA: intOrNull(input.OP) ? "N" : "S",
          REFUGO: snOrNull(input.REFUGO),
          CAUSAREFUGO: strOrNull(input.CAUSAREFUGO),
          RETRABALHO: "S",
          CODIGOCARROPROD: intOrNull(input.CODIGOCARROPROD),
          TARACARRO: numOrNull(input.TARACARRO),
          STATUS_ETIQUETA: STATUS_ETIQUETA.VALIDA,
          ID_RETRABALHO_ORIGEM: null,
          ID_RETRABALHO_DEST,
          REIMPRESSAO: 0,
        },
        connection
      );

      result.push({
        SEQUENCIA: criado.SEQUENCIA,
        CODBARRA: criado.CODBARRA,
        CODBARRAGS1: criado.CODBARRAGS1,
        CODPROD,
        PESO: numOrNull(input.PESO),
        STATUS_ETIQUETA: criado.STATUS_ETIQUETA,
        REIMPRESSAO: criado.REIMPRESSAO,
        CAUSAREFUGO: criado.CAUSAREFUGO,
      });
    }

    return result;
  }

  async marcarComoRetrabalhada(
    sequencia: number,
    idRetrabalhoOrigem: number,
    connection?: oracledb.Connection
  ) {
    if (!Number.isFinite(sequencia)) throw new Error("sequencia inválida");
    if (!Number.isFinite(idRetrabalhoOrigem)) throw new Error("idRetrabalhoOrigem inválido");

    const affected = await this.repo.updateStatus(
      sequencia,
      STATUS_ETIQUETA.RETRABALHADA,
      { idRetrabalhoOrigem },
      connection
    );

    if (!affected) throw Object.assign(new Error("não encontrado"), { status: 404 });

    return { ok: true, rowsAffected: affected };
  }

  async incrementarReimpressao(
    sequencia: number,
    input: RegistrarReimpressaoInput,
    connection?: oracledb.Connection
  ) {
    const SEQUENCIA = intOrNull(sequencia);
    if (SEQUENCIA == null || SEQUENCIA <= 0) throw new Error("sequencia inválida");

    const TURNO = turnoReimpressaoOrThrow(input?.TURNO);
    const JUSTIFICATIVA = justificativaReimpressaoOrThrow(input?.JUSTIFICATIVA);
    const NOME = strOrNull(input?.NOME);

    if (!NOME) {
      throw new Error("NOME é obrigatório para registrar a reimpressão.");
    }

    const conn = connection ?? await oracledb.getConnection();

    try {
      const etiqueta = await this.repo.findOne(SEQUENCIA, conn);
      if (!etiqueta) throw Object.assign(new Error("não encontrado"), { status: 404 });

      const affected = await this.repo.incrementReimpressao(SEQUENCIA, conn);
      if (!affected) throw Object.assign(new Error("não encontrado"), { status: 404 });

      const NUREIMP = await this.repo.nextNuReimp(conn);

      await this.repo.insertLogReimpressao(
        {
          NUREIMP,
          SEQUENCIA,
          TURNO,
          JUSTIFICATIVA,
          NOME,
        },
        conn
      );

      const row = await this.repo.findOne(SEQUENCIA, conn);

      if (!connection) await conn.commit();

      return {
        ok: true,
        rowsAffected: affected,
        NUREIMP,
        SEQUENCIA,
        TURNO,
        JUSTIFICATIVA,
        NOME,
        REIMPRESSAO: Number((row as any)?.REIMPRESSAO ?? 0),
      };
    } catch (err) {
      if (!connection) await conn.rollback();
      throw err;
    } finally {
      if (!connection) await conn.close();
    }
  }

  async relatorioFimTurno(params: RelatorioFimTurnoParams) {
    const dataStr = parseDateParam(params.data);

    if (!dataStr) {
      throw new Error("Parâmetro 'data' inválido. Use YYYY-MM-DD ou DD/MM/YYYY.");
    }

    const turno = params.turno != null && String(params.turno).trim() !== ""
      ? turnoReimpressaoOrThrow(params.turno)
      : null;

    return this.repo.relatorioFimTurno({
      dataStr,
      turno,
      maquina: strOrNull(params.maquina),
    });
  }

  async atualizar(sequencia: number, body: any) {
    if (!Number.isFinite(sequencia)) throw new Error("sequencia inválida");

    const patch: any = {};

    if ("DATA" in body) {
      const d = toDateOrNull(body.DATA);
      if (!d) throw new Error("DATA inválida");
      patch.DATA = d;
    }

    if ("TURNO" in body) {
      patch.TURNO = strOrNull(body.TURNO);
    }

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

    const codprodChanged = "CODPROD" in body;
    if (codprodChanged) {
      const n = Number(body.CODPROD);
      if (!Number.isFinite(n)) throw new Error("CODPROD inválido");
      patch.CODPROD = n;
    }

    if ("PESO" in body) {
      patch.PESO = body.PESO != null ? Number(body.PESO) : null;
      if (patch.PESO != null && !Number.isFinite(patch.PESO)) {
        throw new Error("PESO inválido");
      }
    }

    if ("OBS" in body) {
      patch.OBS = strOrNull(body.OBS);
    }

    if ("CODBARRA" in body) {
      const v = normalizarCodBarra(body.CODBARRA);
      patch.CODBARRA = v ? v : null;

      if (patch.CODBARRA) {
        const exists = await this.repo.existsByCodigoBarra(patch.CODBARRA);
        const atual = await this.repo.findOne(sequencia);

        if (!atual) {
          throw Object.assign(new Error("não encontrado"), { status: 404 });
        }

        if (
          exists &&
          String((atual as any)?.CODBARRA ?? "").trim() !== String(patch.CODBARRA).trim()
        ) {
          throw new Error(`CODBARRA já existe: ${patch.CODBARRA}`);
        }
      }
    }

    if ("OP" in body) {
      const v = intOrNull(body.OP);
      if (body.OP != null && v == null) throw new Error("OP inválido (use inteiro).");
      patch.OP = v;
    }

    if ("UNLOTE" in body) {
      const v = intOrNull(body.UNLOTE);
      if (body.UNLOTE != null && v == null) throw new Error("UNLOTE inválido (use inteiro).");
      patch.UNLOTE = v;
    }

    if ("TAMLOTE" in body) {
      const v = numOrNull(body.TAMLOTE);
      if (body.TAMLOTE != null && v == null) throw new Error("TAMLOTE inválido (use número).");
      patch.TAMLOTE = v;
    }

    if ("AVULSA" in body) {
      const v = snOrNull(body.AVULSA);
      if (!v) throw new Error("AVULSA inválida (use 'S' ou 'N').");
      patch.AVULSA = v;
    }

    if ("PCT" in body) {
      const v = numOrNull(body.PCT);
      if (body.PCT != null && v == null) throw new Error("PCT inválido (use número).");
      patch.PCT = v;
    }

    if ("REFUGO" in body) {
      const v = snOrNull(body.REFUGO);
      if (body.REFUGO != null && !v) {
        throw new Error("REFUGO inválido (use 'S' ou 'N').");
      }
      patch.REFUGO = v;
    }

    if ("CAUSAREFUGO" in body) {
      patch.CAUSAREFUGO = strOrNull(body.CAUSAREFUGO);
    }

    if ("RETRABALHO" in body) {
      const v = snOrNull(body.RETRABALHO);
      if (body.RETRABALHO != null && !v) {
        throw new Error("RETRABALHO inválido (use 'S' ou 'N').");
      }
      patch.RETRABALHO = v;
    }

    if ("CODWCP" in body) {
      const v = intOrNull(body.CODWCP);
      if (body.CODWCP != null && v == null) {
        throw new Error("CODWCP inválido (use inteiro).");
      }
      patch.CODWCP = v;
    }

    if ("CODIGOCARROPROD" in body) {
      const v = intOrNull(body.CODIGOCARROPROD);
      if (body.CODIGOCARROPROD != null && v == null) {
        throw new Error("CODIGOCARROPROD inválido (use inteiro).");
      }
      patch.CODIGOCARROPROD = v;
    }

    if ("TARACARRO" in body) {
      const v = numOrNull(body.TARACARRO);
      if (body.TARACARRO != null && v == null) {
        throw new Error("TARACARRO inválido (use número).");
      }
      patch.TARACARRO = v;
    }

    if ("REIMPRESSAO" in body) {
      const v = intOrNull(body.REIMPRESSAO);
      if (body.REIMPRESSAO != null && v == null) {
        throw new Error("REIMPRESSAO inválida (use inteiro).");
      }
      if (v != null && v < 0) {
        throw new Error("REIMPRESSAO inválida.");
      }
      patch.REIMPRESSAO = v ?? 0;
    }

    if ("STATUS_ETIQUETA" in body) {
      const status = String(body.STATUS_ETIQUETA ?? "").trim().toUpperCase();
      if (!isStatusEtiqueta(status)) {
        throw new Error("STATUS_ETIQUETA inválido.");
      }
      patch.STATUS_ETIQUETA = status;
    }

    if ("ID_RETRABALHO_ORIGEM" in body) {
      patch.ID_RETRABALHO_ORIGEM = intOrNull(body.ID_RETRABALHO_ORIGEM);
    }

    if ("ID_RETRABALHO_DEST" in body) {
      patch.ID_RETRABALHO_DEST = intOrNull(body.ID_RETRABALHO_DEST);
    }

    const needsRead = ("OP" in patch) || ("AVULSA" in patch) || codprodChanged;
    let current: any = null;

    if (needsRead) {
      current = await this.repo.findOne(sequencia);
      if (!current) throw Object.assign(new Error("não encontrado"), { status: 404 });
    }

    const finalOP = ("OP" in patch) ? patch.OP : current?.OP ?? null;

    if (!finalOP) {
      patch.AVULSA = "S";
    } else if (!("AVULSA" in patch)) {
      patch.AVULSA = (current?.AVULSA as SN) ?? "N";
    }

    if ("CODBARRAGS1" in body) {
      const v = body.CODBARRAGS1 != null ? String(body.CODBARRAGS1).trim() : "";
      patch.CODBARRAGS1 = v ? v : null;
    } else if (codprodChanged) {
      const codprod = patch.CODPROD as number;
      const baseCodBarra =
        ("CODBARRA" in patch ? patch.CODBARRA : current?.CODBARRA) ?? null;

      const gs1FromDb = await this.repo.findGs1ByCodProd(codprod);
      patch.CODBARRAGS1 = gs1FromDb ?? baseCodBarra;
    }

    const affected = await this.repo.update(sequencia, patch);
    if (!affected) throw Object.assign(new Error("não encontrado"), { status: 404 });

    return { ok: true, rowsAffected: affected };
  }

  async atualizarStatus(sequencia: number, status: string) {
    if (!Number.isFinite(sequencia)) throw new Error("sequencia inválida");

    const statusNormalizado = String(status ?? "").trim().toUpperCase();
    if (!isStatusEtiqueta(statusNormalizado)) {
      throw new Error("STATUS_ETIQUETA inválido.");
    }

    const affected = await this.repo.updateStatus(sequencia, statusNormalizado);
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