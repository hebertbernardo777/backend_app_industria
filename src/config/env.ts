// src/config/env.ts
import "dotenv/config";

function str(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() !== "" ? value : fallback;
}

function num(name: string, fallback: number): number {
  const value = process.env[name];

  if (value == null || value.trim() === "") {
    return fallback;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const value = process.env[name];

  if (value == null || value.trim() === "") {
    return fallback;
  }

  return value === "true" || value === "1" || value.toLowerCase() === "yes";
}

export const ENV = {
  NODE_ENV: str("NODE_ENV", "development"),

  HTTP_PORT: num("HTTP_PORT", 5010),

  HTTPS_PORT: num("HTTPS_PORT", 6001),
  ENABLE_HTTP_REDIRECT: bool("ENABLE_HTTP_REDIRECT", false),

  TLS_CERT_PATH: str("TLS_CERT_PATH", "./src/certs/server.crt"),
  TLS_KEY_PATH: str("TLS_KEY_PATH", "./src/certs/server.key"),

  UPLOAD_PATH: str("UPLOAD_PATH", "/mnt/chamados"),

  JWT_SECRET: str("JWT_SECRET", "d8963cc9bd491cfa5264d994696c1bb7"),
  JWT_EXPIRES_IN: str("JWT_EXPIRES_IN", "24h"),

  // ORACLE
  DB_USER: str("DB_SANKHYA_USER", "sankhya"),
  DB_PASS: str("DB_SANKHYA_PASS", "tecsis"),
  DB_CONNECT_STRING: str("DB_SANKHYA_URL", "10.0.10.244:1521/ORCL"),

  // ZPL Zebra
  PRINTER_IP: str("PRINTER_IP", "10.0.0.50"),
  PRINTER_PORT: num("PRINTER_PORT", 9100),

  LOGO_PATH: str("LOGO_PATH", "./src/assets/logo.png"),
  ZPL_DPI: num("ZPL_DPI", 300),

  COMPANY_NAME: str("COMPANY_NAME", "MAISPVC Indústria e Comércio"),
  COMPANY_ADDR1: str("COMPANY_ADDR1", "Rua Exemplo, 1000 - Distrito Industrial"),
  COMPANY_ADDR2: str("COMPANY_ADDR2", "Goiânia GO 74000-000"),
  COMPANY_ADDR3: str("COMPANY_ADDR3", "Brasil"),
  COMPANY_UF: str("COMPANY_UF", "GO"),
  COMPANY_PERMIT_LABEL: str("COMPANY_PERMIT_LABEL", "Permit"),
  COMPANY_PERMIT_NUM: num("COMPANY_PERMIT_NUM", 123456),
} as const;