import oracledb from "oracledb";
import jwt, { Secret, SignOptions } from "jsonwebtoken";
import { ENV } from "../config/env.js";

type FlagSN = "S" | "N";

type AuthUserRow = {
  CODIGO: number;
  USERNAME: string;
  ATIVO: string;
  CODEQPEXP: number | null;
  TELA_CONFERENCIA: FlagSN | null;
  ADMINTERMINAL: FlagSN | null;
  OPERADOR: FlagSN | null;
  LANCAREFUGO: FlagSN | null;
  IMPRIMESEMOP: FlagSN | null;
};

function normalizeFlag(value: unknown): FlagSN {
  return String(value ?? "N").trim().toUpperCase() === "S" ? "S" : "N";
}

export class AuthService {
  /**
   * Autentica no AD_ETIQUETAUSERS (sem hash) e gera JWT.
   */
  static async authenticate(username: string, password: string) {
    const sql = `
      SELECT
        CODIGO,
        USERNAME,
        ATIVO,
        CODEQPEXP,
        NVL(ADMINTERMINAL, 'N') AS ADMINTERMINAL,
        NVL(TELA_CONFERENCIA, 'N') AS TELA_CONFERENCIA,
        NVL(OPERADOR, 'N') AS OPERADOR,
        NVL(LANCAREFUGO, 'N') AS LANCAREFUGO,
        NVL(IMPRIMESEMOP, 'N') AS IMPRIMESEMOP
      FROM AD_ETIQUETAUSERS
      WHERE UPPER(USERNAME) = UPPER(:username)
        AND PASSWORD = :password
        AND ATIVO = 'S'
    `;

    let conn: oracledb.Connection | undefined;

    try {
      conn = await oracledb.getConnection({
        user: ENV.DB_USER,
        password: ENV.DB_PASS,
        connectString: ENV.DB_CONNECT_STRING,
      });

      const result = await conn.execute<AuthUserRow>(
        sql,
        { username, password },
        {
          outFormat: oracledb.OUT_FORMAT_OBJECT,
          maxRows: 1,
        }
      );

      const row = result.rows?.[0];

      if (!row) {
        throw Object.assign(
          new Error("Credenciais inválidas ou usuário inativo."),
          { status: 401 }
        );
      }

      const adminTerminal = normalizeFlag(row.ADMINTERMINAL);
      const telaConferencia = normalizeFlag(row.TELA_CONFERENCIA);
      const operador = normalizeFlag(row.OPERADOR);
      const lancaRefugo = normalizeFlag(row.LANCAREFUGO);
      const imprimeSemOp = normalizeFlag(row.IMPRIMESEMOP);

      const secret: Secret = (ENV.JWT_SECRET || "dev-secret") as Secret;

      const signOptions: SignOptions = {
        expiresIn: (ENV.JWT_EXPIRES_IN || "24h") as SignOptions["expiresIn"],
        issuer: "maispvc-app",
        algorithm: "HS256",
      };

      const payload = {
        codigo: row.CODIGO,
        username: row.USERNAME,
        codeEqpExp: row.CODEQPEXP,

        adminterminal: adminTerminal,
        telaConferencia,

        operador,
        lancaRefugo,
        imprimeSemOp,
      };

      const token = jwt.sign(payload, secret, signOptions);

      return {
        user: {
          codigo: row.CODIGO,
          username: row.USERNAME,
          ativo: row.ATIVO === "S",
          CODEQPEXP: row.CODEQPEXP ?? null,

          adminterminal: adminTerminal,
          TELA_CONFERENCIA: telaConferencia,

          OPERADOR: operador,
          LANCAREFUGO: lancaRefugo,
          IMPRIMESEMOP: imprimeSemOp,
        },
        token,
      };
    } finally {
      try {
        await conn?.close();
      } catch {}
    }
  }

  /**
   * Troca de senha simples (sem hash) — valida oldPassword antes.
   */
  static async changePassword(params: {
    codigo: number;
    username: string;
    oldPassword: string;
    newPassword: string;
  }) {
    const { codigo, username, oldPassword, newPassword } = params;

    const sqlCheck = `
      SELECT CODIGO
      FROM AD_ETIQUETAUSERS
      WHERE CODIGO = :codigo
        AND UPPER(USERNAME) = UPPER(:username)
        AND PASSWORD = :oldPassword
        AND ATIVO = 'S'
    `;

    const sqlUpdate = `
      UPDATE AD_ETIQUETAUSERS
      SET PASSWORD = :newPassword
      WHERE CODIGO = :codigo
    `;

    let conn: oracledb.Connection | undefined;

    try {
      conn = await oracledb.getConnection({
        user: ENV.DB_USER,
        password: ENV.DB_PASS,
        connectString: ENV.DB_CONNECT_STRING,
      });

      const check = await conn.execute(
        sqlCheck,
        { codigo, username, oldPassword },
        {
          outFormat: oracledb.OUT_FORMAT_OBJECT,
          maxRows: 1,
        }
      );

      if (!check.rows || check.rows.length === 0) {
        throw Object.assign(new Error("Senha atual inválida."), {
          status: 400,
        });
      }

      const upd = await conn.execute(
        sqlUpdate,
        { newPassword, codigo },
        { autoCommit: true }
      );

      if ((upd.rowsAffected ?? 0) === 0) {
        throw Object.assign(
          new Error("Não foi possível atualizar a senha."),
          { status: 500 }
        );
      }
    } finally {
      try {
        await conn?.close();
      } catch {}
    }
  }
}