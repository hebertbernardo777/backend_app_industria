import oracledb from "oracledb";
import { getPool } from "../infra/oracleClient.js";
import { StatusEtiqueta } from "../domain/StatusEtiqueta.js";

export type SN = "S" | "N";

export type EtiquetaInsert = {
  SEQUENCIA: number;
  DATA: Date;
  TURNO: string | null;

  CODEMP: number;
  CODFUNC: number;
  CODPROD: number;
  CODWCP: number | null;

  PESO: number | null;
  OBS: string | null;

  CODBARRA: string;
  CODBARRAGS1: string;

  OP: number | null;
  TAMLOTE: number | null;
  UNLOTE: number | null;
  AVULSA: SN;
  PCT: number | null;

  REFUGO: SN | null;
  CAUSAREFUGO?: string | null;
  RETRABALHO: SN | null;

  CODIGOCARROPROD: number | null;
  TARACARRO: number | null;

  STATUS_ETIQUETA: StatusEtiqueta;
  ID_RETRABALHO_ORIGEM?: number | null;
  ID_RETRABALHO_DEST?: number | null;
  REIMPRESSAO?: number | null;
};

type FindManyFilters = {
  sequencia?: number;
  sequencias?: number[];
  dataStr?: string;
  fromStr?: string;
  toStr?: string;
  op?: number;
  codwcp?: number;
  limit?: number;
  ultimasHoras?: number;
};

// Altere aqui caso o nome real da sua tabela de log seja diferente.
const TABELA_LOG_REIMPRESSAO = "AD_LOGREIMP";

export type InsertLogReimpressaoInput = {
  NUREIMP: number;
  SEQUENCIA: number;
  TURNO: "A" | "B" | "C" | string;
  JUSTIFICATIVA: "1" | "2" | "3" | string;
  NOME: string;
};

export type RelatorioFimTurnoFiltro = {
  dataStr: string;
  turno?: string | null;
  maquina?: string | null;
};

export type OpcaoCampo = {
  valor: string;
  opcao: string;
};

export class EtiquetasRepository {
  async getConnection() {
    const pool = await getPool();
    return pool.getConnection();
  }

  private async exec<T = any>(
    sql: string,
    binds: Record<string, any> = {},
    connection?: oracledb.Connection,
    options: oracledb.ExecuteOptions = {}
  ) {
    const conn = connection ?? (await this.getConnection());
    const ownsConnection = !connection;

    try {
      const result = await conn.execute(sql, binds, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        autoCommit: ownsConnection,
        ...options,
      });
      return result as oracledb.Result<T>;
    } catch (error: any) {
      console.error("========== ORACLE ERROR | EtiquetasRepository ==========");
      console.error("MESSAGE:", error?.message);
      console.error("ERROR NUM:", error?.errorNum);
      console.error("OFFSET:", error?.offset);
      console.error("SQL:");
      console.error(sql);
      console.error("BINDS:");
      console.error(JSON.stringify(binds, null, 2));
      console.error("========================================================");
      throw error;
    } finally {
      if (ownsConnection) {
        await conn.close();
      }
    }
  }

  async nextSequencia(connection?: oracledb.Connection): Promise<number> {
    const sql = `
      SELECT NVL(MAX(SEQUENCIA), 0) + 1 AS SEQ
      FROM AD_ETIQUETAS
    `;
    const result = await this.exec<{ SEQ: number }>(sql, {}, connection);
    const row = result.rows?.[0] as any;
    return Number(row?.SEQ ?? 1);
  }

  async existsByCodigoBarra(
    codBarra: string,
    connection?: oracledb.Connection
  ): Promise<boolean> {
    const sql = `
      SELECT 1 AS EXISTE
      FROM AD_ETIQUETAS
      WHERE TRIM(CODBARRA) = TRIM(:CODBARRA)
        AND ROWNUM = 1
    `;

    const result = await this.exec<{ EXISTE: number }>(
      sql,
      { CODBARRA: codBarra },
      connection
    );

    return (result.rows?.length ?? 0) > 0;
  }

  async findMany(filters: FindManyFilters, connection?: oracledb.Connection) {
    const where: string[] = [];
    const binds: Record<string, any> = {};

    if (filters.sequencia != null) {
      where.push("E.SEQUENCIA = :SEQUENCIA");
      binds.SEQUENCIA = filters.sequencia;
    }

    if (filters.sequencias?.length) {
      const bindNames = filters.sequencias.map((_, i) => `SEQ${i}`);
      where.push(`E.SEQUENCIA IN (${bindNames.map((n) => `:${n}`).join(", ")})`);
      filters.sequencias.forEach((n, i) => {
        binds[`SEQ${i}`] = n;
      });
    }

    if (filters.op != null) {
      where.push("E.OP = :OP");
      binds.OP = filters.op;
    }

    if (filters.codwcp != null) {
      where.push("E.CODWCP = :CODWCP");
      binds.CODWCP = filters.codwcp;
    }

    if (filters.ultimasHoras != null) {
      where.push("E.DATA >= SYSDATE - (:ULTIMASHORAS / 24)");
      binds.ULTIMASHORAS = filters.ultimasHoras;
    }

    if (filters.dataStr) {
      where.push("TRUNC(E.DATA) = TO_DATE(:DATASTR, 'YYYY-MM-DD')");
      binds.DATASTR = filters.dataStr;
    }

    if (filters.fromStr) {
      where.push("TRUNC(E.DATA) >= TO_DATE(:FROMSTR, 'YYYY-MM-DD')");
      binds.FROMSTR = filters.fromStr;
    }

    if (filters.toStr) {
      where.push("TRUNC(E.DATA) <= TO_DATE(:TOSTR, 'YYYY-MM-DD')");
      binds.TOSTR = filters.toStr;
    }

    const baseSql = `
      SELECT
        E.SEQUENCIA,
        E.DATA,
        E.TURNO,
        E.CODEMP,
        E.CODFUNC,
        E.CODPROD,
        E.CODWCP,
        P.DESCRPROD AS DESCRICAO,
        E.PESO,
        E.OBS,
        E.CODBARRA,
        E.CODBARRAGS1,
        E.OP,
        E.TAMLOTE,
        E.UNLOTE,
        E.AVULSA,
        E.PCT,
        E.REFUGO,
        E.CAUSAREFUGO,
        E.RETRABALHO,
        E.CODIGOCARROPROD,
        E.TARACARRO,
        E.STATUS_ETIQUETA,
        E.ID_RETRABALHO_ORIGEM,
        E.ID_RETRABALHO_DEST,
        NVL(E.REIMPRESSAO, 0) AS REIMPRESSAO
      FROM AD_ETIQUETAS E
      LEFT JOIN TGFPRO P
        ON P.CODPROD = E.CODPROD
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY E.DATA DESC, E.SEQUENCIA DESC
    `;

    let sql = baseSql;

    if (filters.limit != null) {
      binds.LIMIT = filters.limit;
      sql = `
        SELECT *
        FROM (${baseSql})
        WHERE ROWNUM <= :LIMIT
      `;
    }

    const result = await this.exec(sql, binds, connection);
    return result.rows ?? [];
  }

  async findQtdPctByCodProd(
    codProd: number,
    connection?: oracledb.Connection
  ): Promise<number | null> {
    const sql = `
      SELECT AD_QTDPCT
      FROM TGFPRO
      WHERE CODPROD = :CODPROD
        AND ROWNUM = 1
    `;

    const result = await this.exec<{ AD_QTDPCT: number }>(
      sql,
      { CODPROD: codProd },
      connection
    );

    const row = result.rows?.[0] as any;
    return row?.AD_QTDPCT != null ? Number(row.AD_QTDPCT) : null;
  }

  async findOne(sequencia: number, connection?: oracledb.Connection) {
    const sql = `
      SELECT
        E.SEQUENCIA,
        E.DATA,
        E.TURNO,
        E.CODEMP,
        E.CODFUNC,
        E.CODPROD,
        E.CODWCP,
        P.DESCRPROD AS DESCRICAO,
        E.PESO,
        E.OBS,
        E.CODBARRA,
        E.CODBARRAGS1,
        E.OP,
        E.TAMLOTE,
        E.UNLOTE,
        E.AVULSA,
        E.PCT,
        E.REFUGO,
        E.CAUSAREFUGO,
        E.RETRABALHO,
        E.CODIGOCARROPROD,
        E.TARACARRO,
        E.STATUS_ETIQUETA,
        E.ID_RETRABALHO_ORIGEM,
        E.ID_RETRABALHO_DEST,
        NVL(E.REIMPRESSAO, 0) AS REIMPRESSAO
      FROM AD_ETIQUETAS E
      LEFT JOIN TGFPRO P
        ON P.CODPROD = E.CODPROD
      WHERE E.SEQUENCIA = :SEQUENCIA
    `;

    const result = await this.exec(sql, { SEQUENCIA: sequencia }, connection);
    return result.rows?.[0] ?? null;
  }

  async findByCodigoBarra(codBarra: string, connection?: oracledb.Connection) {
    const sql = `
      SELECT
        E.SEQUENCIA,
        E.DATA,
        E.TURNO,
        E.CODEMP,
        E.CODFUNC,
        E.CODPROD,
        E.CODWCP,
        P.DESCRPROD AS DESCRICAO,
        E.PESO,
        E.OBS,
        E.CODBARRA,
        E.CODBARRAGS1,
        E.OP,
        E.TAMLOTE,
        E.UNLOTE,
        E.AVULSA,
        E.PCT,
        E.REFUGO,
        E.CAUSAREFUGO,
        E.RETRABALHO,
        E.CODIGOCARROPROD,
        E.TARACARRO,
        E.STATUS_ETIQUETA,
        E.ID_RETRABALHO_ORIGEM,
        E.ID_RETRABALHO_DEST,
        NVL(E.REIMPRESSAO, 0) AS REIMPRESSAO
      FROM AD_ETIQUETAS E
      LEFT JOIN TGFPRO P
        ON P.CODPROD = E.CODPROD
      WHERE TRIM(E.CODBARRA) = TRIM(:CODBARRA)
    `;

    const result = await this.exec(sql, { CODBARRA: codBarra }, connection);
    return result.rows?.[0] ?? null;
  }

  async findGs1ByCodProd(
    codProd: number,
    connection?: oracledb.Connection
  ): Promise<string | null> {
    const sql = `
      SELECT CODBARRA
      FROM TGFBAR
      WHERE CODPROD = :CODPROD
        AND ROWNUM = 1
    `;

    const result = await this.exec<{ CODBARRA: string }>(
      sql,
      { CODPROD: codProd },
      connection
    );

    const row = result.rows?.[0] as any;
    return row?.CODBARRA ? String(row.CODBARRA).trim() : null;
  }

  async findOpcoesCausaRefugo(
    connection?: oracledb.Connection
  ): Promise<OpcaoCampo[]> {
    const sql = `
      SELECT
        VALOR AS "valor",
        OPCAO AS "opcao"
      FROM TDDOPC
      WHERE NUCAMPO = (
        SELECT NUCAMPO
        FROM TDDCAM
        WHERE NOMETAB = 'AD_ETIQUETAS'
          AND NOMECAMPO = 'CAUSAREFUGO'
      )
      ORDER BY VALOR
    `;

    const result = await this.exec<OpcaoCampo>(sql, {}, connection);
    return (result.rows ?? []) as OpcaoCampo[];
  }

  async findPesoPadraoEtiquetaByCodProd(
    codProd: number,
    pctInformado?: number | null,
    connection?: oracledb.Connection
  ): Promise<number> {
    const sql = `
      SELECT
        NVL(:PCT, NVL(AD_QTDPCT, 1)) * NVL(PESOLIQ, 0) AS PESO_PADRAO
      FROM TGFPRO
      WHERE CODPROD = :CODPROD
        AND ROWNUM = 1
    `;
  
    const result = await this.exec<{ PESO_PADRAO: number }>(
      sql,
      {
        CODPROD: codProd,
        PCT: pctInformado ?? null,
      },
      connection
    );
  
    const row = result.rows?.[0] as any;
    const peso = Number(row?.PESO_PADRAO ?? 0);
  
    return Number.isFinite(peso) ? peso : 0;
  }

  async insert(input: EtiquetaInsert, connection?: oracledb.Connection): Promise<number> {
    const sql = `
      INSERT INTO AD_ETIQUETAS (
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
        REFUGO,
        CAUSAREFUGO,
        RETRABALHO,
        CODIGOCARROPROD,
        TARACARRO,
        STATUS_ETIQUETA,
        ID_RETRABALHO_ORIGEM,
        ID_RETRABALHO_DEST,
        REIMPRESSAO
      ) VALUES (
        :SEQUENCIA,
        :DATA,
        :TURNO,
        :CODEMP,
        :CODFUNC,
        :CODPROD,
        :CODWCP,
        :PESO,
        :OBS,
        :CODBARRA,
        :CODBARRAGS1,
        :OP,
        :TAMLOTE,
        :UNLOTE,
        :AVULSA,
        :PCT,
        :REFUGO,
        :CAUSAREFUGO,
        :RETRABALHO,
        :CODIGOCARROPROD,
        :TARACARRO,
        :STATUS_ETIQUETA,
        :ID_RETRABALHO_ORIGEM,
        :ID_RETRABALHO_DEST,
        :REIMPRESSAO
      )
    `;

    await this.exec(
      sql,
      {
        SEQUENCIA: input.SEQUENCIA,
        DATA: input.DATA,
        TURNO: input.TURNO,
        CODEMP: input.CODEMP,
        CODFUNC: input.CODFUNC,
        CODPROD: input.CODPROD,
        CODWCP: input.CODWCP,
        PESO: input.PESO,
        OBS: input.OBS,
        CODBARRA: input.CODBARRA,
        CODBARRAGS1: input.CODBARRAGS1,
        OP: input.OP,
        TAMLOTE: input.TAMLOTE,
        UNLOTE: input.UNLOTE,
        AVULSA: input.AVULSA,
        PCT: input.PCT,
        REFUGO: input.REFUGO,
        CAUSAREFUGO: input.CAUSAREFUGO ?? null,
        RETRABALHO: input.RETRABALHO,
        CODIGOCARROPROD: input.CODIGOCARROPROD,
        TARACARRO: input.TARACARRO,
        STATUS_ETIQUETA: input.STATUS_ETIQUETA,
        ID_RETRABALHO_ORIGEM: input.ID_RETRABALHO_ORIGEM ?? null,
        ID_RETRABALHO_DEST: input.ID_RETRABALHO_DEST ?? null,
        REIMPRESSAO: input.REIMPRESSAO ?? 0,
      },
      connection
    );

    return input.SEQUENCIA;
  }

  async update(sequencia: number, patch: Record<string, any>, connection?: oracledb.Connection) {
    const keys = Object.keys(patch);
    if (!keys.length) return 0;

    const setSql = keys.map((k) => `${k} = :${k}`).join(", ");
    const sql = `
      UPDATE AD_ETIQUETAS
      SET ${setSql}
      WHERE SEQUENCIA = :SEQUENCIA
    `;

    const result = await this.exec(sql, { ...patch, SEQUENCIA: sequencia }, connection);
    return result.rowsAffected ?? 0;
  }

  async updateStatus(
    sequencia: number,
    status: StatusEtiqueta,
    extras?: { idRetrabalhoOrigem?: number | null; idRetrabalhoDest?: number | null },
    connection?: oracledb.Connection
  ) {
    const patch: Record<string, any> = {
      STATUS_ETIQUETA: status,
    };

    if (extras && "idRetrabalhoOrigem" in extras) {
      patch.ID_RETRABALHO_ORIGEM = extras.idRetrabalhoOrigem ?? null;
    }

    if (extras && "idRetrabalhoDest" in extras) {
      patch.ID_RETRABALHO_DEST = extras.idRetrabalhoDest ?? null;
    }

    return this.update(sequencia, patch, connection);
  }

  async incrementReimpressao(sequencia: number, connection?: oracledb.Connection) {
    const sql = `
      UPDATE AD_ETIQUETAS
      SET REIMPRESSAO = NVL(REIMPRESSAO, 0) + 1
      WHERE SEQUENCIA = :SEQUENCIA
    `;

    const result = await this.exec(sql, { SEQUENCIA: sequencia }, connection);
    return result.rowsAffected ?? 0;
  }

  async nextNuReimp(connection: oracledb.Connection): Promise<number> {
    // Obrigatório usar a mesma conexão/transação do insertLogReimpressao.
    // O lock evita que duas reimpressões simultâneas gerem o mesmo NUREIMP.
    await this.exec(
      `LOCK TABLE ${TABELA_LOG_REIMPRESSAO} IN EXCLUSIVE MODE`,
      {},
      connection
    );

    const sql = `
      SELECT NVL(MAX(NUREIMP), 0) + 1 AS NUREIMP
      FROM ${TABELA_LOG_REIMPRESSAO}
    `;

    const result = await this.exec<{ NUREIMP: number }>(sql, {}, connection);
    const row = result.rows?.[0] as any;
    const nureimp = Number(row?.NUREIMP ?? 0);

    if (!Number.isFinite(nureimp) || nureimp <= 0) {
      throw new Error("Não foi possível gerar o próximo NUREIMP.");
    }

    return nureimp;
  }

  async insertLogReimpressao(
    input: InsertLogReimpressaoInput,
    connection: oracledb.Connection
  ): Promise<number> {
    const sql = `
      INSERT INTO ${TABELA_LOG_REIMPRESSAO} (
        NUREIMP,
        SEQUENCIA,
        DATA,
        TURNO,
        JUSTIFICATIVA,
        NOME
      ) VALUES (
        :NUREIMP,
        :SEQUENCIA,
        SYSTIMESTAMP,
        :TURNO,
        :JUSTIFICATIVA,
        :NOME
      )
    `;

    const result = await this.exec(
      sql,
      {
        NUREIMP: input.NUREIMP,
        SEQUENCIA: input.SEQUENCIA,
        TURNO: input.TURNO,
        JUSTIFICATIVA: input.JUSTIFICATIVA,
        NOME: input.NOME,
      },
      connection
    );

    return result.rowsAffected ?? 0;
  }

  async relatorioFimTurno(
    filtro: RelatorioFimTurnoFiltro,
    connection?: oracledb.Connection
  ) {
    const binds = {
      dataStr: filtro.dataStr,
      turno: filtro.turno ?? null,
      maquina: filtro.maquina ?? null,
    };

    const sqlDetalhes = `
      WITH PRODUCAO AS (
        SELECT
          TRUNC(E.DATA) AS DIA,
          NVL(E.TURNO, 'SEM TURNO') AS TURNO,

          E.CODWCP,
          NVL(WCP.NOME, 'Máquina ' || TO_CHAR(E.CODWCP)) AS NOME_MAQUINA,

          E.CODPROD,
          PRO.DESCRPROD,

          COUNT(*) AS PACOTES_PRODUZIDOS,

          SUM(NVL(E.PCT, NVL(PRO.AD_QTDPCT, 1))) AS TOTAL_BARRAS,

          SUM(
            NVL(E.PCT, NVL(PRO.AD_QTDPCT, 1)) * NVL(PRO.PESOLIQ, 0)
          ) AS TOTAL_KG_PADRAO,

          MAX(NVL(E.PCT, NVL(PRO.AD_QTDPCT, 1))) AS BARRAS_POR_PACOTE,
          MAX(NVL(PRO.PESOLIQ, 0)) AS PESO_BARRA_KG

        FROM AD_ETIQUETAS E
        LEFT JOIN TGFPRO PRO
          ON PRO.CODPROD = E.CODPROD
        LEFT JOIN TPRWCP WCP
          ON WCP.CODWCP = E.CODWCP
        WHERE E.DATA >= TO_DATE(:dataStr, 'YYYY-MM-DD')
          AND E.DATA < TO_DATE(:dataStr, 'YYYY-MM-DD') + 1
          AND (:turno IS NULL OR E.TURNO = :turno)
          AND (:maquina IS NULL OR TO_CHAR(E.CODWCP) = :maquina)
          AND NVL(E.REFUGO, 'N') <> 'S'
          AND NVL(E.RETRABALHO, 'N') <> 'S'
        GROUP BY
          TRUNC(E.DATA),
          NVL(E.TURNO, 'SEM TURNO'),
          E.CODWCP,
          NVL(WCP.NOME, 'Máquina ' || TO_CHAR(E.CODWCP)),
          E.CODPROD,
          PRO.DESCRPROD
      ),
      REIMPRESSOES AS (
        SELECT
          TRUNC(CAST(R.DATA AS DATE)) AS DIA,
          NVL(R.TURNO, 'SEM TURNO') AS TURNO,

          E.CODWCP,
          E.CODPROD,

          COUNT(*) AS REIMPRESSOES
        FROM ${TABELA_LOG_REIMPRESSAO} R
        INNER JOIN AD_ETIQUETAS E
          ON E.SEQUENCIA = R.SEQUENCIA
        WHERE R.DATA >= CAST(TO_DATE(:dataStr, 'YYYY-MM-DD') AS TIMESTAMP)
          AND R.DATA < CAST(TO_DATE(:dataStr, 'YYYY-MM-DD') + 1 AS TIMESTAMP)
          AND (:turno IS NULL OR R.TURNO = :turno)
          AND (:maquina IS NULL OR TO_CHAR(E.CODWCP) = :maquina)
        GROUP BY
          TRUNC(CAST(R.DATA AS DATE)),
          NVL(R.TURNO, 'SEM TURNO'),
          E.CODWCP,
          E.CODPROD
      )
      SELECT
        TO_CHAR(P.DIA, 'YYYY-MM-DD') AS DATA,
        P.TURNO,

        P.CODWCP,
        P.NOME_MAQUINA,

        P.CODPROD,
        P.DESCRPROD,

        P.PACOTES_PRODUZIDOS,
        P.TOTAL_BARRAS,
        ROUND(P.TOTAL_KG_PADRAO, 3) AS TOTAL_KG_PADRAO,

        P.BARRAS_POR_PACOTE,
        P.PESO_BARRA_KG,

        NVL(R.REIMPRESSOES, 0) AS REIMPRESSOES,
        P.PACOTES_PRODUZIDOS + NVL(R.REIMPRESSOES, 0) AS TOTAL_ETIQUETAS_IMPRESSAS

      FROM PRODUCAO P
      LEFT JOIN REIMPRESSOES R
        ON R.DIA = P.DIA
       AND R.TURNO = P.TURNO
       AND NVL(R.CODWCP, -1) = NVL(P.CODWCP, -1)
       AND R.CODPROD = P.CODPROD
      ORDER BY
        P.TURNO,
        P.CODWCP,
        P.DESCRPROD
    `;

    const sqlLogsReimpressao = `
      SELECT
        R.NUREIMP,
        R.SEQUENCIA,
        TO_CHAR(CAST(R.DATA AS DATE), 'YYYY-MM-DD HH24:MI:SS') AS DATA_REIMPRESSAO,
        NVL(R.TURNO, 'SEM TURNO') AS TURNO,

        R.JUSTIFICATIVA,
        CASE R.JUSTIFICATIVA
          WHEN '1' THEN 'Problemas na impressora'
          WHEN '2' THEN 'Perda da etiqueta'
          WHEN '3' THEN 'Outros'
          ELSE 'Não informado'
        END AS DESCR_JUSTIFICATIVA,

        R.NOME,

        E.CODWCP,
        NVL(WCP.NOME, 'Máquina ' || TO_CHAR(E.CODWCP)) AS NOME_MAQUINA,

        E.CODPROD,
        PRO.DESCRPROD,

        E.CODBARRA,
        E.CODBARRAGS1,
        E.OP,
        E.PCT,

        NVL(PRO.AD_QTDPCT, 1) AS AD_QTDPCT,
        NVL(PRO.PESOLIQ, 0) AS PESO_BARRA_KG,

        NVL(E.PCT, NVL(PRO.AD_QTDPCT, 1)) AS BARRAS_POR_PACOTE,

        ROUND(
          NVL(E.PCT, NVL(PRO.AD_QTDPCT, 1)) * NVL(PRO.PESOLIQ, 0),
          3
        ) AS KG_REFERENCIA_PACOTE

      FROM ${TABELA_LOG_REIMPRESSAO} R
      INNER JOIN AD_ETIQUETAS E
        ON E.SEQUENCIA = R.SEQUENCIA
      LEFT JOIN TGFPRO PRO
        ON PRO.CODPROD = E.CODPROD
      LEFT JOIN TPRWCP WCP
        ON WCP.CODWCP = E.CODWCP
      WHERE R.DATA >= CAST(TO_DATE(:dataStr, 'YYYY-MM-DD') AS TIMESTAMP)
        AND R.DATA < CAST(TO_DATE(:dataStr, 'YYYY-MM-DD') + 1 AS TIMESTAMP)
        AND (:turno IS NULL OR R.TURNO = :turno)
        AND (:maquina IS NULL OR TO_CHAR(E.CODWCP) = :maquina)
      ORDER BY
        R.DATA,
        R.NUREIMP
    `;

    const detalhesResult = await this.exec(sqlDetalhes, binds, connection);
    const logsResult = await this.exec(sqlLogsReimpressao, binds, connection);

    const detalhes = (detalhesResult.rows ?? []) as any[];
    const logsReimpressao = (logsResult.rows ?? []) as any[];

    const soma = (rows: any[], field: string) =>
      rows.reduce((total, row) => total + Number(row?.[field] ?? 0), 0);

    const groupBy = (
      rows: any[],
      getKey: (row: any) => string,
      buildBase: (row: any) => any
    ) => {
      const map = new Map<string, any>();

      for (const row of rows) {
        const key = getKey(row);
        const current = map.get(key) ?? buildBase(row);

        current.PACOTES_PRODUZIDOS += Number(row.PACOTES_PRODUZIDOS ?? 0);
        current.TOTAL_BARRAS += Number(row.TOTAL_BARRAS ?? 0);
        current.TOTAL_KG_PADRAO += Number(row.TOTAL_KG_PADRAO ?? 0);
        current.REIMPRESSOES += Number(row.REIMPRESSOES ?? 0);
        current.TOTAL_ETIQUETAS_IMPRESSAS += Number(row.TOTAL_ETIQUETAS_IMPRESSAS ?? 0);

        map.set(key, current);
      }

      return Array.from(map.values()).map((item) => ({
        ...item,
        TOTAL_KG_PADRAO: Number(Number(item.TOTAL_KG_PADRAO ?? 0).toFixed(3)),
      }));
    };

    const porMaquina = groupBy(
      detalhes,
      (row) => `${row.DATA}|${row.TURNO}|${row.CODWCP ?? "SEM"}`,
      (row) => ({
        DATA: row.DATA,
        TURNO: row.TURNO,
        CODWCP: row.CODWCP,
        NOME_MAQUINA: row.NOME_MAQUINA,
        PACOTES_PRODUZIDOS: 0,
        TOTAL_BARRAS: 0,
        TOTAL_KG_PADRAO: 0,
        REIMPRESSOES: 0,
        TOTAL_ETIQUETAS_IMPRESSAS: 0,
      })
    );

    const porProduto = groupBy(
      detalhes,
      (row) => `${row.CODPROD}`,
      (row) => ({
        CODPROD: row.CODPROD,
        DESCRPROD: row.DESCRPROD,
        PACOTES_PRODUZIDOS: 0,
        TOTAL_BARRAS: 0,
        TOTAL_KG_PADRAO: 0,
        REIMPRESSOES: 0,
        TOTAL_ETIQUETAS_IMPRESSAS: 0,
      })
    );

    const porMaquinaProduto = groupBy(
      detalhes,
      (row) => `${row.CODWCP ?? "SEM"}|${row.CODPROD}`,
      (row) => ({
        CODWCP: row.CODWCP,
        NOME_MAQUINA: row.NOME_MAQUINA,
        CODPROD: row.CODPROD,
        DESCRPROD: row.DESCRPROD,
        PACOTES_PRODUZIDOS: 0,
        TOTAL_BARRAS: 0,
        TOTAL_KG_PADRAO: 0,
        REIMPRESSOES: 0,
        TOTAL_ETIQUETAS_IMPRESSAS: 0,
      })
    );

    const resumo = {
      DATA: filtro.dataStr,
      TURNO: filtro.turno ?? null,
      MAQUINA: filtro.maquina ?? null,

      PACOTES_PRODUZIDOS: soma(detalhes, "PACOTES_PRODUZIDOS"),
      TOTAL_BARRAS: soma(detalhes, "TOTAL_BARRAS"),
      TOTAL_KG_PADRAO: Number(soma(detalhes, "TOTAL_KG_PADRAO").toFixed(3)),

      REIMPRESSOES: logsReimpressao.length,
      TOTAL_ETIQUETAS_IMPRESSAS:
        soma(detalhes, "PACOTES_PRODUZIDOS") + logsReimpressao.length,
    };

    return {
      resumo,
      porMaquina,
      porProduto,
      porMaquinaProduto,
      detalhes,
      reimpressoes: {
        total: logsReimpressao.length,
        logs: logsReimpressao,
      },
    };
  }

  async remove(sequencia: number, connection?: oracledb.Connection) {
    const sql = `DELETE FROM AD_ETIQUETAS WHERE SEQUENCIA = :SEQUENCIA`;
    const result = await this.exec(sql, { SEQUENCIA: sequencia }, connection);
    return result.rowsAffected ?? 0;
  }
}

