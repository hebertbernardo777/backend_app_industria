import oracledb from "oracledb";
import { query, execute } from "../infra/oracleClient.js";

export type StatusProc =
  | "A"  | "AP" | "C"  | "C2" | "F"
  | "P"  | "P2" | "R"  | "S"  | "S2";

export type OpsFiltros = {
  statusproc?: StatusProc;
  statusprocs?: StatusProc[];
  idiproc?: number;
  codprodpa?: number;
  codwcp?: number;
  fromStr?: string;
  toStr?: string;
  limit?: number;
  somenteSemFinal?: boolean;
};

export type OpRow = {
  IDIPROC: number;
  IDPROC: number | null;
  DHINST: Date | null;
  CODPLP: number | null;
  NOMEPLANTA: string | null;
  STATUSPROC: StatusProc;
  PRIORIDADE: number | null;
  NROLOTE: string | null;
  DHINC: Date | null;

  CODPRODPA: number | null;
  DESCRPROD: string | null;
  AD_QTDPC: number | null;
  CODVOL: string | null;

  CODGRUPOPROD: number | null;
  DESCRGRUPOPROD: string | null;

  IDRPA: number | null;
  ESTOQUE: number | null;
  ESTOQUEPERDA: number | null;
  QTDPRODUZIR: number | null;
  QTDPRODUZIR_ORIGINAL: number | null;
  CONCLUIDO: string | null;

  IDIATV: number | null;
  IIDEFX: number | null;
  CODWCP: number | null;
  NOMEWCP: string | null;
  DHINCLUSAO: Date | null;
  CODEXEC: number | null;
  DHACEITE: Date | null;
  DHINICIO: Date | null;
  DHFINAL: Date | null;
  QTDPRODUZIDA: number | null;
};

export type PlantaProducaoRow = {
  CODPLP: number;
  NOMEPLANTA: string | null;
};

export type MaquinaProducaoRow = {
  CODWCP: number;
  CODPLP: number | null;
  CODCWC: number | null;
  NOMEWCP: string | null;
  DESCRWCP: string | null;
};

export type ProdutoOpRow = {
  CODPRODPA: number;
  DESCRPROD: string | null;
  IDPROC: number;
  VERSAO: number;
  CONTROLEPA: string | null;
  TAMLOTEPAD: number | null;
  MULTIDEAL: number | null;
  QTDPRODMIN: number | null;
  QTD_SUGERIDA: number;
  IDFORMULA: number | null;
  CODLOCDEST: number | null;
  CODVOL: string | null;
  AD_QTDPC: number | null;
};

export type PrioridadeOpUpdate = {
  IDIPROC: number;
  PRIORIDADE: number;
};

export type CriarOpInput = {
  codplp: number;
  codwcp: number;
  codprodpa: number;
  qtdProduzir: number;
  codUsuInc: number;
  dtPreventStr?: string | null;
};

export type CriarOpResult = {
  idiproc: number;
  idproc: number;
  codplp: number;
  codwcp: number;
  codprodpa: number;
  qtdProduzir: number;
  nrolote: string;
  prioridade: number;
  statusproc: StatusProc;
};

export type AtualizacaoExecucaoOpResult = {
  opRowsAffected: number;
  atividadeRowsAffected: number;
};

const STATUS_PLANO_MAQUINA: StatusProc[] = ["A", "R"];

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function prioridadeParaOrdenacao(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : Number.MAX_SAFE_INTEGER;
}

function firstOut<T = any>(outBinds: any, name: string): T | undefined {
  return outBinds?.[name] ?? outBinds?.[name.toUpperCase()];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class OpsRepository {
  async findMany(f: OpsFiltros): Promise<OpRow[]> {
    const conds: string[] = [];
    const binds: any = {};

    if (f.idiproc != null) {
      conds.push("P.IDIPROC = :idiproc");
      binds.idiproc = f.idiproc;
    }

    if (f.codprodpa != null) {
      conds.push("IPA.CODPRODPA = :codprodpa");
      binds.codprodpa = f.codprodpa;
    }

    if (f.codwcp != null) {
      conds.push("(EXISTS (SELECT 1 FROM TPRWXIP XIP WHERE XIP.IDIPROC = P.IDIPROC AND XIP.CODWCP = :codwcp) OR IL.CODWCP = :codwcp)");
      binds.codwcp = f.codwcp;
    }

    if (f.statusproc) {
      conds.push("P.STATUSPROC = :statusproc");
      binds.statusproc = f.statusproc;
    }

    if (f.statusprocs?.length) {
      const ph = f.statusprocs.map((_, i) => `:st${i}`);
      f.statusprocs.forEach((s, i) => (binds[`st${i}`] = s));
      conds.push(`P.STATUSPROC IN (${ph.join(",")})`);
    }

    if (f.somenteSemFinal) {
      conds.push("IL.DHFINAL IS NULL");
    }

    if (f.fromStr) {
      conds.push(`P.DHINC >= TO_DATE(:fromStr, 'YYYY-MM-DD')`);
      binds.fromStr = f.fromStr;
    }

    if (f.toStr) {
      conds.push(`P.DHINC < TO_DATE(:toStr, 'YYYY-MM-DD') + 1`);
      binds.toStr = f.toStr;
    }

    const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";

    const limit = Math.min(Math.max(Number(f.limit ?? 200), 1), 2000);
    binds.limit = limit;

    const sql = `
      WITH I_LAST AS (
        SELECT
          I.*,
          ROW_NUMBER() OVER (
            PARTITION BY I.IDIPROC
            ORDER BY I.DHINCLUSAO DESC NULLS LAST,
                     I.IDIATV DESC
          ) AS RN
        FROM TPRIATV I
      ),
      WXIP_LAST AS (
        SELECT
          X.*,
          ROW_NUMBER() OVER (
            PARTITION BY X.IDIPROC
            ORDER BY NVL(X.PRIORIDADE, 999999),
                     X.IDEFX,
                     X.IDAWC,
                     X.CODWCP
          ) AS RN
        FROM TPRWXIP X
      ),
      ETQ AS (
        SELECT
          OP AS IDIPROC,
          SUM(NVL(PCT,0)) AS QTDPRODUZIDA
        FROM AD_ETIQUETAS
        WHERE OP IS NOT NULL
        GROUP BY OP
      )
      SELECT *
      FROM (
        SELECT
          P.IDIPROC,
          P.IDPROC,
          P.DHINST,
          P.CODPLP,
          PLP.NOME AS NOMEPLANTA,
          P.STATUSPROC,
          P.PRIORIDADE,
          P.NROLOTE,
          P.DHINC,

          IPA.CODPRODPA,
          PRO.DESCRPROD,
          PRO.AD_QTDPC,
          PRO.CODVOL,
          PRO.CODGRUPOPROD,
          GRU.DESCRGRUPOPROD,

          CAST(NULL AS NUMBER) AS IDRPA,
          IPA.QTDPRODUZIR AS ESTOQUE,
          CAST(NULL AS NUMBER) AS ESTOQUEPERDA,
          IPA.QTDPRODUZIR,
          IPA.QTDPRODUZIR_ORIGINAL,
          IPA.CONCLUIDO,

          IL.IDIATV,
          IL.IDEFX AS IIDEFX,
          COALESCE(IL.CODWCP, WXIP.CODWCP) AS CODWCP,
          WCP.NOME AS NOMEWCP,
          IL.DHINCLUSAO,
          IL.CODEXEC,
          IL.DHACEITE,
          IL.DHINICIO,
          IL.DHFINAL,

          NVL(ETQ.QTDPRODUZIDA, 0) AS QTDPRODUZIDA

        FROM TPRIPROC P
        LEFT JOIN TPRIPA IPA ON IPA.IDIPROC = P.IDIPROC
        LEFT JOIN I_LAST IL ON IL.IDIPROC = P.IDIPROC AND IL.RN = 1
        LEFT JOIN WXIP_LAST WXIP ON WXIP.IDIPROC = P.IDIPROC AND WXIP.RN = 1
        LEFT JOIN TGFPRO PRO ON PRO.CODPROD = IPA.CODPRODPA
        LEFT JOIN TGFGRU GRU ON GRU.CODGRUPOPROD = PRO.CODGRUPOPROD
        LEFT JOIN TPRPLP PLP ON PLP.CODPLP = P.CODPLP
        LEFT JOIN TPRWCP WCP ON WCP.CODWCP = COALESCE(IL.CODWCP, WXIP.CODWCP)
        LEFT JOIN ETQ ON ETQ.IDIPROC = P.IDIPROC

        ${where}
        ORDER BY P.IDIPROC DESC
      )
      WHERE ROWNUM <= :limit
    `;

    return query<OpRow>(sql, binds);
  }

  async listarPlantas(): Promise<PlantaProducaoRow[]> {
    const sql = `
      SELECT
        PLP.CODPLP,
        PLP.NOME AS NOMEPLANTA
      FROM TPRPLP PLP
      ORDER BY PLP.CODPLP
    `;

    return query<PlantaProducaoRow>(sql, {});
  }

  async listarMaquinasProducao(codplp?: number): Promise<MaquinaProducaoRow[]> {
    const conds = ["WCP.CODCWC = 1", "WCP.CODWCP NOT IN (26)"];
    const binds: any = {};

    if (codplp != null) {
      conds.push("WCP.CODPLP = :codplp");
      binds.codplp = codplp;
    }

    const sql = `
      SELECT
        WCP.CODWCP,
        WCP.CODPLP,
        WCP.CODCWC,
        WCP.NOME AS NOMEWCP,
        CAST(NULL AS VARCHAR2(1)) AS DESCRWCP
      FROM TPRWCP WCP
      WHERE ${conds.join(" AND ")}
      ORDER BY WCP.CODWCP
    `;

    return query<MaquinaProducaoRow>(sql, binds);
  }

  async listarProdutosParaOp(params: {
    search?: string;
    codplp?: number;
    limit?: number;
  } = {}) {
    const binds: any = {};
    const conds: string[] = ["X.RN = 1"];

    const search = String(params.search ?? "").trim();

    if (search) {
      conds.push(`
        (
             TO_CHAR(X.CODPRODPA) LIKE '%' || :search || '%'
          OR UPPER(PRO.DESCRPROD) LIKE '%' || UPPER(:search) || '%'
          OR UPPER(NVL(X.DESCRABREV, '')) LIKE '%' || UPPER(:search) || '%'
        )
      `);

      binds.search = search;
    }

    if (params.codplp != null) {
      conds.push("X.CODPLP = :codplp");
      binds.codplp = Number(params.codplp);
    }

    binds.limit = Math.min(Math.max(Number(params.limit ?? 80), 1), 300);

    const where = `WHERE ${conds.join(" AND ")}`;

    const sql = `
      WITH X AS (
        SELECT
          PRC.IDPROC,
          PRC.CODPRC,
          PRC.VERSAO,
          PRC.DESCRABREV,
          PRC.CODPLP,
          PRC.ATIVO,

          LPA.CODPRODPA,
          LPA.CONTROLEPA,
          LPA.TAMLOTEPAD,
          LPA.MULTIDEAL,
          LPA.QTDPRODMIN,
          LPA.IDFORMULA,
          LPA.CODLOCDEST,

          CASE
            WHEN NVL(LPA.QTDPRODMIN, 0) > 0 THEN LPA.QTDPRODMIN
            WHEN NVL(LPA.TAMLOTEPAD, 0) > 0 THEN LPA.TAMLOTEPAD
            WHEN NVL(LPA.MULTIDEAL, 0) > 0 THEN LPA.MULTIDEAL
            ELSE 1
          END AS QTD_SUGERIDA,

          ROW_NUMBER() OVER (
            PARTITION BY LPA.CODPRODPA, NVL(LPA.CONTROLEPA, ' ')
            ORDER BY NVL(PRC.VERSAO, 0) DESC, PRC.IDPROC DESC
          ) AS RN
        FROM TPRLPA LPA
        JOIN TPRPRC PRC
          ON PRC.IDPROC = LPA.IDPROC
        WHERE NVL(PRC.ATIVO, 'S') = 'S'
      )
      SELECT *
      FROM (
        SELECT
          X.IDPROC,
          X.CODPRC,
          X.VERSAO,
          X.DESCRABREV,
          X.CODPLP,
          X.CODPRODPA,
          PRO.DESCRPROD,
          X.CONTROLEPA,
          X.TAMLOTEPAD,
          X.MULTIDEAL,
          X.QTDPRODMIN,
          X.QTD_SUGERIDA,
          X.IDFORMULA,
          X.CODLOCDEST,
          PRO.CODVOL,
          PRO.AD_QTDPC
        FROM X
        JOIN TGFPRO PRO
          ON PRO.CODPROD = X.CODPRODPA
        ${where}
        ORDER BY PRO.DESCRPROD
      )
      WHERE ROWNUM <= :limit
    `;

    return query(sql, binds);
  }

  async obterUltimoProcessoProduto(codprodpa: number, codplp?: number | null) {
    const sql = `
      SELECT *
      FROM (
        SELECT
          PRC.IDPROC,
          PRC.CODPRC,
          PRC.VERSAO,
          PRC.DESCRABREV,
          PRC.CODPLP,
          PRC.ATIVO,

          LPA.CODPRODPA,
          PRO.DESCRPROD,
          LPA.CONTROLEPA,
          LPA.TAMLOTEPAD,
          LPA.MULTIDEAL,
          LPA.QTDPRODMIN,
          LPA.IDFORMULA,
          LPA.CODLOCDEST,
          PRO.CODVOL,
          PRO.AD_QTDPC,

          CASE
            WHEN NVL(LPA.QTDPRODMIN, 0) > 0 THEN LPA.QTDPRODMIN
            WHEN NVL(LPA.TAMLOTEPAD, 0) > 0 THEN LPA.TAMLOTEPAD
            WHEN NVL(LPA.MULTIDEAL, 0) > 0 THEN LPA.MULTIDEAL
            ELSE 1
          END AS QTD_SUGERIDA,

          ROW_NUMBER() OVER (
            PARTITION BY LPA.CODPRODPA, NVL(LPA.CONTROLEPA, ' ')
            ORDER BY NVL(PRC.VERSAO, 0) DESC, PRC.IDPROC DESC
          ) AS RN

        FROM TPRLPA LPA
        JOIN TPRPRC PRC
          ON PRC.IDPROC = LPA.IDPROC
        JOIN TGFPRO PRO
          ON PRO.CODPROD = LPA.CODPRODPA
        WHERE LPA.CODPRODPA = :codprodpa
          AND (:codplp IS NULL OR PRC.CODPLP = :codplp)
          AND NVL(PRC.ATIVO, 'S') = 'S'
      )
      WHERE RN = 1
    `;

    const rows = await query<any>(sql, {
      codprodpa,
      codplp: codplp ?? null,
    });

    return rows[0] ?? null;
  }

  async listarOpsPorMaquina(codwcp: number): Promise<OpRow[]> {
    const rows = await this.findMany({
      codwcp,
      statusprocs: STATUS_PLANO_MAQUINA,
      somenteSemFinal: true,
      limit: 2000,
    });

    return rows.sort((a, b) => {
      const byPriority =
        prioridadeParaOrdenacao(a.PRIORIDADE) -
        prioridadeParaOrdenacao(b.PRIORIDADE);

      if (byPriority !== 0) return byPriority;

      return num(a.IDIPROC) - num(b.IDIPROC);
    });
  }

  async criarOp(input: CriarOpInput): Promise<CriarOpResult> {
    const sql = `
      DECLARE
        V_IDIPROC    NUMBER;
        V_IDPROC     NUMBER;
        V_CONTROLEPA VARCHAR2(11);
        V_NROLOTE    VARCHAR2(20);
        V_PRIORIDADE NUMBER;
        V_IDEFX      NUMBER;
        V_IDAWC      NUMBER;
      BEGIN
        LOCK TABLE TPRIPROC IN EXCLUSIVE MODE;

        SELECT NVL(MAX(IDIPROC), 0) + 1
          INTO V_IDIPROC
          FROM TPRIPROC;

        SELECT
          X.IDPROC,
          NVL(X.CONTROLEPA, ' ')
        INTO
          V_IDPROC,
          V_CONTROLEPA
        FROM (
          SELECT
            PRC.IDPROC,
            LPA.CONTROLEPA,
            ROW_NUMBER() OVER (
              PARTITION BY LPA.CODPRODPA, NVL(LPA.CONTROLEPA, ' ')
              ORDER BY NVL(PRC.VERSAO, 0) DESC, PRC.IDPROC DESC
            ) AS RN
          FROM TPRLPA LPA
          JOIN TPRPRC PRC
            ON PRC.IDPROC = LPA.IDPROC
          WHERE LPA.CODPRODPA = :codprodpa
            AND PRC.CODPLP = :codplp
            AND NVL(PRC.ATIVO, 'S') = 'S'
        ) X
        WHERE X.RN = 1;

        SELECT
          LPAD(
            NVL(MAX(TO_NUMBER(SUBSTR(NROLOTE, 1, 5))), 0) + 1,
            5,
            '0'
          ) || '/' || TO_CHAR(SYSDATE, 'YYYYMM')
        INTO V_NROLOTE
        FROM TPRIPROC
        WHERE REGEXP_LIKE(
          NROLOTE,
          '^[0-9]{5}/' || TO_CHAR(SYSDATE, 'YYYYMM') || '$'
        );

        SELECT NVL(MAX(PRIORIDADE), 0) + 1
          INTO V_PRIORIDADE
          FROM TPRIPROC
         WHERE CODPLP = :codplp;

        INSERT INTO TPRIPROC (
          IDIPROC,
          IDPROC,
          DHINST,
          CODPLP,
          STATUSPROC,
          DHINC,
          CODUSUINC,
          PRIORIDADE,
          NROLOTE,
          DTPREVENT,
          TEMPOATRAVESS
        ) VALUES (
          V_IDIPROC,
          V_IDPROC,
          NULL,
          :codplp,
          'R',
          SYSDATE,
          :codUsuInc,
          V_PRIORIDADE,
          V_NROLOTE,
          CASE
            WHEN :dtPreventStr IS NULL THEN NULL
            ELSE TO_DATE(:dtPreventStr, 'YYYY-MM-DD')
          END,
          0
        );

        INSERT INTO TPRIPA (
          IDIPROC,
          CODPRODPA,
          CONTROLEPA,
          QTDPRODUZIR,
          NROLOTE,
          CONCLUIDO,
          DTVAL,
          DTFAB,
          QTDPRODUZIR_ORIGINAL
        ) VALUES (
          V_IDIPROC,
          :codprodpa,
          V_CONTROLEPA,
          :qtdProduzir,
          V_NROLOTE,
          'N',
          NULL,
          NULL,
          :qtdProduzir
        );

        /*
          O monitor da tela Ordens de Produção mostrou que o filtro principal
          por máquina usa TPRWXIP, não TPRIATV:

            EXISTS (SELECT 1
                      FROM TPRWXIP XIP
                     WHERE XIP.IDIPROC = TPRIPROC.IDIPROC
                       AND XIP.CODWCP = :codwcp)

          Por isso, ao criar a OP manualmente, precisamos gravar o vínculo
          planejado da máquina em TPRWXIP. A TPRIATV pode nascer só depois
          do aceite/início; quando existir, os métodos de aceite/início também
          reforçam TPRIATV.CODWCP.
        */
        BEGIN
          SELECT X.IDEFX, X.IDAWC
            INTO V_IDEFX, V_IDAWC
            FROM (
              SELECT
                ATV.IDEFX,
                ATV.IDAWC
              FROM TPRATV ATV
              JOIN TPREFX EFX
                ON EFX.IDPROC = ATV.IDPROC
               AND EFX.IDEFX = ATV.IDEFX
              LEFT JOIN TPRAWC AWC
                ON AWC.IDPROC = ATV.IDPROC
               AND AWC.IDAWC = ATV.IDAWC
              WHERE ATV.IDPROC = V_IDPROC
                AND EFX.TIPO NOT IN (1111, 1112)
                /*
                  O monitor da tela do Sankhya mostrou que ela primeiro carrega
                  as atividades do processo em TPRATV pelo IDPROC e usa o IDAWC
                  da atividade para consultar/gravar TPRWXIP. Ela não exige que
                  TPRAWC.CODWCP seja igual à máquina escolhida; o CODWCP específico
                  da OP fica em TPRWXIP.CODWCP.
                */
                AND ATV.IDAWC IS NOT NULL
              ORDER BY
                CASE WHEN AWC.IDAWC IS NOT NULL THEN 0 ELSE 1 END,
                NVL(ATV.SEQEXECUCAO, 999999),
                ATV.IDEFX
            ) X
           WHERE ROWNUM = 1;
        EXCEPTION
          WHEN NO_DATA_FOUND THEN
            RAISE_APPLICATION_ERROR(
              -20002,
              'Não foi possível encontrar atividade/IDAWC para vincular TPRWXIP da OP ' || V_IDIPROC ||
              '. IDPROC=' || V_IDPROC || ', Produto=' || :codprodpa || ', CODWCP=' || :codwcp
            );
        END;

        UPDATE TPRWXIP X
           SET X.CODWCP = :codwcp,
               X.IDEFX = V_IDEFX,
               X.PRIORIDADE = NVL(X.PRIORIDADE, 1)
         WHERE X.IDIPROC = V_IDIPROC
           AND X.IDAWC = V_IDAWC;

        IF SQL%ROWCOUNT = 0 THEN
          INSERT INTO TPRWXIP (
            IDIPROC,
            IDAWC,
            IDEFX,
            CODWCP,
            PRIORIDADE
          ) VALUES (
            V_IDIPROC,
            V_IDAWC,
            V_IDEFX,
            :codwcp,
            1
          );
        END IF;

                :out_idiproc := V_IDIPROC;
        :out_idproc := V_IDPROC;
        :out_nrolote := V_NROLOTE;
        :out_prioridade := V_PRIORIDADE;
      END;
    `;

    const result = await execute(sql, {
      codplp: input.codplp,
      codwcp: input.codwcp,
      codprodpa: input.codprodpa,
      qtdProduzir: input.qtdProduzir,
      codUsuInc: input.codUsuInc,
      dtPreventStr: input.dtPreventStr ?? null,

      out_idiproc: {
        dir: oracledb.BIND_OUT,
        type: oracledb.NUMBER,
      },
      out_idproc: {
        dir: oracledb.BIND_OUT,
        type: oracledb.NUMBER,
      },
      out_nrolote: {
        dir: oracledb.BIND_OUT,
        type: oracledb.STRING,
        maxSize: 20,
      },
      out_prioridade: {
        dir: oracledb.BIND_OUT,
        type: oracledb.NUMBER,
      },
    });

    const outBinds: any = result.outBinds ?? {};
    const idiproc = Number(firstOut(outBinds, "out_idiproc"));
    const idproc = Number(firstOut(outBinds, "out_idproc"));

    /*
      Reforça o vínculo planejado usado pela tela padrão do Sankhya.
      O filtro da tela usa TPRWXIP.IDIPROC + TPRWXIP.CODWCP; TPRIATV pode
      ainda não existir para OP recém-criada em status R.
    */
    await this.garantirVinculoMaquinaOp(idiproc, input.codwcp);

    return {
      idiproc,
      idproc,
      codplp: input.codplp,
      codwcp: input.codwcp,
      codprodpa: input.codprodpa,
      qtdProduzir: input.qtdProduzir,
      nrolote: String(firstOut(outBinds, "out_nrolote") ?? ""),
      prioridade: Number(firstOut(outBinds, "out_prioridade")),
      statusproc: "R" as StatusProc,
    };
  }

  async vincularMaquinaOp(idiproc: number, codwcp: number): Promise<number> {
    if (!Number.isFinite(Number(idiproc)) || Number(idiproc) <= 0) {
      throw new Error(`IDIPROC inválido para vincular máquina: ${idiproc}`);
    }

    if (!Number.isFinite(Number(codwcp)) || Number(codwcp) <= 0) {
      throw new Error(`CODWCP inválido para vincular máquina da OP ${idiproc}: ${codwcp}`);
    }

    /*
      A tela padrão do Sankhya filtra a OP por máquina usando TPRWXIP:

        EXISTS (SELECT 1 FROM TPRWXIP XIP
                 WHERE XIP.IDIPROC = TPRIPROC.IDIPROC
                   AND XIP.CODWCP = :codwcp)

      Portanto este método grava o vínculo planejado em TPRWXIP. Se a TPRIATV
      já existir, também atualiza TPRIATV.CODWCP para manter a execução coerente.
    */
    const sql = `
      DECLARE
        V_IDPROC NUMBER;
        V_IDEFX  NUMBER;
        V_IDAWC  NUMBER;
        V_ROWS   NUMBER := 0;
      BEGIN
        SELECT P.IDPROC
          INTO V_IDPROC
          FROM TPRIPROC P
         WHERE P.IDIPROC = :idiproc;

        BEGIN
          SELECT X.IDEFX, X.IDAWC
            INTO V_IDEFX, V_IDAWC
            FROM (
              SELECT
                ATV.IDEFX,
                ATV.IDAWC
              FROM TPRATV ATV
              JOIN TPREFX EFX
                ON EFX.IDPROC = ATV.IDPROC
               AND EFX.IDEFX = ATV.IDEFX
              LEFT JOIN TPRAWC AWC
                ON AWC.IDPROC = ATV.IDPROC
               AND AWC.IDAWC = ATV.IDAWC
              WHERE ATV.IDPROC = V_IDPROC
                AND EFX.TIPO NOT IN (1111, 1112)
                /*
                  O monitor da tela do Sankhya mostrou que ela primeiro carrega
                  as atividades do processo em TPRATV pelo IDPROC e usa o IDAWC
                  da atividade para consultar/gravar TPRWXIP. Ela não exige que
                  TPRAWC.CODWCP seja igual à máquina escolhida; o CODWCP específico
                  da OP fica em TPRWXIP.CODWCP.
                */
                AND ATV.IDAWC IS NOT NULL
              ORDER BY
                CASE WHEN AWC.IDAWC IS NOT NULL THEN 0 ELSE 1 END,
                NVL(ATV.SEQEXECUCAO, 999999),
                ATV.IDEFX
            ) X
           WHERE ROWNUM = 1;
        EXCEPTION
          WHEN NO_DATA_FOUND THEN
            RAISE_APPLICATION_ERROR(
              -20002,
              'Não foi possível encontrar atividade/IDAWC para vincular TPRWXIP da OP ' || :idiproc ||
              '. IDPROC=' || V_IDPROC || ', CODWCP=' || :codwcp
            );
        END;

        UPDATE TPRWXIP X
           SET X.CODWCP = :codwcp,
               X.IDEFX = V_IDEFX,
               X.PRIORIDADE = NVL(X.PRIORIDADE, 1)
         WHERE X.IDIPROC = :idiproc
           AND X.IDAWC = V_IDAWC;

        V_ROWS := SQL%ROWCOUNT;

        IF V_ROWS = 0 THEN
          INSERT INTO TPRWXIP (
            IDIPROC,
            IDAWC,
            IDEFX,
            CODWCP,
            PRIORIDADE
          ) VALUES (
            :idiproc,
            V_IDAWC,
            V_IDEFX,
            :codwcp,
            1
          );

          V_ROWS := 1;
        END IF;

        UPDATE TPRIATV I
           SET I.CODWCP = :codwcp
         WHERE I.IDIPROC = :idiproc
           AND (I.CODWCP IS NULL OR I.CODWCP <> :codwcp);

        :out_rows := V_ROWS + SQL%ROWCOUNT;
      END;
    `;

    const result = await execute(sql, {
      idiproc: Number(idiproc),
      codwcp: Number(codwcp),
      out_rows: {
        dir: oracledb.BIND_OUT,
        type: oracledb.NUMBER,
      },
    });

    return Number(firstOut(result.outBinds ?? {}, "out_rows") ?? 0);
  }

  async obterVinculoMaquinaOp(idiproc: number): Promise<{
    totalAtividades: number;
    totalSemCodwcp: number;
    codwcps: string | null;
  }> {
    const sql = `
      SELECT
        COUNT(*) AS TOTALATIVIDADES,
        SUM(CASE WHEN X.CODWCP IS NULL THEN 1 ELSE 0 END) AS TOTALSEMCODWCP,
        LISTAGG(TO_CHAR(X.CODWCP), ',')
          WITHIN GROUP (ORDER BY X.CODWCP) AS CODWCPS
      FROM TPRWXIP X
      WHERE X.IDIPROC = :idiproc
    `;

    const rows = await query<any>(sql, { idiproc });
    const row = rows[0] ?? {};

    return {
      totalAtividades: Number(row.TOTALATIVIDADES ?? 0),
      totalSemCodwcp: Number(row.TOTALSEMCODWCP ?? 0),
      codwcps: row.CODWCPS ?? null,
    };
  }

  private async garantirVinculoMaquinaOp(
    idiproc: number,
    codwcp: number,
  ): Promise<void> {
    /*
      Valida o vínculo planejado em TPRWXIP, que é o que a tela padrão usa
      para filtrar OP por máquina. A TPRIATV pode não existir ainda.
    */
    let ultimoStatus = await this.obterVinculoMaquinaOp(idiproc);

    for (let tentativa = 1; tentativa <= 30; tentativa += 1) {
      if (ultimoStatus.totalAtividades > 0) {
        await this.vincularMaquinaOp(idiproc, codwcp);

        const statusDepoisUpdate = await this.obterVinculoMaquinaOp(idiproc);
        if (
          statusDepoisUpdate.totalAtividades > 0 &&
          statusDepoisUpdate.totalSemCodwcp === 0 &&
          String(statusDepoisUpdate.codwcps ?? '')
            .split(',')
            .filter(Boolean)
            .every((v) => Number(v) === Number(codwcp))
        ) {
          return;
        }

        ultimoStatus = statusDepoisUpdate;
      }

      await sleep(300);
      ultimoStatus = await this.obterVinculoMaquinaOp(idiproc);
    }

    throw new Error(
      `OP ${idiproc} criada, mas não foi possível vincular CODWCP ${codwcp} em TPRWXIP. ` +
        `Vinculos=${ultimoStatus.totalAtividades}; ` +
        `SemCODWCP=${ultimoStatus.totalSemCodwcp}; ` +
        `CODWCPs=${ultimoStatus.codwcps ?? 'NULL'}`,
    );
  }

  async atualizarPrioridadesOps(items: PrioridadeOpUpdate[]): Promise<number> {
    if (!items.length) return 0;

    const binds: any = {};

    const caseParts = items.map((item, i) => {
      binds[`idiproc${i}`] = Number(item.IDIPROC);
      binds[`prioridade${i}`] = Number(item.PRIORIDADE);
      return `WHEN :idiproc${i} THEN :prioridade${i}`;
    });

    const ids = items.map((_, i) => `:idiproc${i}`);

    const sql = `
      UPDATE TPRIPROC P
         SET P.PRIORIDADE = CASE P.IDIPROC
           ${caseParts.join("\n           ")}
           ELSE P.PRIORIDADE
         END
       WHERE P.IDIPROC IN (${ids.join(",")})
    `;

    const result = await execute(sql, binds);
    return result.rowsAffected ?? 0;
  }

  async redimensionarLoteOp(
    idiproc: number,
    qtdProduzir: number,
  ): Promise<number> {
    const sql = `
      UPDATE TPRIPA IPA
         SET IPA.QTDPRODUZIR = :qtdProduzir
       WHERE IPA.IDIPROC = :idiproc
    `;

    const result = await execute(sql, {
      idiproc,
      qtdProduzir,
    });

    return result.rowsAffected ?? 0;
  }

  async atualizarStatusOp(idiproc: number, statusproc: StatusProc): Promise<number> {
    const sql = `
      UPDATE TPRIPROC P
         SET P.STATUSPROC = :statusproc
       WHERE P.IDIPROC = :idiproc
    `;

    const result = await execute(sql, {
      idiproc,
      statusproc,
    });

    return result.rowsAffected ?? 0;
  }

  private async garantirAtividadeExecucaoOp(params: {
    idiproc: number;
    codexec?: number | null;
    codwcp?: number | null;
    marcarInicio: boolean;
    marcarFinal: boolean;
  }): Promise<number> {
    const sql = `
      DECLARE
        V_IDPROC       NUMBER;
        V_IDEXECWFLOW  VARCHAR2(100);
        V_DHINST       DATE;
        V_IDEFX        NUMBER;
        V_CODWCP       NUMBER;
        V_IDIATV       NUMBER;
        V_TOTAL_ATV    NUMBER := 0;
        V_ROWS         NUMBER := 0;
      BEGIN
        SELECT P.IDPROC, P.DHINST
          INTO V_IDPROC, V_DHINST
          FROM TPRIPROC P
         WHERE P.IDIPROC = :idiproc
         FOR UPDATE;

        /*
          TPRIATV.IDEXECWFLOW é obrigatório, mas nesta base ele não fica na TPRIPROC
          e a TPRSTE não possui vínculo com IDIPROC. Então geramos um novo token
          numérico livre, usando como referência os tokens já existentes em TPRIATV
          e TPRSTE. A geração final acontece depois do LOCK, apenas quando for
          realmente necessário inserir uma atividade nova.
        */
        V_IDEXECWFLOW := NULL;

        V_CODWCP := TO_NUMBER(:codwcp);

        IF V_CODWCP IS NULL THEN
          BEGIN
            SELECT CODWCP
              INTO V_CODWCP
              FROM (
                SELECT COALESCE(I.CODWCP, X.CODWCP) AS CODWCP
                  FROM TPRIPROC P
                  LEFT JOIN TPRIATV I
                    ON I.IDIPROC = P.IDIPROC
                  LEFT JOIN TPRWXIP X
                    ON X.IDIPROC = P.IDIPROC
                 WHERE P.IDIPROC = :idiproc
                   AND COALESCE(I.CODWCP, X.CODWCP) IS NOT NULL
                 ORDER BY CASE WHEN I.CODWCP IS NOT NULL THEN 0 ELSE 1 END,
                          NVL(X.PRIORIDADE, 999999),
                          I.IDIATV DESC
              )
             WHERE ROWNUM = 1;
          EXCEPTION
            WHEN NO_DATA_FOUND THEN
              V_CODWCP := NULL;
          END;
        END IF;

        IF V_CODWCP IS NULL THEN
          RAISE_APPLICATION_ERROR(
            -20003,
            'Não foi possível iniciar/finalizar a OP ' || :idiproc ||
            ' porque não foi encontrado CODWCP da máquina.'
          );
        END IF;

        BEGIN
          SELECT IDEFX
            INTO V_IDEFX
            FROM (
              SELECT X.IDEFX
                FROM TPRWXIP X
               WHERE X.IDIPROC = :idiproc
                 AND X.CODWCP = V_CODWCP
                 AND X.IDEFX IS NOT NULL
               ORDER BY NVL(X.PRIORIDADE, 999999), X.IDEFX
            )
           WHERE ROWNUM = 1;
        EXCEPTION
          WHEN NO_DATA_FOUND THEN
            SELECT IDEFX
              INTO V_IDEFX
              FROM (
                SELECT ATV.IDEFX
                  FROM TPRATV ATV
                  JOIN TPREFX EFX
                    ON EFX.IDPROC = ATV.IDPROC
                   AND EFX.IDEFX = ATV.IDEFX
                 WHERE ATV.IDPROC = V_IDPROC
                   AND EFX.TIPO NOT IN (1111, 1112)
                 ORDER BY NVL(ATV.SEQEXECUCAO, 999999), ATV.IDEFX
              )
             WHERE ROWNUM = 1;
        END;

        LOCK TABLE TPRIATV IN EXCLUSIVE MODE;
        LOCK TABLE TPRSTE IN EXCLUSIVE MODE;

        SELECT COUNT(*)
          INTO V_TOTAL_ATV
          FROM TPRIATV I
         WHERE I.IDIPROC = :idiproc;

        IF V_TOTAL_ATV = 0 THEN
          SELECT NVL(MAX(IDIATV), 0) + 1
            INTO V_IDIATV
            FROM TPRIATV;

          SELECT TO_CHAR(NVL(MAX(TOKEN_NUM), 0) + 1)
            INTO V_IDEXECWFLOW
            FROM (
              SELECT TO_NUMBER(IDEXECWFLOW) AS TOKEN_NUM
                FROM TPRIATV
               WHERE REGEXP_LIKE(IDEXECWFLOW, '^[0-9]+$')
              UNION ALL
              SELECT TO_NUMBER(IDEXECWFLOW) AS TOKEN_NUM
                FROM TPRSTE
               WHERE REGEXP_LIKE(IDEXECWFLOW, '^[0-9]+$')
            );

          INSERT INTO TPRIATV (
            IDEXECWFLOW,
            IDIPROC,
            IDIATV,
            IDEFX,
            CODWCP,
            DHINCLUSAO,
            CODEXEC,
            DHACEITE,
            DHINICIO,
            DHFINAL
          ) VALUES (
            V_IDEXECWFLOW,
            :idiproc,
            V_IDIATV,
            V_IDEFX,
            V_CODWCP,
            SYSDATE,
            TO_NUMBER(:codexec),
            CASE WHEN :marcarInicio = 1 OR :marcarFinal = 1 THEN NVL(V_DHINST, SYSDATE) ELSE NULL END,
            CASE WHEN :marcarInicio = 1 OR :marcarFinal = 1 THEN NVL(V_DHINST, SYSDATE) ELSE NULL END,
            CASE WHEN :marcarFinal = 1 THEN SYSDATE ELSE NULL END
          );

          V_ROWS := 1;
        ELSE
          UPDATE TPRIATV I
             SET I.CODWCP = NVL(V_CODWCP, I.CODWCP),
                 I.DHACEITE = CASE
                                WHEN :marcarInicio = 1 OR :marcarFinal = 1 THEN NVL(I.DHACEITE, NVL(V_DHINST, SYSDATE))
                                ELSE I.DHACEITE
                              END,
                 I.DHINICIO = CASE
                                WHEN :marcarInicio = 1 OR :marcarFinal = 1 THEN NVL(I.DHINICIO, NVL(V_DHINST, SYSDATE))
                                ELSE I.DHINICIO
                              END,
                 I.DHFINAL = CASE
                               WHEN :marcarFinal = 1 THEN NVL(I.DHFINAL, SYSDATE)
                               ELSE I.DHFINAL
                             END,
                 I.CODEXEC = NVL(TO_NUMBER(:codexec), I.CODEXEC)
           WHERE I.ROWID = (
             SELECT RID
               FROM (
                 SELECT I2.ROWID AS RID
                   FROM TPRIATV I2
                  WHERE I2.IDIPROC = :idiproc
                  ORDER BY I2.DHINCLUSAO DESC NULLS LAST,
                           I2.IDIATV DESC
               )
              WHERE ROWNUM = 1
           );

          V_ROWS := SQL%ROWCOUNT;
        END IF;

        :out_rows := V_ROWS;
      END;
    `;

    const result = await execute(sql, {
      idiproc: { val: Number(params.idiproc), type: oracledb.NUMBER },
      codexec: {
        val: params.codexec == null ? null : Number(params.codexec),
        type: oracledb.NUMBER,
      },
      codwcp: {
        val: params.codwcp == null ? null : Number(params.codwcp),
        type: oracledb.NUMBER,
      },
      marcarInicio: { val: params.marcarInicio ? 1 : 0, type: oracledb.NUMBER },
      marcarFinal: { val: params.marcarFinal ? 1 : 0, type: oracledb.NUMBER },
      out_rows: {
        dir: oracledb.BIND_OUT,
        type: oracledb.NUMBER,
      },
    });

    return Number(firstOut(result.outBinds ?? {}, "out_rows") ?? 0);
  }

  async aceitarOp(
    idiproc: number,
    codexec?: number | null,
    codwcp?: number | null,
  ): Promise<AtualizacaoExecucaoOpResult> {
    const atividadeRowsAffected = await this.garantirAtividadeExecucaoOp({
      idiproc,
      codexec,
      codwcp,
      marcarInicio: false,
      marcarFinal: false,
    });

    const opSql = `
      UPDATE TPRIPROC P
         SET P.STATUSPROC = 'A',
             P.DHINST = NVL(P.DHINST, SYSDATE)
       WHERE P.IDIPROC = :idiproc
    `;

    const opResult = await execute(opSql, {
      idiproc: { val: Number(idiproc), type: oracledb.NUMBER },
    });

    return {
      opRowsAffected: opResult.rowsAffected ?? 0,
      atividadeRowsAffected,
    };
  }

  async iniciarAtividade(
    idiproc: number,
    codexec?: number | null,
    codwcp?: number | null,
  ): Promise<AtualizacaoExecucaoOpResult> {
    const atividadeRowsAffected = await this.garantirAtividadeExecucaoOp({
      idiproc,
      codexec,
      codwcp,
      marcarInicio: true,
      marcarFinal: false,
    });

    const opSql = `
      UPDATE TPRIPROC P
         SET P.STATUSPROC = 'A',
             P.DHINST = NVL(P.DHINST, SYSDATE)
       WHERE P.IDIPROC = :idiproc
    `;

    const opResult = await execute(opSql, {
      idiproc: { val: Number(idiproc), type: oracledb.NUMBER },
    });

    return {
      opRowsAffected: opResult.rowsAffected ?? 0,
      atividadeRowsAffected,
    };
  }

  async finalizarAtividade(
    idiproc: number,
    codexec?: number | null,
    codwcp?: number | null,
  ): Promise<number> {
    return this.garantirAtividadeExecucaoOp({
      idiproc,
      codexec,
      codwcp,
      marcarInicio: true,
      marcarFinal: true,
    });
  }
}
