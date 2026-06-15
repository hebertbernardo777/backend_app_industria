// src/server.ts
import "dotenv/config";

import http from "http";
import path from "path";
import express from "express";
import cors from "cors";
import helmet from "helmet";

import routes from "./routes/index.js";
import { ENV } from "./config/env.js";

// -------------------- Express app --------------------
const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Arquivos estáticos de uploads
if (ENV.UPLOAD_PATH) {
  app.use("/uploads", express.static(path.resolve(ENV.UPLOAD_PATH)));
}

// Healthcheck
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    env: ENV.NODE_ENV,
    time: new Date().toISOString(),
  });
});

// Rotas da aplicação
app.use(routes);

// Tratador de erros
app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("Erro na aplicação:", err);

    res.status(err.status ?? 500).json({
      error: true,
      message: err.message ?? "Erro interno",
    });
  }
);

// -------------------- HTTP bootstrap --------------------
const httpServer = http.createServer(app);

httpServer.keepAliveTimeout = 65_000;
httpServer.headersTimeout = 66_000;

httpServer.listen(ENV.HTTP_PORT, () => {
  console.log(`✅ Servidor HTTP rodando na porta ${ENV.HTTP_PORT}`);
  console.log(`🌎 Ambiente: ${ENV.NODE_ENV}`);
});

// Encerramento limpo para PM2
function gracefulShutdown(signal: string) {
  console.log(`\n${signal} recebido. Encerrando servidor...`);

  httpServer.close((err) => {
    if (err) {
      console.error("Erro ao encerrar servidor HTTP:", err);
      process.exit(1);
    }

    console.log("✅ Servidor HTTP encerrado com sucesso.");
    process.exit(0);
  });

  setTimeout(() => {
    console.error("Forçando encerramento após timeout.");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));