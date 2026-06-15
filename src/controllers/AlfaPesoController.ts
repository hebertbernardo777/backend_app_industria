import type { Request, Response } from "express";
import { AlfaPesoService } from "../services/AlfaPesoService.js";

const service = new AlfaPesoService();

type DwordWordOrder = "low-high" | "high-low";

function getSingleQueryValue(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return undefined;
}

function toOptionalNumber(v: unknown): number | undefined {
  const s = getSingleQueryValue(v);
  if (s == null || s.trim() === "") return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

// ====== Proteções ======

// 1) Allowlist de IP (SSRF). Ajuste conforme sua rede.
function isAllowedIp(ip: string) {
  // Exemplo: apenas 10.0.10.x (ajuste para suas subredes)
  return /^10\.0\.10\.\d{1,3}$/.test(ip);
}

// 2) Cooldown por device (evita spam do polling)
const lastByDevice = new Map<string, number>();
function allowCooldown(key: string, minIntervalMs = 200) {
  const now = Date.now();
  const last = lastByDevice.get(key) ?? 0;
  if (now - last < minIntervalMs) return false;
  lastByDevice.set(key, now);
  return true;
}

// 3) Fila/limite de concorrência global (evita cascata de TCP)
let inflight = 0;
const MAX_INFLIGHT = 2;
const queue: Array<() => void> = [];

async function runLimited<T>(fn: () => Promise<T>): Promise<T> {
  if (inflight >= MAX_INFLIGHT) {
    await new Promise<void>((resolve) => queue.push(resolve));
  }
  inflight++;
  try {
    return await fn();
  } finally {
    inflight--;
    const next = queue.shift();
    if (next) next();
  }
}

function classifyError(err: any): { status: number; code: string } {
  const msg = String(err?.message ?? err);

  // Se você implementar no service: (e as any).code = "TIMEOUT"
  if (err?.code === "TIMEOUT") return { status: 504, code: "TIMEOUT" };

  if (
    msg.includes("TCP Connection Timed Out") ||
    msg.includes("Timed Out") ||
    err?.code === "ETIMEDOUT"
  ) {
    return { status: 504, code: "TIMEOUT" };
  }

  // erro de parâmetro já vem do seu service como Error(... 'Parâmetro...')
  if (msg.includes("Parâmetro")) return { status: 400, code: "BAD_REQUEST" };

  return { status: 500, code: "MODBUS_ERROR" };
}

export class AlfaPesoController {
  static async obterPeso(req: Request, res: Response) {
    try {
      const ip = getSingleQueryValue(req.query.ip)?.trim();

      if (!ip) {
        return res.status(400).json({
          ok: false,
          error: "BAD_REQUEST",
          message: "Parâmetro 'ip' é obrigatório.",
        });
      }

      // SSRF guard
      if (!isAllowedIp(ip)) {
        return res.status(403).json({
          ok: false,
          error: "IP_NOT_ALLOWED",
          message: "IP não permitido.",
        });
      }

      const port = toOptionalNumber(req.query.port);
      const unitId = toOptionalNumber(req.query.unitId);
      const timeoutMs = toOptionalNumber(req.query.timeoutMs);

      // defaults coerentes (mantém compatível com seu service)
      const portEff = port ?? 5000;
      const unitEff = unitId ?? 1;

      // Cooldown por device
      const deviceKey = `${ip}:${portEff}:${unitEff}`;
      if (!allowCooldown(deviceKey, 200)) {
        // 429 = Too Many Requests
        return res.status(429).json({
          ok: false,
          error: "TOO_MANY_REQUESTS",
          message: "Muitas leituras em sequência. Aguarde um instante.",
        });
      }

      const dwordWordOrderRaw = getSingleQueryValue(req.query.dwordWordOrder);
      const dwordWordOrder: DwordWordOrder | undefined =
        dwordWordOrderRaw === "low-high" || dwordWordOrderRaw === "high-low"
          ? dwordWordOrderRaw
          : undefined;

      // Protege de cascata: limita concorrência
      const data = await runLimited(() =>
        service.lerPeso({
          ip,
          port: portEff,
          unitId: unitEff,
          timeoutMs,
          dwordWordOrder,
        })
      );

      return res.json({
        ok: true,
        ...data,
      });
    } catch (error: any) {
      const { status, code } = classifyError(error);

      return res.status(status).json({
        ok: false,
        error: code,
        message: error?.message || "Erro ao ler peso da balança",
      });
    }
  }
}