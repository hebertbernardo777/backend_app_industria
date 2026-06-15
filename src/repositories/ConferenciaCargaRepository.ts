import oracledb from "oracledb";

type DbConnection = oracledb.Connection;
type SqlBindValue = string | number | null | Date;
type SqlBinds = Record<string, SqlBindValue>;

export type RegistrarEtiquetaConferidaDbInput = {
  seqOc: number;
  confEtq: number;
  nunota: number | null;
  codProd: number;
  codBarra: string;
  qtdEtiqueta: number;
  qtdPct: number | null;
};

export type BuscarProdutoNaCargaInput = {
  seqOc: number;
  codProd: number;
  nunota?: number | null;
};

export class ConferenciaCargaRepository {
  async listarCargasPorEquipe(conn: DbConnection, codEqpExp: number) {
    const sql = `
      SELECT
        c.SEQOC,
        c.CODEMP,
        c.ORDEMCARGA,
        c.CODEQPEXP,
        c.DHINCLUSAO,
        c.DTINICIO,
        c.CODUSU,
        c.STATUS,
        c.OBS,
        NVL((
          SELECT COUNT(*)
          FROM AD_CARGAPEDIDO p
          WHERE p.SEQOC = c.SEQOC
        ), 0) AS TOTAL_PEDIDOS,
        NVL((
          SELECT COUNT(*)
          FROM AD_CARGAITENS i
          WHERE i.SEQOC = c.SEQOC
        ), 0) AS TOTAL_ITENS,
        NVL((
          SELECT COUNT(*)
          FROM AD_CARGACONFETQ e
          WHERE e.SEQOC = c.SEQOC
        ), 0) AS TOTAL_ETIQUETAS_BIPADAS,
        NVL((
          SELECT SUM(NVL(i.QTDNEG, 0))
          FROM AD_CARGAITENS i
          WHERE i.SEQOC = c.SEQOC
        ), 0) AS QTD_PREVISTA_TOTAL,
        NVL((
          SELECT SUM(NVL(e.QTDETIQUETA, 0))
          FROM AD_CARGACONFETQ e
          WHERE e.SEQOC = c.SEQOC
        ), 0) AS QTD_CONFERIDA_TOTAL
      FROM AD_CONFCARGAELETRONICA c
      WHERE c.CODEQPEXP = :codEqpExp
      ORDER BY
        CASE NVL(c.STATUS, '1')
          WHEN '2' THEN 1
          WHEN '1' THEN 2
          WHEN '3' THEN 3
          ELSE 9
        END,
        c.ORDEMCARGA,
        c.SEQOC
    `;

    const result = await conn.execute(
      sql,
      { codEqpExp },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    return result.rows ?? [];
  }

  async buscarCarga(conn: DbConnection, seqOc: number) {
    const sql = `
      SELECT
        c.SEQOC,
        c.CODEMP,
        c.ORDEMCARGA,
        c.CODEQPEXP,
        c.DHINCLUSAO,
        c.DTINICIO,
        c.CODUSU,
        c.STATUS,
        c.OBS,
        NVL((
          SELECT COUNT(*)
          FROM AD_CARGAPEDIDO p
          WHERE p.SEQOC = c.SEQOC
        ), 0) AS TOTAL_PEDIDOS,
        NVL((
          SELECT COUNT(*)
          FROM AD_CARGAITENS i
          WHERE i.SEQOC = c.SEQOC
        ), 0) AS TOTAL_ITENS,
        NVL((
          SELECT COUNT(*)
          FROM AD_CARGACONFETQ e
          WHERE e.SEQOC = c.SEQOC
        ), 0) AS TOTAL_ETIQUETAS_BIPADAS,
        NVL((
          SELECT SUM(NVL(i.QTDNEG, 0))
          FROM AD_CARGAITENS i
          WHERE i.SEQOC = c.SEQOC
        ), 0) AS QTD_PREVISTA_TOTAL,
        NVL((
          SELECT SUM(NVL(e.QTDETIQUETA, 0))
          FROM AD_CARGACONFETQ e
          WHERE e.SEQOC = c.SEQOC
        ), 0) AS QTD_CONFERIDA_TOTAL
      FROM AD_CONFCARGAELETRONICA c
      WHERE c.SEQOC = :seqOc
    `;

    const result = await conn.execute(
      sql,
      { seqOc },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const rows = result.rows ?? [];
    return rows[0] ?? null;
  }

  async bloquearCargaParaBipagem(conn: DbConnection, seqOc: number) {
    const sql = `
      SELECT
        c.SEQOC,
        c.CODEMP,
        c.ORDEMCARGA,
        c.CODEQPEXP,
        c.DHINCLUSAO,
        c.DTINICIO,
        c.CODUSU,
        c.STATUS,
        c.OBS,
        NVL((
          SELECT COUNT(*)
          FROM AD_CARGAPEDIDO p
          WHERE p.SEQOC = c.SEQOC
        ), 0) AS TOTAL_PEDIDOS,
        NVL((
          SELECT COUNT(*)
          FROM AD_CARGAITENS i
          WHERE i.SEQOC = c.SEQOC
        ), 0) AS TOTAL_ITENS,
        NVL((
          SELECT COUNT(*)
          FROM AD_CARGACONFETQ e
          WHERE e.SEQOC = c.SEQOC
        ), 0) AS TOTAL_ETIQUETAS_BIPADAS,
        NVL((
          SELECT SUM(NVL(i.QTDNEG, 0))
          FROM AD_CARGAITENS i
          WHERE i.SEQOC = c.SEQOC
        ), 0) AS QTD_PREVISTA_TOTAL,
        NVL((
          SELECT SUM(NVL(e.QTDETIQUETA, 0))
          FROM AD_CARGACONFETQ e
          WHERE e.SEQOC = c.SEQOC
        ), 0) AS QTD_CONFERIDA_TOTAL
      FROM AD_CONFCARGAELETRONICA c
      WHERE c.SEQOC = :seqOc
      FOR UPDATE WAIT 5
    `;

    const result = await conn.execute(
      sql,
      { seqOc },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const rows = result.rows ?? [];
    return rows[0] ?? null;
  }

  async listarPedidos(conn: DbConnection, seqOc: number) {
    const sql = `
      SELECT
        p.SEQOC,
        p.NUNOTA,
        p.SEQENTREGA,
        p.CODPARC,
        p.CODCID,
        p.CODUF,
        NVL((
          SELECT SUM(NVL(i.QTDNEG, 0))
          FROM AD_CARGAITENS i
          WHERE i.SEQOC = p.SEQOC
            AND i.NUNOTA = p.NUNOTA
        ), 0) AS QTD_PREVISTA,
        NVL((
          SELECT SUM(NVL(e.QTDETIQUETA, 0))
          FROM AD_CARGACONFETQ e
          WHERE e.SEQOC = p.SEQOC
            AND e.NUNOTA = p.NUNOTA
        ), 0) AS QTD_CONFERIDA_ESTIMADA
      FROM AD_CARGAPEDIDO p
      WHERE p.SEQOC = :seqOc
      ORDER BY p.SEQENTREGA, p.NUNOTA
    `;

    const result = await conn.execute(
      sql,
      { seqOc },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    return result.rows ?? [];
  }

  async listarResumoProdutos(
    conn: DbConnection,
    seqOc: number,
    nunota?: number | null
  ) {
    const binds: SqlBinds = { seqOc };
    let filtroNunota = "";
    let selectNunota = "";
    let groupByNunota = "";
    let orderByNunota = "";
    let filtroEtiquetaQtd = "";
    let filtroEtiquetaPct = "";

    if (nunota != null) {
      binds.nunota = nunota;
      filtroNunota = " AND i.NUNOTA = :nunota ";
      selectNunota = "i.NUNOTA,";
      groupByNunota = ", i.NUNOTA";
      orderByNunota = "i.NUNOTA,";
      filtroEtiquetaQtd = " AND e.NUNOTA = i.NUNOTA ";
      filtroEtiquetaPct = " AND e.NUNOTA = i.NUNOTA ";
    }

    const sql = `
      SELECT
        i.SEQOC,
        ${selectNunota}
        i.CODPROD,
        MAX(pro.DESCRPROD) AS DESCRPROD,
        SUM(NVL(i.QTDNEG, 0)) AS QTD_PREVISTA,
        SUM(NVL(i.QTDPCT, 0)) AS QTDPCT_PREVISTA,
        SUM(NVL(i.PESOPREVISTO, 0)) AS PESO_PREVISTO,
        NVL((
          SELECT SUM(NVL(e.QTDETIQUETA, 0))
          FROM AD_CARGACONFETQ e
          WHERE e.SEQOC = i.SEQOC
            AND e.CODPROD = i.CODPROD
            ${filtroEtiquetaQtd}
        ), 0) AS QTD_BIPADA,
        NVL((
          SELECT SUM(NVL(e.QTDPCT, 0))
          FROM AD_CARGACONFETQ e
          WHERE e.SEQOC = i.SEQOC
            AND e.CODPROD = i.CODPROD
            ${filtroEtiquetaPct}
        ), 0) AS QTDPCT_BIPADA,
        CASE
          WHEN NVL((
            SELECT SUM(NVL(e.QTDETIQUETA, 0))
            FROM AD_CARGACONFETQ e
            WHERE e.SEQOC = i.SEQOC
              AND e.CODPROD = i.CODPROD
              ${filtroEtiquetaQtd}
          ), 0) >= SUM(NVL(i.QTDNEG, 0))
          THEN 'CONCLUIDO'
          WHEN NVL((
            SELECT SUM(NVL(e.QTDETIQUETA, 0))
            FROM AD_CARGACONFETQ e
            WHERE e.SEQOC = i.SEQOC
              AND e.CODPROD = i.CODPROD
              ${filtroEtiquetaQtd}
          ), 0) > 0
          THEN 'PARCIAL'
          ELSE 'PENDENTE'
        END AS STATUS_CONFERENCIA
      FROM AD_CARGAITENS i
      LEFT JOIN TGFPRO pro
        ON pro.CODPROD = i.CODPROD
      WHERE i.SEQOC = :seqOc
        ${filtroNunota}
      GROUP BY
        i.SEQOC
        ${groupByNunota},
        i.CODPROD
      ORDER BY
        ${orderByNunota}
        MAX(pro.DESCRPROD),
        i.CODPROD
    `;

    const result = await conn.execute(sql, binds, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
    });

    return result.rows ?? [];
  }

  async listarEtiquetasConferidas(conn: DbConnection, seqOc: number) {
    const sql = `
      SELECT
        e.SEQOC,
        e.CONFETQ,
        e.NUNOTA,
        e.CODPROD,
        pro.DESCRPROD,
        TO_CHAR(e.CODBARRA) AS CODBARRA,
        e.DHLEITURA,
        e.QTDETIQUETA,
        e.QTDPCT
      FROM AD_CARGACONFETQ e
      LEFT JOIN TGFPRO pro
        ON pro.CODPROD = e.CODPROD
      WHERE e.SEQOC = :seqOc
      ORDER BY e.CONFETQ DESC
    `;

    const result = await conn.execute(
      sql,
      { seqOc },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    return result.rows ?? [];
  }

  async buscarEtiquetaOrigem(conn: DbConnection, codBarraLido: string) {
    const sql = `
      SELECT *
      FROM (
        SELECT
          et.SEQUENCIA,
          TO_CHAR(et.CODBARRA) AS CODBARRA,
          TO_CHAR(et.CODBARRAGS1) AS CODBARRAGS1,
          et.CODPROD,
          pro.DESCRPROD,
          NVL(et.UNLOTE, NVL(et.TAMLOTE, 1)) AS QTDETIQUETA,
          et.PCT AS QTDPCT,
          et.PESO,
          et.STATUS_ETIQUETA
        FROM AD_ETIQUETAS et
        LEFT JOIN TGFPRO pro
          ON pro.CODPROD = et.CODPROD
        WHERE TO_CHAR(et.CODBARRA) = :codBarraLido
           OR TO_CHAR(et.CODBARRAGS1) = :codBarraLido
        ORDER BY et.SEQUENCIA DESC
      )
      WHERE ROWNUM = 1
    `;

    const result = await conn.execute(
      sql,
      { codBarraLido },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const rows = result.rows ?? [];
    return rows[0] ?? null;
  }

  async existeEtiquetaConferida(
    conn: DbConnection,
    seqOc: number,
    codBarra: string
  ) {
    const sql = `
      SELECT COUNT(*) AS TOTAL
      FROM AD_CARGACONFETQ e
      WHERE e.SEQOC = :seqOc
        AND TO_CHAR(e.CODBARRA) = :codBarra
    `;

    const result = await conn.execute(
      sql,
      { seqOc, codBarra },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const row = (result.rows ?? [])[0] as
      | { TOTAL?: number | string }
      | undefined;

    return Number(row?.TOTAL ?? 0) > 0;
  }

  async buscarProdutoNaCarga(
    conn: DbConnection,
    input: BuscarProdutoNaCargaInput
  ) {
    const binds: SqlBinds = {
      seqOc: input.seqOc,
      codProd: input.codProd,
    };

    let filtroNunotaItens = "";
    let filtroNunotaEtiquetaQtd = "";
    let filtroNunotaEtiquetaPct = "";

    if (input.nunota != null) {
      binds.nunota = input.nunota;
      filtroNunotaItens = " AND i.NUNOTA = :nunota ";
      filtroNunotaEtiquetaQtd = " AND e.NUNOTA = :nunota ";
      filtroNunotaEtiquetaPct = " AND e.NUNOTA = :nunota ";
    }

    const sql = `
      SELECT
        i.SEQOC,
        i.CODPROD,
        MAX(pro.DESCRPROD) AS DESCRPROD,
        SUM(NVL(i.QTDNEG, 0)) AS QTD_PREVISTA,
        SUM(NVL(i.QTDPCT, 0)) AS QTDPCT_PREVISTA,
        NVL((
          SELECT SUM(NVL(e.QTDETIQUETA, 0))
          FROM AD_CARGACONFETQ e
          WHERE e.SEQOC = i.SEQOC
            AND e.CODPROD = i.CODPROD
            ${filtroNunotaEtiquetaQtd}
        ), 0) AS QTD_BIPADA,
        NVL((
          SELECT SUM(NVL(e.QTDPCT, 0))
          FROM AD_CARGACONFETQ e
          WHERE e.SEQOC = i.SEQOC
            AND e.CODPROD = i.CODPROD
            ${filtroNunotaEtiquetaPct}
        ), 0) AS QTDPCT_BIPADA
      FROM AD_CARGAITENS i
      LEFT JOIN TGFPRO pro
        ON pro.CODPROD = i.CODPROD
      WHERE i.SEQOC = :seqOc
        AND i.CODPROD = :codProd
        ${filtroNunotaItens}
      GROUP BY
        i.SEQOC,
        i.CODPROD
    `;

    const result = await conn.execute(sql, binds, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
    });

    const rows = result.rows ?? [];
    return rows[0] ?? null;
  }

  async proximoConfEtq(conn: DbConnection, seqOc: number) {
    const sql = `
      SELECT NVL(MAX(CONFETQ), 0) + 1 AS PROXIMO
      FROM AD_CARGACONFETQ
      WHERE SEQOC = :seqOc
    `;

    const result = await conn.execute(
      sql,
      { seqOc },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const row = (result.rows ?? [])[0] as
      | { PROXIMO?: number | string }
      | undefined;

    return Number(row?.PROXIMO ?? 1);
  }

  async inserirEtiquetaConferida(
    conn: DbConnection,
    input: RegistrarEtiquetaConferidaDbInput
  ) {
    const sql = `
      INSERT INTO AD_CARGACONFETQ (
        SEQOC,
        CONFETQ,
        NUNOTA,
        CODPROD,
        CODBARRA,
        DHLEITURA,
        QTDETIQUETA,
        QTDPCT
      ) VALUES (
        :seqOc,
        :confEtq,
        :nunota,
        :codProd,
        TO_NUMBER(:codBarra),
        SYSDATE,
        :qtdEtiqueta,
        :qtdPct
      )
    `;

    await conn.execute(sql, {
      seqOc: input.seqOc,
      confEtq: input.confEtq,
      nunota: input.nunota,
      codProd: input.codProd,
      codBarra: input.codBarra,
      qtdEtiqueta: input.qtdEtiqueta,
      qtdPct: input.qtdPct,
    });
  }

  async marcarCargaEmCarregamento(conn: DbConnection, seqOc: number) {
    const sql = `
      UPDATE AD_CONFCARGAELETRONICA
         SET DTINICIO = NVL(DTINICIO, SYSDATE),
             STATUS = '2'
       WHERE SEQOC = :seqOc
         AND NVL(STATUS, '1') <> '3'
    `;

    await conn.execute(sql, { seqOc });
  }

  async atualizarStatusCarga(
    conn: DbConnection,
    seqOc: number,
    status: "1" | "2" | "3"
  ) {
    const sql = `
      UPDATE AD_CONFCARGAELETRONICA
         SET STATUS = :status
       WHERE SEQOC = :seqOc
    `;

    await conn.execute(sql, { seqOc, status });
  }

  async resumoConclusaoCarga(conn: DbConnection, seqOc: number) {
    const sql = `
      SELECT
        COUNT(*) AS TOTAL_PRODUTOS,
        SUM(
          CASE
            WHEN x.QTD_BIPADA >= x.QTD_PREVISTA
                 AND x.QTD_PREVISTA > 0
            THEN 1
            ELSE 0
          END
        ) AS PRODUTOS_CONCLUIDOS
      FROM (
        SELECT
          i.CODPROD,
          SUM(NVL(i.QTDNEG, 0)) AS QTD_PREVISTA,
          NVL((
            SELECT SUM(NVL(e.QTDETIQUETA, 0))
            FROM AD_CARGACONFETQ e
            WHERE e.SEQOC = :seqOc
              AND e.CODPROD = i.CODPROD
          ), 0) AS QTD_BIPADA
        FROM AD_CARGAITENS i
        WHERE i.SEQOC = :seqOc
        GROUP BY i.CODPROD
      ) x
    `;

    const result = await conn.execute(
      sql,
      { seqOc },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    return (result.rows ?? [])[0] ?? null;
  }
}