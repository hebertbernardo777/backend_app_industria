import oracledb from "oracledb";
import { query } from "../infra/oracleClient.js";

export type ProdutoEtiquetaRow = {
  CODPROD: number;
  DESCRPROD: string;
  AD_QTDPC: number | null;
};

export class ProdutosRepository {
  async listarProdutosEtiqueta(): Promise<ProdutoEtiquetaRow[]> {
    const sql = `
      SELECT
        CODPROD,
        DESCRPROD,
        AD_QTDPC
      FROM TGFPRO
      WHERE CODGRUPOPROD IN (40200,42000)
      ORDER BY DESCRPROD
    `;

    const rows = await query<ProdutoEtiquetaRow>(sql, {}, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
    });

    return rows;
  }
}