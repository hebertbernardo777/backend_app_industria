import oracledb from "oracledb";
import { ENV } from "../config/env.js";

export type CarroTransporteRow = {
  CODIGO: number;
  DESCRVEICULO: string;
  TARA: number | null;
};

export class CarrosTransporteService {
  async listar(): Promise<CarroTransporteRow[]> {
    const sql = `
      SELECT
        CODIGO,
        DESCRVEICULO,
        TARA
      FROM AD_CARROTRANSPORTEPROD
      ORDER BY DESCRVEICULO
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

      return (r.rows as CarroTransporteRow[]) ?? [];
    } finally {
      try {
        await conn?.close();
      } catch {}
    }
  }
}