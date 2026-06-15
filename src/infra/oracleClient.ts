import oracledb from "oracledb";
import { ENV } from "../config/env.js";

/**
 * oracledb v6 usa modo THIN por padrão (sem client Oracle).
 * Se você NÃO chamar initOracleClient(), ele permanece em THIN mode.
 */

let pool: oracledb.Pool | null = null;

export async function getPool() {
  if (pool) return pool;

  pool = await oracledb.createPool({
    user: ENV.DB_USER,
    password: ENV.DB_PASS,
    connectString: ENV.DB_CONNECT_STRING,
    poolMin: 1,
    poolMax: 10,
    poolIncrement: 1,
    queueTimeout: 60000,       // 60s
    sessionCallback: undefined // se precisar setar NLS, etc.
  });

  // Fechamento gracioso
  const close = async () => {
    if (pool) {
      try {
        await pool.close(10); // 10s p/ conexões finalizarem
        // eslint-disable-next-line no-console
        console.log("🔌 Oracle pool fechado.");
      } catch (e) {
        console.error("Erro ao fechar pool Oracle:", e);
      }
      pool = null;
    }
  };

  process.on("SIGINT", async () => { await close(); process.exit(0); });
  process.on("SIGTERM", async () => { await close(); process.exit(0); });

  return pool;
}

export async function withConnection<T>(fn: (conn: oracledb.Connection) => Promise<T>): Promise<T> {
  const p = await getPool();
  const conn = await p.getConnection();
  try {
    return await fn(conn);
  } finally {
    await conn.close();
  }
}

/** SELECT helper: retorna rows como objetos */
export async function query<T = any>(
  sql: string,
  binds: oracledb.BindParameters = {},
  options: oracledb.ExecuteOptions = {}
): Promise<T[]> {
  return withConnection(async (conn) => {
    const result = await conn.execute<T>(sql, binds, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      ...options,
    });
    // @ts-ignore
    return (result.rows ?? []) as T[];
  });
}

/** DML helper (INSERT/UPDATE/DELETE) com autoCommit */
export async function exec(
  sql: string,
  binds: oracledb.BindParameters = {},
  options: oracledb.ExecuteOptions = {}
): Promise<oracledb.Result<any>> {
  return withConnection(async (conn) => {
    const res = await conn.execute(sql, binds, { autoCommit: true, ...options });
    return res;
  });
}

export async function execute(
  sql: string,
  binds: Record<string, any> = {}
): Promise<oracledb.Result<any>> {
  const pool = await getPool();
  const conn = await pool.getConnection();

  try {
    const result = await conn.execute(sql, binds, {
      autoCommit: true,
    });

    return result;
  } finally {
    await conn.close();
  }
}