import oracledb from "oracledb";
import { withConnection } from "../infra/oracleClient.js";

type SN = "S" | "N";

export type InserirConferenciaDevInput = {
  SEQ: number;
  CODBARRA?: string | null;
  CODPROD?: number | null;
  REFUGO?: SN | null;
  PESO?: number | null;
  QTDNEG?: number | null;
};

export type InserirConferenciaDevOutput = {
  SEQ: number;
  SEQCONFDEV: number;
  CODPROD: number;
  CODBARRA: string | null;
  REFUGO: SN;
  PESO: number | null;
  QTDNEG: number;
  origem: "CODBARRA" | "CODPROD";
};

class ServiceError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "ServiceError";
    this.statusCode = statusCode;
  }
}

type ExisteRow = {
  EXISTE: number;
};

type SeqRow = {
  NEXTSEQ: number;
};

type EtiquetaRow = {
  CODPROD: number;
  PESO: number | null;
  PCT: number | null;
  CODBARRA: string;
};

function firstRow<T>(result: oracledb.Result<any>): T | null {
  const rows = (result.rows ?? []) as T[];
  return rows.length > 0 ? rows[0] : null;
}

export class ConferenciaDevService {
  async inserir(
    input: InserirConferenciaDevInput
  ): Promise<InserirConferenciaDevOutput> {
    const SEQ = Number(input.SEQ);
    const CODBARRA = this.normalizarTexto(input.CODBARRA);
    const CODPROD =
      input.CODPROD !== undefined && input.CODPROD !== null
        ? Number(input.CODPROD)
        : null;

    const REFUGO: SN = input.REFUGO === "S" ? "S" : "N";

    const PESO =
      input.PESO !== undefined &&
      input.PESO !== null &&
      Number.isFinite(Number(input.PESO))
        ? Number(input.PESO)
        : null;

    const QTDNEG_INFORMADO =
      input.QTDNEG !== undefined &&
      input.QTDNEG !== null &&
      Number.isFinite(Number(input.QTDNEG))
        ? Number(input.QTDNEG)
        : null;

    if (!Number.isFinite(SEQ) || SEQ <= 0) {
      throw new ServiceError("SEQ inválido.");
    }

    if ((!CODBARRA && !CODPROD) || (CODBARRA && CODPROD)) {
      throw new ServiceError("Informe somente CODBARRA ou somente CODPROD.");
    }

    return withConnection(async (conn) => {
      try {
        await this.validarDevolucaoExiste(conn, SEQ);

        const SEQCONFDEV = await this.obterProximoSeqConfDev(conn);

        if (CODBARRA) {
          await this.validarCodBarraNaoConferido(conn, SEQ, CODBARRA);

          const etiqueta = await this.buscarEtiqueta(conn, CODBARRA);

          await this.validarProdutoNaDevolucao(conn, SEQ, etiqueta.CODPROD);

          const qtdneg = Number(etiqueta.PCT ?? 0);
          const peso = etiqueta.PESO !== null ? Number(etiqueta.PESO) : null;

          if (!Number.isFinite(qtdneg) || qtdneg <= 0) {
            throw new ServiceError(
              `Etiqueta ${CODBARRA} sem PCT válido em AD_ETIQUETAS.`
            );
          }

          await conn.execute(
            `
            INSERT INTO AD_CONFERENCIADEV
              (SEQ, SEQCONFDEV, CODPROD, CODBARRA, REFUGO, PESO, QTDNEG)
            VALUES
              (:SEQ, :SEQCONFDEV, :CODPROD, :CODBARRA, :REFUGO, :PESO, :QTDNEG)
            `,
            {
              SEQ,
              SEQCONFDEV,
              CODPROD: etiqueta.CODPROD,
              CODBARRA,
              REFUGO,
              PESO: peso,
              QTDNEG: qtdneg,
            },
            { autoCommit: false }
          );

          await conn.commit();

          return {
            SEQ,
            SEQCONFDEV,
            CODPROD: etiqueta.CODPROD,
            CODBARRA,
            REFUGO,
            PESO: peso,
            QTDNEG: qtdneg,
            origem: "CODBARRA",
          };
        }

        await this.validarProdutoNaDevolucao(conn, SEQ, CODPROD!);

        const qtdneg = QTDNEG_INFORMADO ?? 1;

        if (!Number.isFinite(qtdneg) || qtdneg <= 0) {
          throw new ServiceError("QTDNEG inválido para lançamento manual.");
        }

        await conn.execute(
          `
          INSERT INTO AD_CONFERENCIADEV
            (SEQ, SEQCONFDEV, CODPROD, CODBARRA, REFUGO, PESO, QTDNEG)
          VALUES
            (:SEQ, :SEQCONFDEV, :CODPROD, NULL, :REFUGO, :PESO, :QTDNEG)
          `,
          {
            SEQ,
            SEQCONFDEV,
            CODPROD,
            REFUGO,
            PESO,
            QTDNEG: qtdneg,
          },
          { autoCommit: false }
        );

        await conn.commit();

        return {
          SEQ,
          SEQCONFDEV,
          CODPROD: CODPROD!,
          CODBARRA: null,
          REFUGO,
          PESO,
          QTDNEG: qtdneg,
          origem: "CODPROD",
        };
      } catch (error) {
        try {
          await conn.rollback();
        } catch {}
        throw error;
      }
    });
  }

  private normalizarTexto(value?: string | null): string | null {
    if (!value) return null;
    const s = String(value).trim();
    return s.length ? s : null;
  }

  private async validarDevolucaoExiste(
    conn: oracledb.Connection,
    SEQ: number
  ): Promise<void> {
    const result = await conn.execute(
      `
      SELECT 1 AS EXISTE
      FROM AD_DEVOLUCOES
      WHERE SEQ = :SEQ
        AND ROWNUM = 1
      `,
      { SEQ },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const row = firstRow<ExisteRow>(result);

    if (!row) {
      throw new ServiceError(`Devolução não encontrada para o SEQ ${SEQ}.`, 404);
    }
  }

  private async obterProximoSeqConfDev(
    conn: oracledb.Connection
  ): Promise<number> {
    const result = await conn.execute(
      `
      SELECT NVL(MAX(SEQCONFDEV), 0) + 1 AS NEXTSEQ
      FROM AD_CONFERENCIADEV
      `,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const row = firstRow<SeqRow>(result);

    return Number(row?.NEXTSEQ ?? 1);
  }

  private async buscarEtiqueta(
    conn: oracledb.Connection,
    CODBARRA: string
  ): Promise<EtiquetaRow> {
    const result = await conn.execute(
      `
      SELECT
        CODPROD,
        PESO,
        PCT,
        CODBARRA
      FROM AD_ETIQUETAS
      WHERE TRIM(CODBARRA) = TRIM(:CODBARRA)
        AND ROWNUM = 1
      `,
      { CODBARRA },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const row = firstRow<EtiquetaRow>(result);

    if (!row) {
      throw new ServiceError(
        `Código de barras ${CODBARRA} não encontrado em AD_ETIQUETAS.`,
        404
      );
    }

    return row;
  }

  private async validarProdutoNaDevolucao(
    conn: oracledb.Connection,
    SEQ: number,
    CODPROD: number
  ): Promise<void> {
    const result = await conn.execute(
      `
      SELECT 1 AS EXISTE
      FROM AD_PRODUTOSDEV
      WHERE SEQ = :SEQ
        AND CODPROD = :CODPROD
        AND ROWNUM = 1
      `,
      { SEQ, CODPROD },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const row = firstRow<ExisteRow>(result);

    if (!row) {
      throw new ServiceError(
        `Produto ${CODPROD} não pertence aos itens da devolução SEQ ${SEQ}.`
      );
    }
  }

  private async validarCodBarraNaoConferido(
    conn: oracledb.Connection,
    SEQ: number,
    CODBARRA: string
  ): Promise<void> {
    const result = await conn.execute(
      `
      SELECT 1 AS EXISTE
      FROM AD_CONFERENCIADEV
      WHERE SEQ = :SEQ
        AND TRIM(CODBARRA) = TRIM(:CODBARRA)
        AND ROWNUM = 1
      `,
      { SEQ, CODBARRA },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const row = firstRow<ExisteRow>(result);

    if (row) {
      throw new ServiceError(
        `O código de barras ${CODBARRA} já foi conferido para o SEQ ${SEQ}.`
      );
    }
  }
}