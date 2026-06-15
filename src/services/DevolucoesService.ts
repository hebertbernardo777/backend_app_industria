import oracledb from "oracledb";
import { withConnection } from "../infra/oracleClient.js";
import { EtiquetasRepository } from "../repositories/EtiquetasRepository.js";
import type { StatusEtiqueta } from "../domain/StatusEtiqueta.js";
import { ean13From12 } from "../utils/barcode.js";

export class ServiceError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "ServiceError";
    this.statusCode = statusCode;
  }
}

type SN = "S" | "N";
type TipoLancamento = "E" | "S" | "R";

type LancarConferenciaInput = {
  seq: number;
  codProd: number;
  codUsu: number;
  tipoLancamento: TipoLancamento;
  quantidade: number;
  peso?: number | null;
  codBarra?: string | null;
  gerouNovaEtiqueta?: SN;
  codProdRefugo?: number | null;
  obs?: string | null;
};

type ItemSaldoRow = {
  SEQ: number;
  CODPROD: number;
  QTD_DEVOLUCAO: number;
  QTD_CONFERIDA: number;
  QTD_PENDENTE: number;
};

type ContextoEtiquetaRow = {
  CODEMP: number | null;
};

type EtiquetaGeradaInfo = {
  sequenciaEtiquetaNova: number;
  codBarra: string;
  codBarraGs1: string | null;
};

export class DevolucoesService {
  private etiquetasRepository = new EtiquetasRepository();

  async listarPendentes() {
    return withConnection(async (conn) => {
      const result = await conn.execute(
        `
        SELECT
          D.SEQ,
          D.NUNOTA,
          D.STATUS_CONF,
          CAB.DTNEG,
          PAR.NOMEPARC AS CLIENTE,
          COUNT(DISTINCT P.CODPROD) AS QTDITENS,
          NVL(SUM(P.QTDNEG), 0) AS QTDNEG,
          NVL((
            SELECT SUM(C.QTDNEG)
            FROM AD_CONFERENCIADEV C
            WHERE C.SEQ = D.SEQ
          ), 0) AS QTDCONFERIDA
        FROM AD_DEVOLUCOES D
        LEFT JOIN AD_PRODUTOSDEV P
          ON P.SEQ = D.SEQ
        LEFT JOIN TGFCAB CAB
          ON CAB.NUNOTA = D.NUNOTA
        LEFT JOIN TGFPAR PAR
          ON PAR.CODPARC = CAB.CODPARC
        WHERE NVL(D.STATUS_CONF, 'P') <> 'C'
        GROUP BY
          D.SEQ,
          D.NUNOTA,
          D.STATUS_CONF,
          CAB.DTNEG,
          PAR.NOMEPARC
        HAVING NVL(SUM(P.QTDNEG), 0) >
               NVL((
                 SELECT SUM(C.QTDNEG)
                 FROM AD_CONFERENCIADEV C
                 WHERE C.SEQ = D.SEQ
               ), 0)
        ORDER BY D.SEQ DESC
        `,
        {},
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      return result.rows ?? [];
    });
  }

  async listarItens(seq: number) {
    return withConnection(async (conn) => {
      const existe = await conn.execute(
        `
        SELECT 1
        FROM AD_DEVOLUCOES
        WHERE SEQ = :SEQ
          AND ROWNUM = 1
        `,
        { SEQ: seq },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      if (!existe.rows || existe.rows.length === 0) {
        throw new ServiceError(`Devolução não encontrada para o SEQ ${seq}.`, 404);
      }

      const result = await conn.execute(
        `
        SELECT
          P.SEQ,
          P.CODPROD,
          PRO.DESCRPROD,
          PRO.REFERENCIA,
          PRO.CODVOL AS UNIDADE,
          P.QTDNEG,
          NVL((
            SELECT SUM(C.QTDNEG)
            FROM AD_CONFERENCIADEV C
            WHERE C.SEQ = P.SEQ
              AND C.CODPROD = P.CODPROD
          ), 0) AS QTDCONFERIDA,
          (
            P.QTDNEG - NVL((
              SELECT SUM(C.QTDNEG)
              FROM AD_CONFERENCIADEV C
              WHERE C.SEQ = P.SEQ
                AND C.CODPROD = P.CODPROD
            ), 0)
          ) AS QTDPENDENTE
        FROM AD_PRODUTOSDEV P
        LEFT JOIN TGFPRO PRO
          ON PRO.CODPROD = P.CODPROD
        WHERE P.SEQ = :SEQ
        ORDER BY PRO.DESCRPROD
        `,
        { SEQ: seq },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      return result.rows ?? [];
    });
  }

  async listarEtiquetasGeradas(seq: number) {
    return withConnection(async (conn) => {
      const result = await conn.execute(
        `
        SELECT
          C.SEQCONFDEV,
          C.SEQ,
          C.CODPROD,
          C.SEQUENCIA_ETIQUETA_NOVA,
          E.CODBARRA,
          E.CODBARRAGS1,
          E.DATA,
          E.TURNO,
          E.PESO,
          E.OBS
        FROM AD_CONFERENCIADEV C
        INNER JOIN AD_ETIQUETAS E
          ON E.SEQUENCIA = C.SEQUENCIA_ETIQUETA_NOVA
        WHERE C.SEQ = :SEQ
          AND C.GEROU_NOVA_ETIQUETA = 'S'
          AND C.SEQUENCIA_ETIQUETA_NOVA IS NOT NULL
        ORDER BY C.SEQCONFDEV
        `,
        { SEQ: seq },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      return result.rows ?? [];
    });
  }

  private normalizeTipoLancamento(value: unknown): TipoLancamento {
    const tipo = String(value ?? "").trim().toUpperCase();

    if (tipo === "E" || tipo === "ETIQUETA") return "E";
    if (tipo === "S" || tipo === "SEM_ETIQUETA") return "S";
    if (tipo === "R" || tipo === "REFUGO") return "R";

    throw new ServiceError(
      "TIPO_LANCAMENTO inválido. Use E, S, R ou ETIQUETA, SEM_ETIQUETA, REFUGO.",
      400
    );
  }

  private normalizeSN(value: unknown, fallback: SN = "N"): SN {
    const v = String(value ?? fallback).trim().toUpperCase();
    return v === "S" ? "S" : "N";
  }

  private async nextSeqConfDev(conn: oracledb.Connection): Promise<number> {
    const result = await conn.execute<{ SEQCONFDEV: number }>(
      `
      SELECT NVL(MAX(SEQCONFDEV), 0) + 1 AS SEQCONFDEV
      FROM AD_CONFERENCIADEV
      `,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const row = result.rows?.[0] as any;
    return Number(row?.SEQCONFDEV ?? 1);
  }

  private async getItemSaldo(
    conn: oracledb.Connection,
    seq: number,
    codProd: number
  ): Promise<ItemSaldoRow> {
    const result = await conn.execute<ItemSaldoRow>(
      `
      SELECT
        P.SEQ,
        P.CODPROD,
        P.QTDNEG AS QTD_DEVOLUCAO,
        NVL((
          SELECT SUM(C.QTDNEG)
          FROM AD_CONFERENCIADEV C
          WHERE C.SEQ = P.SEQ
            AND C.CODPROD = P.CODPROD
        ), 0) AS QTD_CONFERIDA,
        (
          P.QTDNEG - NVL((
            SELECT SUM(C.QTDNEG)
            FROM AD_CONFERENCIADEV C
            WHERE C.SEQ = P.SEQ
              AND C.CODPROD = P.CODPROD
          ), 0)
        ) AS QTD_PENDENTE
      FROM AD_PRODUTOSDEV P
      WHERE P.SEQ = :SEQ
        AND P.CODPROD = :CODPROD
      `,
      { SEQ: seq, CODPROD: codProd },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const row = result.rows?.[0] as any;

    if (!row) {
      throw new ServiceError(
        `Produto ${codProd} não encontrado na devolução ${seq}.`,
        404
      );
    }

    return {
      SEQ: Number(row.SEQ),
      CODPROD: Number(row.CODPROD),
      QTD_DEVOLUCAO: Number(row.QTD_DEVOLUCAO ?? 0),
      QTD_CONFERIDA: Number(row.QTD_CONFERIDA ?? 0),
      QTD_PENDENTE: Number(row.QTD_PENDENTE ?? 0),
    };
  }

  private async validarEtiquetaDuplicada(
    conn: oracledb.Connection,
    seq: number,
    codBarra: string
  ) {
    const result = await conn.execute(
      `
      SELECT 1
      FROM AD_CONFERENCIADEV
      WHERE SEQ = :SEQ
        AND TRIM(CODBARRA) = TRIM(:CODBARRA)
        AND ROWNUM = 1
      `,
      { SEQ: seq, CODBARRA: codBarra },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if ((result.rows?.length ?? 0) > 0) {
      throw new ServiceError(
        `A etiqueta ${codBarra} já foi lançada nesta devolução.`,
        400
      );
    }
  }

  private async getContextoEtiqueta(
    conn: oracledb.Connection,
    seq: number
  ): Promise<ContextoEtiquetaRow> {
    const result = await conn.execute<ContextoEtiquetaRow>(
      `
      SELECT
        CAB.CODEMP
      FROM AD_DEVOLUCOES D
      LEFT JOIN TGFCAB CAB
        ON CAB.NUNOTA = D.NUNOTA
      WHERE D.SEQ = :SEQ
        AND ROWNUM = 1
      `,
      { SEQ: seq },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const row = result.rows?.[0] as any;
    return {
      CODEMP: row?.CODEMP != null ? Number(row.CODEMP) : 1,
    };
  }

  private buildCodBarraNovaEtiqueta(sequencia: number): string {
    const base12 = String(sequencia).padStart(12, "0").slice(-12);
    return ean13From12(base12);
  }

  private async criarNovaEtiquetaSemEtiqueta(
    conn: oracledb.Connection,
    params: {
      seq: number;
      codProd: number;
      codUsu: number;
      quantidade: number;
      obs?: string | null;
    }
  ): Promise<EtiquetaGeradaInfo> {
    const { seq, codProd, codUsu, quantidade, obs } = params;

    const contexto = await this.getContextoEtiqueta(conn, seq);
    const seqEtiquetaNova = await this.etiquetasRepository.nextSequencia(conn);
    const qtdPct = await this.etiquetasRepository.findQtdPctByCodProd(
      codProd,
      conn
    );
    const codBarraGs1 = await this.etiquetasRepository.findGs1ByCodProd(
      codProd,
      conn
    );

    const codBarra = this.buildCodBarraNovaEtiqueta(seqEtiquetaNova);
    const statusEtiqueta = "DISPONIVEL" as StatusEtiqueta;

    await this.etiquetasRepository.insert(
      {
        SEQUENCIA: seqEtiquetaNova,
        DATA: new Date(),
        TURNO: null,

        CODEMP: Number(contexto.CODEMP ?? 1),
        CODFUNC: codUsu,
        CODPROD: codProd,
        CODWCP: null,

        PESO: null,
        OBS:
          obs ??
          `Etiqueta gerada automaticamente pela conferência da devolução ${seq}.`,

        CODBARRA: codBarra,
        CODBARRAGS1: codBarraGs1 ?? codBarra,

        OP: null,
        TAMLOTE: quantidade,
        UNLOTE: quantidade,
        AVULSA: "S",
        PCT: qtdPct,

        REFUGO: null,
        RETRABALHO: null,

        CODIGOCARROPROD: null,
        TARACARRO: null,

        STATUS_ETIQUETA: statusEtiqueta,
        ID_RETRABALHO_ORIGEM: null,
        ID_RETRABALHO_DEST: null,
        REIMPRESSAO: 0,
      },
      conn
    );

    return {
      sequenciaEtiquetaNova: seqEtiquetaNova,
      codBarra,
      codBarraGs1: codBarraGs1 ?? codBarra,
    };
  }

  private getTipoLancamentoDescricao(tipo: TipoLancamento) {
    if (tipo === "E") return "ETIQUETA";
    if (tipo === "S") return "SEM_ETIQUETA";
    return "REFUGO";
  }

  async concluirDevolucao(seq: number, codUsu: number) {
    return withConnection(async (conn) => {
      try {
        if (!Number.isFinite(seq) || seq <= 0) {
          throw new ServiceError("SEQ inválido.", 400);
        }

        if (!Number.isFinite(codUsu) || codUsu <= 0) {
          throw new ServiceError("CODUSU inválido.", 400);
        }

        const existe = await conn.execute(
          `
          SELECT
            SEQ,
            NVL(STATUS_CONF, 'P') AS STATUS_CONF
          FROM AD_DEVOLUCOES
          WHERE SEQ = :SEQ
            AND ROWNUM = 1
          `,
          { SEQ: seq },
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        const row = existe.rows?.[0] as any;

        if (!row) {
          throw new ServiceError(`Devolução não encontrada para o SEQ ${seq}.`, 404);
        }

        if (String(row.STATUS_CONF) === "C") {
          throw new ServiceError("Esta devolução já está concluída.", 400);
        }

        const pendencias = await conn.execute(
          `
          SELECT COUNT(1) AS QTD
          FROM (
            SELECT
              P.CODPROD,
              (
                P.QTDNEG - NVL((
                  SELECT SUM(C.QTDNEG)
                  FROM AD_CONFERENCIADEV C
                  WHERE C.SEQ = P.SEQ
                    AND C.CODPROD = P.CODPROD
                ), 0)
              ) AS QTDPENDENTE
            FROM AD_PRODUTOSDEV P
            WHERE P.SEQ = :SEQ
          )
          WHERE QTDPENDENTE > 0
          `,
          { SEQ: seq },
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        const qtdPendencias = Number((pendencias.rows?.[0] as any)?.QTD ?? 0);

        if (qtdPendencias > 0) {
          throw new ServiceError(
            "Ainda existem itens pendentes. Não é possível concluir a devolução.",
            400
          );
        }

        await conn.execute(
          `
          UPDATE AD_DEVOLUCOES
          SET
            STATUS_CONF = 'C',
            DHCONCLUSAO_CONF = :DHCONCLUSAO_CONF,
            CODUSUCONCLUSAO = :CODUSUCONCLUSAO
          WHERE SEQ = :SEQ
          `,
          {
            SEQ: seq,
            DHCONCLUSAO_CONF: new Date(),
            CODUSUCONCLUSAO: codUsu,
          },
          { autoCommit: false }
        );

        await conn.commit();

        return {
          ok: true,
          message: "Devolução concluída com sucesso.",
          data: {
            seq,
            statusConf: "C",
            codUsuConclusao: codUsu,
          },
        };
      } catch (error) {
        try {
          await conn.rollback();
        } catch {
          // ignore rollback error
        }
        throw error;
      }
    });
  }

  async lancarConferencia(input: LancarConferenciaInput) {
    return withConnection(async (conn) => {
      try {
        const seq = Number(input.seq);
        const codProd = Number(input.codProd);
        const codUsu = Number(input.codUsu);
        const quantidade = Number(input.quantidade);

        if (!Number.isFinite(seq) || seq <= 0) {
          throw new ServiceError("SEQ inválido.", 400);
        }

        if (!Number.isFinite(codProd) || codProd <= 0) {
          throw new ServiceError("CODPROD inválido.", 400);
        }

        if (!Number.isFinite(codUsu) || codUsu <= 0) {
          throw new ServiceError("CODUSU inválido.", 400);
        }

        if (!Number.isFinite(quantidade) || quantidade <= 0) {
          throw new ServiceError("Quantidade inválida.", 400);
        }

        const tipoLancamento = this.normalizeTipoLancamento(input.tipoLancamento);
        const gerouNovaEtiqueta = this.normalizeSN(input.gerouNovaEtiqueta, "N");
        const codBarra = input.codBarra ? String(input.codBarra).trim() : null;
        const obs = input.obs ? String(input.obs).trim() : null;
        const peso =
          input.peso == null || input.peso === ("" as any)
            ? null
            : Number(input.peso);
        const codProdRefugo =
          input.codProdRefugo == null || input.codProdRefugo === ("" as any)
            ? null
            : Number(input.codProdRefugo);

        const existeDev = await conn.execute(
          `
          SELECT 1
          FROM AD_DEVOLUCOES
          WHERE SEQ = :SEQ
            AND ROWNUM = 1
          `,
          { SEQ: seq },
          { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (!existeDev.rows || existeDev.rows.length === 0) {
          throw new ServiceError(`Devolução não encontrada para o SEQ ${seq}.`, 404);
        }

        const saldo = await this.getItemSaldo(conn, seq, codProd);

        if (saldo.QTD_PENDENTE <= 0) {
          throw new ServiceError(
            `O produto ${codProd} não possui saldo pendente nesta devolução.`,
            400
          );
        }

        if (quantidade > saldo.QTD_PENDENTE) {
          throw new ServiceError(
            `Quantidade informada (${quantidade}) é maior que o saldo pendente (${saldo.QTD_PENDENTE}).`,
            400
          );
        }

        let refugo: SN = "N";
        let sequenciaEtiquetaNova: number | null = null;
        let etiquetaGerada: EtiquetaGeradaInfo | null = null;

        if (tipoLancamento === "E") {
          if (!codBarra) {
            throw new ServiceError(
              "CODBARRA é obrigatório para lançamento do tipo ETIQUETA.",
              400
            );
          }

          await this.validarEtiquetaDuplicada(conn, seq, codBarra);

          if (gerouNovaEtiqueta === "S") {
            throw new ServiceError(
              "Lançamento do tipo ETIQUETA não deve gerar nova etiqueta.",
              400
            );
          }

          if (codProdRefugo != null) {
            throw new ServiceError(
              "CODPROD_REFUGO deve ser nulo para lançamento do tipo ETIQUETA.",
              400
            );
          }
        }

        if (tipoLancamento === "S") {
          if (codBarra) {
            throw new ServiceError(
              "CODBARRA não deve ser informado para lançamento do tipo SEM_ETIQUETA.",
              400
            );
          }

          if (codProdRefugo != null) {
            throw new ServiceError(
              "CODPROD_REFUGO deve ser nulo para lançamento do tipo SEM_ETIQUETA.",
              400
            );
          }

          if (gerouNovaEtiqueta === "S") {
            etiquetaGerada = await this.criarNovaEtiquetaSemEtiqueta(conn, {
              seq,
              codProd,
              codUsu,
              quantidade,
              obs,
            });

            sequenciaEtiquetaNova = etiquetaGerada.sequenciaEtiquetaNova;
          }
        }

        if (tipoLancamento === "R") {
          refugo = "S";

          if (!Number.isFinite(codProdRefugo) || (codProdRefugo ?? 0) <= 0) {
            throw new ServiceError(
              "CODPROD_REFUGO é obrigatório para lançamento do tipo REFUGO.",
              400
            );
          }

          if (!Number.isFinite(peso) || (peso ?? 0) <= 0) {
            throw new ServiceError(
              "PESO é obrigatório e deve ser maior que zero para lançamento do tipo REFUGO.",
              400
            );
          }

          if (codBarra) {
            throw new ServiceError(
              "CODBARRA não deve ser informado para lançamento do tipo REFUGO.",
              400
            );
          }

          if (gerouNovaEtiqueta === "S") {
            throw new ServiceError(
              "Lançamento do tipo REFUGO não deve gerar nova etiqueta.",
              400
            );
          }
        }

        const seqConfDev = await this.nextSeqConfDev(conn);

        await conn.execute(
          `
          INSERT INTO AD_CONFERENCIADEV (
            SEQ,
            SEQCONFDEV,
            CODPROD,
            CODPROD_REFUGO,
            CODUSU,
            QTDNEG,
            DHCONF,
            OBS,
            REFUGO,
            PESO,
            CODBARRA,
            TIPO_LANCAMENTO,
            GEROU_NOVA_ETIQUETA,
            SEQUENCIA_ETIQUETA_NOVA
          ) VALUES (
            :SEQ,
            :SEQCONFDEV,
            :CODPROD,
            :CODPROD_REFUGO,
            :CODUSU,
            :QTDNEG,
            :DHCONF,
            :OBS,
            :REFUGO,
            :PESO,
            :CODBARRA,
            :TIPO_LANCAMENTO,
            :GEROU_NOVA_ETIQUETA,
            :SEQUENCIA_ETIQUETA_NOVA
          )
          `,
          {
            SEQ: seq,
            SEQCONFDEV: seqConfDev,
            CODPROD: codProd,
            CODPROD_REFUGO: codProdRefugo,
            CODUSU: codUsu,
            QTDNEG: quantidade,
            DHCONF: new Date(),
            OBS: obs,
            REFUGO: refugo,
            PESO: peso,
            CODBARRA: codBarra,
            TIPO_LANCAMENTO: tipoLancamento,
            GEROU_NOVA_ETIQUETA: gerouNovaEtiqueta,
            SEQUENCIA_ETIQUETA_NOVA: sequenciaEtiquetaNova,
          },
          { autoCommit: false }
        );

        const saldoApos = await this.getItemSaldo(conn, seq, codProd);

        await conn.commit();

        return {
          ok: true,
          message: "Lançamento realizado com sucesso.",
          data: {
            seq,
            seqConfDev,
            codProd,
            tipoLancamento,
            tipoLancamentoDescricao: this.getTipoLancamentoDescricao(tipoLancamento),
            quantidade,
            saldoAntes: saldo.QTD_PENDENTE,
            saldoApos: saldoApos.QTD_PENDENTE,
            qtdConferidaApos: saldoApos.QTD_CONFERIDA,
            etiquetaGerada,
          },
        };
      } catch (error) {
        try {
          await conn.rollback();
        } catch {
          // ignore rollback error
        }
        throw error;
      }
    });
  }
}