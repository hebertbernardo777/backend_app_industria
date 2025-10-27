import "dotenv/config";

export const ENV = {
  NODE_ENV: process.env.NODE_ENV ?? "development",

  HTTPS_PORT: Number(process.env.HTTPS_PORT ?? 5001),
  HTTP_PORT: Number(process.env.HTTP_PORT ?? 5000),
  ENABLE_HTTP_REDIRECT: (process.env.ENABLE_HTTP_REDIRECT ?? "false") === "true",
  TLS_CERT_PATH: process.env.TLS_CERT_PATH ?? "./src/certs/server.crt",
  TLS_KEY_PATH: process.env.TLS_KEY_PATH ?? "./src/certs/server.key",
  UPLOAD_PATH: process.env.UPLOAD_PATH ?? "/mnt/chamados",

  // ORACLE
  DB_USER: process.env.DB_SANKHYA_USER ?? "sankhya",
  DB_PASS: process.env.DB_SANKHYA_PASS ?? "tecsis",
  DB_CONNECT_STRING: process.env.DB_SANKHYA_URL ?? "10.0.10.244:1521/ORCL",
} as const;