// src/repositories/EtiquetasRepository.ts
import oracledb from "oracledb";
import { query, exec, withConnection } from "../infra/oracleClient.js";

export type Etiqueta = {
  SEQUENCIA: number;
  DATA: Date;
  TURNO: string | null;
  CODEMP: number;
  CODFUNC: number;
  CODPROD: number;
  PESO: number | null;
  OBS: string | null;
  CODBARRA: string | null;
};

export type Filtros = {
  sequencia?: number;
  sequencias?: number[];
  dataStr?: string; // "YYYY-MM-DD"
  fromStr?: string; // "YYYY-MM-DD"
  toStr?: string;   // "YYYY-MM-DD" (usaremos < to+1)
};

export class EtiquetasRepository {
  private async getNextSequencia(conn: oracledb.Connection): Promise<number> {
    try {
      const r = await conn.execute<{ SEQ: number }>(
        "SELECT AD_ETIQUETAS_SEQ.NEXTVAL AS SEQ FROM DUAL",
        [],
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      const row = (r.rows ?? [])[0] as any;
      if (row?.SEQ != null) return Number(row.SEQ);
    } catch {
      // sequence não existe -> fallback
    }
    const r2 = await conn.execute<{ MAXSEQ: number }>(
      "SELECT NVL(MAX(SEQUENCIA),0) AS MAXSEQ FROM AD_ETIQUETAS",
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const row2 = (r2.rows ?? [])[0] as any;
    return Number(row2?.MAXSEQ ?? 0) + 1;
  }

  async findMany(f: Filtros): Promise<Etiqueta[]> {
    const conds: string[] = [];
    const binds: any = {};

    if (f.sequencia != null) {
      conds.push("SEQUENCIA = :seq");
      binds.seq = f.sequencia;
    }
    if (f.sequencias && f.sequencias.length) {
      const ph = f.sequencias.map((_, i) => `:s${i}`);
      f.sequencias.forEach((n, i) => (binds[`s${i}`] = n));
      conds.push(`SEQUENCIA IN (${ph.join(",")})`);
    }
    if (f.dataStr) {
      conds.push(`TRUNC(DATA) = TO_DATE(:dataStr, 'YYYY-MM-DD')`);
      binds.dataStr = f.dataStr;
    }
    if (f.fromStr) {
      conds.push(`DATA >= TO_DATE(:fromStr, 'YYYY-MM-DD')`);
      binds.fromStr = f.fromStr;
    }
    if (f.toStr) {
      conds.push(`DATA < TO_DATE(:toStr, 'YYYY-MM-DD') + 1`);
      binds.toStr = f.toStr;
    }

    const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
    const sql = `
      SELECT SEQUENCIA, DATA, TURNO, CODEMP, CODFUNC, CODPROD, PESO, OBS, CODBARRA
      FROM AD_ETIQUETAS
      ${where}
      ORDER BY SEQUENCIA
    `;
    return query<Etiqueta>(sql, binds);
  }

  async findOne(sequencia: number): Promise<Etiqueta | null> {
    const rows = await query<Etiqueta>(
      `SELECT SEQUENCIA, DATA, TURNO, CODEMP, CODFUNC, CODPROD, PESO, OBS, CODBARRA
       FROM AD_ETIQUETAS
       WHERE SEQUENCIA = :seq`,
      { seq: sequencia }
    );
    return rows[0] ?? null;
  }

  async insert(data: Omit<Etiqueta, "SEQUENCIA">): Promise<number> {
    return withConnection(async (conn) => {
      const seq = await this.getNextSequencia(conn);
      await conn.execute(
        `INSERT INTO AD_ETIQUETAS
          (SEQUENCIA, DATA, TURNO, CODEMP, CODFUNC, CODPROD, PESO, OBS, CODBARRA)
         VALUES
          (:seq, :data, :turno, :codemp, :codfunc, :codprod, :peso, :obs, :codbarra)`,
        {
          seq,
          data: data.DATA,
          turno: data.TURNO,
          codemp: data.CODEMP,
          codfunc: data.CODFUNC,
          codprod: data.CODPROD,
          peso: data.PESO,
          obs: data.OBS,
          codbarra: data.CODBARRA,
        },
        { autoCommit: true }
      );
      return seq;
    });
  }

  async update(sequencia: number, patch: Partial<Omit<Etiqueta, "SEQUENCIA">>): Promise<number> {
    const sets: string[] = [];
    const b: any = { seq: sequencia };

    if ("DATA" in patch)  { sets.push("DATA = :data"); b.data = patch.DATA ?? null; }
    if ("TURNO" in patch) { sets.push("TURNO = :turno"); b.turno = patch.TURNO ?? null; }
    if ("CODEMP" in patch){ sets.push("CODEMP = :codemp"); b.codemp = patch.CODEMP ?? null; }
    if ("CODFUNC" in patch){sets.push("CODFUNC = :codfunc"); b.codfunc = patch.CODFUNC ?? null; }
    if ("CODPROD" in patch){sets.push("CODPROD = :codprod"); b.codprod = patch.CODPROD ?? null; }
    if ("PESO" in patch)  { sets.push("PESO = :peso"); b.peso = patch.PESO ?? null; }
    if ("OBS" in patch)   { sets.push("OBS = :obs"); b.obs = patch.OBS ?? null; }
    if ("CODBARRA" in patch){sets.push("CODBARRA = :codbarra"); b.codbarra = patch.CODBARRA ?? null; }

    if (!sets.length) return 0;

    const r = await exec(`UPDATE AD_ETIQUETAS SET ${sets.join(", ")} WHERE SEQUENCIA = :seq`, b);
    // @ts-ignore
    return r.rowsAffected ?? 0;
  }

  async remove(sequencia: number): Promise<number> {
    const r = await exec(`DELETE FROM AD_ETIQUETAS WHERE SEQUENCIA = :seq`, { seq: sequencia });
    // @ts-ignore
    return r.rowsAffected ?? 0;
  }
}
