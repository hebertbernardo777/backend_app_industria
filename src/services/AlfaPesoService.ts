// src/services/AlfaPesoService.ts
import * as modbusSerial from "modbus-serial";

export type AlfaWeightUnit = "g" | "kg" | "t" | "unknown";

export type AlfaPesoResponse = {
  ip: string;
  port: number;
  unitId: number;
  raw: {
    reg80: number;
    reg81: number;
    reg82: number;
    reg83: number;
    reg84: number;
    reg85: number;
  };
  status: {
    casasDecimais: number;
    negativo: boolean;
    instavel: boolean;
    saturacao: boolean;
    sobrecarga: boolean;
    zero: boolean;
    unidade: AlfaWeightUnit;
    bruto: boolean;
  };
  pesoBrutoInteiro: number;
  peso: number;
  taraInteiro: number;
  tara: number;
};

type LerPesoParams = {
  ip: string;
  port?: number;
  unitId?: number;
  timeoutMs?: number;
  dwordWordOrder?: "low-high" | "high-low";
};

type ModbusErrorCode =
  | "TIMEOUT"
  | "ECONNREFUSED"
  | "ECONNRESET"
  | "EHOSTUNREACH"
  | "ENETUNREACH"
  | "BAD_REQUEST"
  | "MODBUS_ERROR";

type ControlledModbusError = Error & {
  code: ModbusErrorCode;
  status: number;
  originalMessage?: string;
};

type ModbusRegisterResponse = {
  data: number[];
};

const DEFAULT_PORT = 5000;
const DEFAULT_UNIT_ID = 1;
const DEFAULT_TIMEOUT_MS = 2000;
const MIN_TIMEOUT_MS = 300;
const MAX_TIMEOUT_MS = 10000;

const MODBUS_GUARD_KEY = Symbol.for("maispvc.alfa.modbus.guard.installed");

function logAlfa(message: string, data?: Record<string, any>) {
  console.log(
    `[ALFA_MODBUS] ${new Date().toISOString()} | ${message}`,
    data ?? {}
  );
}

function getModbusRTUConstructor(): any {
  const anyMod: any = modbusSerial as any;
  return anyMod?.default ?? anyMod?.ModbusRTU ?? anyMod;
}

function toUInt16(v: number): number {
  return v & 0xffff;
}

function toUInt32FromWords(
  w1: number,
  w2: number,
  order: "low-high" | "high-low" = "low-high"
): number {
  const a = toUInt16(w1);
  const b = toUInt16(w2);

  if (order === "low-high") {
    return ((b << 16) >>> 0) | a;
  }

  return ((a << 16) >>> 0) | b;
}

function parseUnidade(reg80: number): AlfaWeightUnit {
  const unidadeCode = (reg80 >> 9) & 0x0f;

  switch (unidadeCode) {
    case 1:
      return "g";
    case 2:
      return "kg";
    case 3:
      return "t";
    default:
      return "unknown";
  }
}

function parseStatusPeso(reg80: number, reg81: number) {
  const casasDecimais = reg80 & 0b111;
  const negativo = ((reg80 >> 3) & 1) === 1;
  const instavel = ((reg80 >> 4) & 1) === 1;
  const saturacao = ((reg80 >> 5) & 1) === 1;
  const sobrecarga = ((reg80 >> 6) & 1) === 1;
  const zero = ((reg80 >> 8) & 1) === 1;
  const unidade = parseUnidade(reg80);
  const bruto = ((reg81 >> 5) & 1) === 1;

  return {
    casasDecimais,
    negativo,
    instavel,
    saturacao,
    sobrecarga,
    zero,
    unidade,
    bruto,
  };
}

function normalizeMessage(err: any): string {
  return String(err?.message ?? err ?? "Erro desconhecido");
}

function classifyModbusError(err: any): {
  code: ModbusErrorCode;
  status: number;
  originalMessage: string;
} {
  const originalMessage = normalizeMessage(err);
  const msg = originalMessage.toLowerCase();
  const rawCode = String(err?.code ?? "").toUpperCase();

  if (
    rawCode === "TIMEOUT" ||
    rawCode === "ETIMEDOUT" ||
    msg.includes("tcp connection timed out") ||
    msg.includes("connection timed out") ||
    msg.includes("timed out") ||
    msg.includes("timeout")
  ) {
    return {
      code: "TIMEOUT",
      status: 504,
      originalMessage,
    };
  }

  if (rawCode === "ECONNREFUSED" || msg.includes("econnrefused")) {
    return {
      code: "ECONNREFUSED",
      status: 502,
      originalMessage,
    };
  }

  if (rawCode === "ECONNRESET" || msg.includes("econnreset")) {
    return {
      code: "ECONNRESET",
      status: 502,
      originalMessage,
    };
  }

  if (rawCode === "EHOSTUNREACH" || msg.includes("ehostunreach")) {
    return {
      code: "EHOSTUNREACH",
      status: 502,
      originalMessage,
    };
  }

  if (rawCode === "ENETUNREACH" || msg.includes("enetunreach")) {
    return {
      code: "ENETUNREACH",
      status: 502,
      originalMessage,
    };
  }

  if (msg.includes("parâmetro") || msg.includes("parametro")) {
    return {
      code: "BAD_REQUEST",
      status: 400,
      originalMessage,
    };
  }

  return {
    code: "MODBUS_ERROR",
    status: 502,
    originalMessage,
  };
}

function isKnownModbusNetworkError(err: any): boolean {
  const { code, originalMessage } = classifyModbusError(err);
  const msg = originalMessage.toLowerCase();

  return (
    code === "TIMEOUT" ||
    code === "ECONNREFUSED" ||
    code === "ECONNRESET" ||
    code === "EHOSTUNREACH" ||
    code === "ENETUNREACH" ||
    msg.includes("tcp connection timed out") ||
    msg.includes("modbus") ||
    msg.includes("socket")
  );
}

function createControlledError(
  err: any,
  context: {
    ip: string;
    port: number;
    unitId: number;
    timeoutMs: number;
  }
): ControlledModbusError {
  const { code, status, originalMessage } = classifyModbusError(err);

  const e = new Error(
    `(${code}) Falha ao ler peso do indicador ALFA (${context.ip}:${context.port}, unitId=${context.unitId}): ${originalMessage}`
  ) as ControlledModbusError;

  e.code = code;
  e.status = status;
  e.originalMessage = originalMessage;

  return e;
}

function installKnownModbusCrashGuardOnce() {
  const g = globalThis as any;

  if (g[MODBUS_GUARD_KEY]) return;
  g[MODBUS_GUARD_KEY] = true;

  process.on("unhandledRejection", (reason: any) => {
    if (isKnownModbusNetworkError(reason)) {
      logAlfa("UnhandledRejection Modbus capturado e ignorado para não derrubar o backend.", {
        code: reason?.code,
        message: normalizeMessage(reason),
        stack: reason?.stack,
      });
      return;
    }

    console.log("[UNHANDLED_REJECTION]", {
      at: new Date().toISOString(),
      message: normalizeMessage(reason),
      code: reason?.code,
      stack: reason?.stack,
    });
  });

  process.on("uncaughtException", (error: any) => {
    if (isKnownModbusNetworkError(error)) {
      logAlfa("UncaughtException Modbus capturada e ignorada para não derrubar o backend.", {
        code: error?.code,
        message: normalizeMessage(error),
        stack: error?.stack,
      });
      return;
    }

    console.log("[UNCAUGHT_EXCEPTION]", {
      at: new Date().toISOString(),
      message: normalizeMessage(error),
      code: error?.code,
      stack: error?.stack,
    });

    process.exitCode = 1;
  });
}

function validateParams(params: LerPesoParams) {
  const ip = String(params.ip || "").trim();

  if (!ip) {
    const e = new Error("Parâmetro 'ip' é obrigatório.") as ControlledModbusError;
    e.code = "BAD_REQUEST";
    e.status = 400;
    throw e;
  }

  const port = Number.isFinite(params.port)
    ? Number(params.port)
    : DEFAULT_PORT;

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    const e = new Error("Parâmetro 'port' inválido.") as ControlledModbusError;
    e.code = "BAD_REQUEST";
    e.status = 400;
    throw e;
  }

  const unitId = Number.isFinite(params.unitId)
    ? Number(params.unitId)
    : DEFAULT_UNIT_ID;

  if (!Number.isInteger(unitId) || unitId < 0 || unitId > 255) {
    const e = new Error("Parâmetro 'unitId' inválido.") as ControlledModbusError;
    e.code = "BAD_REQUEST";
    e.status = 400;
    throw e;
  }

  const timeoutMsRaw = Number.isFinite(params.timeoutMs)
    ? Number(params.timeoutMs)
    : DEFAULT_TIMEOUT_MS;

  const timeoutMs = Math.max(
    MIN_TIMEOUT_MS,
    Math.min(timeoutMsRaw, MAX_TIMEOUT_MS)
  );

  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    const e = new Error("Parâmetro 'timeoutMs' inválido.") as ControlledModbusError;
    e.code = "BAD_REQUEST";
    e.status = 400;
    throw e;
  }

  const dwordWordOrder = params.dwordWordOrder ?? "low-high";

  if (dwordWordOrder !== "low-high" && dwordWordOrder !== "high-low") {
    const e = new Error(
      "Parâmetro 'dwordWordOrder' inválido. Use 'low-high' ou 'high-low'."
    ) as ControlledModbusError;
    e.code = "BAD_REQUEST";
    e.status = 400;
    throw e;
  }

  return {
    ip,
    port,
    unitId,
    timeoutMs,
    dwordWordOrder,
  };
}

function promiseWithHardTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout: () => void,
  timeoutMessage: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return new Promise<T>((resolve, reject) => {
    let settled = false;

    timer = setTimeout(() => {
      if (settled) return;

      settled = true;

      try {
        onTimeout();
      } catch {}

      const e = new Error(timeoutMessage) as ControlledModbusError;
      e.code = "TIMEOUT";
      e.status = 504;

      reject(e);
    }, timeoutMs);

    promise
      .then((value) => {
        if (settled) return;

        settled = true;

        if (timer) {
          clearTimeout(timer);
          timer = null;
        }

        resolve(value);
      })
      .catch((err) => {
        if (settled) return;

        settled = true;

        if (timer) {
          clearTimeout(timer);
          timer = null;
        }

        reject(err);
      });
  });
}

export class AlfaPesoService {
  constructor() {
    installKnownModbusCrashGuardOnce();
  }

  async lerPeso(params: LerPesoParams): Promise<AlfaPesoResponse> {
    const { ip, port, unitId, timeoutMs, dwordWordOrder } =
      validateParams(params);

    const ModbusRTU = getModbusRTUConstructor();
    const client = new ModbusRTU();
    
    let closed = false;
    let sock: any = null;
    let portObj: any = null;

    const safeClose = () => {
      if (closed) return;
      closed = true;

      try {
        if ((client as any)?.isOpen) {
          client.close();
          return;
        }
        client.close();
      } catch {}

      try { sock?.destroy?.(); } catch {}
      try { portObj?.close?.(); } catch {}
    };

    // Ajuste no listener do cliente: ele agora também força o fechamento seguro do canal
    const onClientError = (err: any) => {
      logAlfa("Erro emitido pelo cliente Modbus (Event Listener).", {
        ip,
        port,
        unitId,
        message: normalizeMessage(err),
      });
      safeClose();
    };
    client.on("error", onClientError);

    const onSocketError = (err: any) => {
      logAlfa("Socket error capturado.", {
        ip,
        port,
        unitId,
        code: err?.code,
        message: normalizeMessage(err),
      });
      safeClose();
    };

    const onSocketTimeout = () => {
      logAlfa("Socket timeout capturado.", { ip, port, unitId, timeoutMs });
      safeClose();
    };

    const onSocketClose = () => {
      logAlfa("Socket fechado.", { ip, port, unitId });
    };

    const attachSocketGuards = () => {
      try {
        portObj = (client as any)?._port ?? null;

        const candidates = [
          (client as any)?._port?._client,
          (client as any)?._port?._socket,
          (client as any)?._port?.client,
          (client as any)?._client,
          (client as any)?.client,
        ].filter(Boolean);

        sock = candidates[0] ?? null;

        if (portObj?.on) {
          portObj.on("error", onSocketError);
          portObj.on("timeout", onSocketTimeout);
          portObj.on("close", onSocketClose);
        }

        if (sock?.on) {
          sock.on("error", onSocketError);
          sock.on("timeout", onSocketTimeout);
          sock.on("close", onSocketClose);
        }
      } catch (err) {
        logAlfa("Falha ao anexar guards do socket.", {
          ip, port, unitId, message: normalizeMessage(err),
        });
      }
    };

    const detachSocketGuards = () => {
      try {
        if (portObj?.off) {
          portObj.off("error", onSocketError);
          portObj.off("timeout", onSocketTimeout);
          portObj.off("close", onSocketClose);
        } else if (portObj?.removeListener) {
          portObj.removeListener("error", onSocketError);
          portObj.removeListener("timeout", onSocketTimeout);
          portObj.removeListener("close", onSocketClose);
        }

        if (sock?.off) {
          sock.off("error", onSocketError);
          sock.off("timeout", onSocketTimeout);
          sock.off("close", onSocketClose);
        } else if (sock?.removeListener) {
          sock.removeListener("error", onSocketError);
          sock.removeListener("timeout", onSocketTimeout);
          sock.removeListener("close", onSocketClose);
        }
      } catch {}
    };

    try {
      logAlfa("Iniciando leitura de peso.", {
        ip, port, unitId, timeoutMs, dwordWordOrder,
      });

      client.setTimeout(timeoutMs);

      // CORREÇÃO: Não adianta chamar attachSocketGuards() aqui antes do connectTCP 
      // porque o socket ainda não existe no ciclo interno da lib modbus-serial.

      await promiseWithHardTimeout(
        client.connectTCP(ip, { port }),
        timeoutMs + 500,
        safeClose,
        "TCP Connection Timed Out"
      );

      // Agora que conectou, o socket existe e podemos monitorá-lo diretamente
      attachSocketGuards();

      client.setID(unitId);

      const resp = await promiseWithHardTimeout<ModbusRegisterResponse>(
        client.readHoldingRegisters(80, 6) as Promise<ModbusRegisterResponse>,
        timeoutMs + 500,
        safeClose,
        "Modbus readHoldingRegisters Timed Out"
      );
      
      if (!Array.isArray(resp.data) || resp.data.length < 6) {
        throw new Error("Resposta Modbus inválida ao ler registradores 80..85.");
      }
      
      const [reg80, reg81, reg82, reg83, reg84, reg85] = resp.data.map((n) =>
        Number(n)
      );

      const status = parseStatusPeso(reg80, reg81);
      const pesoInteiro = toUInt32FromWords(reg82, reg83, dwordWordOrder);
      const taraInteiro = toUInt32FromWords(reg84, reg85, dwordWordOrder);

      let peso = pesoInteiro / Math.pow(10, status.casasDecimais);
      if (status.negativo) peso = -peso;

      const tara = taraInteiro / Math.pow(10, status.casasDecimais);

      const result: AlfaPesoResponse = {
        ip, port, unitId,
        raw: { reg80, reg81, reg82, reg83, reg84, reg85 },
        status,
        pesoBrutoInteiro: pesoInteiro,
        peso,
        taraInteiro,
        tara,
      };

      logAlfa("Leitura de peso concluída.", {
        ip, port, unitId, peso, tara, unidade: status.unidade,
      });

      return result;
    } catch (err: any) {
      const controlled = createControlledError(err, {
        ip, port, unitId, timeoutMs,
      });

      logAlfa("Erro controlado na leitura de peso.", {
        ip, port, unitId, timeoutMs,
        code: controlled.code,
        status: controlled.status,
        message: controlled.message,
        originalMessage: controlled.originalMessage,
        stack: err?.stack,
      });

      throw controlled;
    } finally {
      // Garantia de remoção do listener para evitar vazamento de memória (Memory Leak)
      try {
        client.removeListener("error", onClientError);
      } catch {}
      detachSocketGuards();
      safeClose();
    }
  }
}