import oracledb from "oracledb";
import { getPool } from "../infra/oracleClient.js";


type RetrabalhoCabecalhoInput = {
  CODEMP: number;
  CODFUNC: number;
  TURNO: string | null;
  OBS: string | null;
  TIPO_ORIGEM: "COM_ETIQUETA" | "SEM_ETIQUETA";
  CODPROD_DESTINO: number | null;
  QTD_TOTAL_ORIGEM: number | null;
  QTD_TOTAL_DESTINO: number | null;
  PESO_TOTAL_ORIGEM: number | null;
  PESO_TOTAL_DESTINO: number | null;
};

type RetrabalhoOrigemInput = {
  ID_RETRABALHO: number;
  SEQUENCIA_ETIQUETA: number;
  CODBARRA: string | null;
  CODPROD: number | null;
  QTD: number | null;
  PESO: number | null;
  STATUS_CONSUMO: string;
};

type RetrabalhoDestinoInput = {
  ID_RETRABALHO: number;
  SEQUENCIA_ETIQUETA: number;
  CODBARRA: string | null;
  CODPROD: number | null;
  QTD: number | null;
  PESO: number | null;
};

export class RetrabalhoRepository {
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
        autoCommit: false,
        ...options,
      });
      return result as oracledb.Result<T>;
    } finally {
      if (ownsConnection) {
        await conn.close();
      }
    }
  }

  async nextIdRetrabalho(connection?: oracledb.Connection): Promise<number> {
    const sql = `SELECT NVL(MAX(ID_RETRABALHO), 0) + 1 AS ID FROM AD_RETRABALHO`;
    const result = await this.exec<{ ID: number }>(sql, {}, connection);
    const row = result.rows?.[0] as any;
    return Number(row?.ID ?? 1);
  }

  async nextIdOrigem(connection?: oracledb.Connection): Promise<number> {
    const sql = `SELECT NVL(MAX(ID_ITEM_ORIGEM), 0) + 1 AS ID FROM AD_RETRABALHO_ORIGEM`;
    const result = await this.exec<{ ID: number }>(sql, {}, connection);
    const row = result.rows?.[0] as any;
    return Number(row?.ID ?? 1);
  }

  async nextIdDestino(connection?: oracledb.Connection): Promise<number> {
    const sql = `SELECT NVL(MAX(ID_ITEM_DESTINO), 0) + 1 AS ID FROM AD_RETRABALHO_DESTINO`;
    const result = await this.exec<{ ID: number }>(sql, {}, connection);
    const row = result.rows?.[0] as any;
    return Number(row?.ID ?? 1);
  }

  async insertCabecalho(input: RetrabalhoCabecalhoInput, connection?: oracledb.Connection) {
    const id = await this.nextIdRetrabalho(connection);

    const sql = `
      INSERT INTO AD_RETRABALHO (
        ID_RETRABALHO,
        DHCRIACAO,
        CODEMP,
        CODFUNC,
        TURNO,
        OBS,
        STATUS,
        TIPO_ORIGEM,
        CODPROD_DESTINO,
        QTD_TOTAL_ORIGEM,
        QTD_TOTAL_DESTINO,
        PESO_TOTAL_ORIGEM,
        PESO_TOTAL_DESTINO
      ) VALUES (
        :ID_RETRABALHO,
        SYSDATE,
        :CODEMP,
        :CODFUNC,
        :TURNO,
        :OBS,
        'PROCESSADO',
        :TIPO_ORIGEM,
        :CODPROD_DESTINO,
        :QTD_TOTAL_ORIGEM,
        :QTD_TOTAL_DESTINO,
        :PESO_TOTAL_ORIGEM,
        :PESO_TOTAL_DESTINO
      )
    `;

    await this.exec(
      sql,
      {
        ID_RETRABALHO: id,
        CODEMP: input.CODEMP,
        CODFUNC: input.CODFUNC,
        TURNO: input.TURNO,
        OBS: input.OBS,
        TIPO_ORIGEM: input.TIPO_ORIGEM,
        CODPROD_DESTINO: input.CODPROD_DESTINO,
        QTD_TOTAL_ORIGEM: input.QTD_TOTAL_ORIGEM,
        QTD_TOTAL_DESTINO: input.QTD_TOTAL_DESTINO,
        PESO_TOTAL_ORIGEM: input.PESO_TOTAL_ORIGEM,
        PESO_TOTAL_DESTINO: input.PESO_TOTAL_DESTINO,
      },
      connection
    );

    return id;
  }

  async insertOrigem(input: RetrabalhoOrigemInput, connection?: oracledb.Connection) {
    const id = await this.nextIdOrigem(connection);

    const sql = `
      INSERT INTO AD_RETRABALHO_ORIGEM (
        ID_ITEM_ORIGEM,
        ID_RETRABALHO,
        SEQUENCIA_ETIQUETA,
        CODBARRA,
        CODPROD,
        QTD,
        PESO,
        STATUS_CONSUMO
      ) VALUES (
        :ID_ITEM_ORIGEM,
        :ID_RETRABALHO,
        :SEQUENCIA_ETIQUETA,
        :CODBARRA,
        :CODPROD,
        :QTD,
        :PESO,
        :STATUS_CONSUMO
      )
    `;

    await this.exec(
      sql,
      {
        ID_ITEM_ORIGEM: id,
        ID_RETRABALHO: input.ID_RETRABALHO,
        SEQUENCIA_ETIQUETA: input.SEQUENCIA_ETIQUETA,
        CODBARRA: input.CODBARRA,
        CODPROD: input.CODPROD,
        QTD: input.QTD,
        PESO: input.PESO,
        STATUS_CONSUMO: input.STATUS_CONSUMO,
      },
      connection
    );

    return id;
  }

  async insertDestino(input: RetrabalhoDestinoInput, connection?: oracledb.Connection) {
    const id = await this.nextIdDestino(connection);

    const sql = `
      INSERT INTO AD_RETRABALHO_DESTINO (
        ID_ITEM_DESTINO,
        ID_RETRABALHO,
        SEQUENCIA_ETIQUETA,
        CODBARRA,
        CODPROD,
        QTD,
        PESO
      ) VALUES (
        :ID_ITEM_DESTINO,
        :ID_RETRABALHO,
        :SEQUENCIA_ETIQUETA,
        :CODBARRA,
        :CODPROD,
        :QTD,
        :PESO
      )
    `;

    await this.exec(
      sql,
      {
        ID_ITEM_DESTINO: id,
        ID_RETRABALHO: input.ID_RETRABALHO,
        SEQUENCIA_ETIQUETA: input.SEQUENCIA_ETIQUETA,
        CODBARRA: input.CODBARRA,
        CODPROD: input.CODPROD,
        QTD: input.QTD,
        PESO: input.PESO,
      },
      connection
    );

    return id;
  }
}