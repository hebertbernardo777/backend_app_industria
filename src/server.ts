// src/server.ts
import "dotenv/config";
import fs from "fs";
import path from "path";
import https from "https";
import http from "http";
import express from "express";
import cors from "cors";
import helmet from "helmet";

import routes from "./routes/index.js";
import { ENV } from "./config/env.js";

// -------------------- Express app --------------------
const app = express();

// Middlewares básicos
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// (Opcional) arquivos estáticos de uploads, se usar ENV.UPLOAD_PATH
if (ENV.UPLOAD_PATH) {
  app.use("/uploads", express.static(path.resolve(ENV.UPLOAD_PATH)));
}

// Healthcheck
app.get("/health", (_req, res) =>
  res.json({ ok: true, time: new Date().toISOString() })
);

// Rotas da aplicação
app.use(routes);

// Tratador de erros no final
app.use((
  err: any,
  _req: express.Request,
  res: express.Response,
  _next: express.NextFunction
) => {
  console.error(err);
  res.status(err.status ?? 500).json({
    error: true,
    message: err.message ?? "Erro interno",
  });
});

// -------------------- HTTPS bootstrap --------------------
const resolveFromRoot = (p: string) =>
  path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);

const certPath = resolveFromRoot(ENV.TLS_CERT_PATH);
const keyPath = resolveFromRoot(ENV.TLS_KEY_PATH);

if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
  try {
    console.log("Conteúdo da pasta dos certs:", fs.readdirSync(path.dirname(certPath)));
  } catch {}
  console.error("❌ Cert/Key não encontrados:", { certPath, keyPath });
  process.exit(1);
}

const httpsServer = https.createServer(
  {
    cert: fs.readFileSync(certPath),
    key: fs.readFileSync(keyPath),
    minVersion: "TLSv1.2",
  },
  app
);

// Ajustes de keep-alive
httpsServer.keepAliveTimeout = 65_000;
httpsServer.headersTimeout = 66_000;

httpsServer.listen(ENV.HTTPS_PORT, () => {
  console.log(`✅ HTTPS na porta ${ENV.HTTPS_PORT}`);
});

// (Opcional) HTTP → HTTPS
if (ENV.ENABLE_HTTP_REDIRECT) {
  const httpApp = (req: any, res: any) => {
    const host = req.headers.host?.split(":")[0] || "localhost";
    res.writeHead(301, { Location: `https://${host}:${ENV.HTTPS_PORT}${req.url}` });
    res.end();
  };
  http.createServer(httpApp).listen(ENV.HTTP_PORT, () => {
    console.log(`↪️ HTTP ${ENV.HTTP_PORT} → HTTPS ${ENV.HTTPS_PORT}`);
  });
}
