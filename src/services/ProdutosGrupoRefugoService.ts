import oracledb from "oracledb";
import { ENV } from "../config/env.js";

export type ProdutoGrupoRow = {
  CODPROD: number;
  DESCRPROD: string;
};

export class ProdutosGrupoRefugoService {
  static async listarProdutosGrupo(): Promise<ProdutoGrupoRow[]> {
    const sql = `
      SELECT
        CODPROD,
        DESCRPROD
      FROM TGFPRO
      WHERE CODGRUPOPROD IN (70100, 70200, 70700)
      ORDER BY DESCRPROD
    `;

    let conn: oracledb.Connection | undefined;

    try {
      conn = await oracledb.getConnection({
        user: ENV.DB_USER,
        password: ENV.DB_PASS,
        connectString: ENV.DB_CONNECT_STRING,
      });

      const r = await conn.execute(
        sql,
        {},
        {
          outFormat: oracledb.OUT_FORMAT_OBJECT,
        }
      );

      return (r.rows as ProdutoGrupoRow[]) ?? [];
    } finally {
      try {
        await conn?.close();
      } catch {}
    }
  }
}