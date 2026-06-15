// src/utils/barcode.ts

export type BarcodeType = "EAN13" | "EAN8" | "UPCA" | "ITF14" | "CODE128" | "QR";

/** Calcula DV EAN-13 a partir de 12 dígitos. Retorna os 13 dígitos. */
export function ean13From12(base12: string): string {
  if (!/^\d{12}$/.test(base12)) {
    throw new Error("EAN-13 requer exatamente 12 dígitos base.");
  }
  const nums = base12.split("").map(Number);
  const sum = nums.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0);
  const dv = (10 - (sum % 10)) % 10;
  return base12 + dv;
}

/** Calcula DV EAN-8 a partir de 7 dígitos. Retorna os 8 dígitos. */
export function ean8From7(base7: string): string {
  if (!/^\d{7}$/.test(base7)) {
    throw new Error("EAN-8 requer exatamente 7 dígitos base.");
  }
  const n = base7.split("").map(Number);
  const sum = n.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  const dv = (10 - (sum % 10)) % 10;
  return base7 + dv;
}

/** Calcula DV UPC-A a partir de 11 dígitos. Retorna 12 dígitos. */
export function upcaFrom11(base11: string): string {
  if (!/^\d{11}$/.test(base11)) {
    throw new Error("UPC-A requer exatamente 11 dígitos base.");
  }
  const n = base11.split("").map(Number);
  const odd = n.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0);   // posições 1,3,5...
  const even = n.filter((_, i) => i % 2 === 1).reduce((a, b) => a + b, 0);  // posições 2,4,6...
  const sum = odd * 3 + even;
  const dv = (10 - (sum % 10)) % 10;
  return base11 + dv;
}

/** Calcula DV ITF-14 a partir de 13 dígitos. Retorna 14 dígitos. */
export function itf14From13(base13: string): string {
  if (!/^\d{13}$/.test(base13)) {
    throw new Error("ITF-14 requer exatamente 13 dígitos base.");
  }
  const n = base13.split("").map(Number);
  const sum = n.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0); // peso 3 nas posições ímpares (1,3,5... considerando 1-based)
  const dv = (10 - (sum % 10)) % 10;
  return base13 + dv;
}

/** Para Code128/QR, apenas valida caracteres básicos. */
export function normalizeFreeData(data: string): string {
  if (data == null || data === "") throw new Error("Dados vazios.");
  // Permite ASCII imprimível comum; ajuste se quiser restringir
  if (!/^[\x20-\x7E]+$/.test(data)) {
    throw new Error("Dados contêm caracteres não imprimíveis; ajuste/escape conforme necessidade.");
  }
  return data;
}

/**
 * Gera a string final para a simbologia solicitada:
 * - EAN13: entra com 12 → sai 13 (com DV). Se entrar com 13, valida DV.
 * - EAN8: entra com 7 → sai 8 (com DV). Se entrar com 8, valida DV.
 * - UPCA: entra com 11 → sai 12 (com DV). Se entrar com 12, valida DV.
 * - ITF14: entra com 13 → sai 14 (com DV). Se entrar com 14, valida DV.
 * - CODE128/QR: retorna a própria string (apenas validação básica).
 */
export function generateBarcodeString(type: BarcodeType, input: string): string {
  switch (type) {
    case "EAN13":
      if (/^\d{12}$/.test(input)) return ean13From12(input);
      if (/^\d{13}$/.test(input)) {
        const generated = ean13From12(input.slice(0, 12));
        if (generated !== input) throw new Error("EAN-13 com DV inválido.");
        return input;
      }
      throw new Error("EAN-13 aceita 12 (gera DV) ou 13 dígitos (valida DV).");

    case "EAN8":
      if (/^\d{7}$/.test(input)) return ean8From7(input);
      if (/^\d{8}$/.test(input)) {
        const generated = ean8From7(input.slice(0, 7));
        if (generated !== input) throw new Error("EAN-8 com DV inválido.");
        return input;
      }
      throw new Error("EAN-8 aceita 7 (gera DV) ou 8 dígitos (valida DV).");

    case "UPCA":
      if (/^\d{11}$/.test(input)) return upcaFrom11(input);
      if (/^\d{12}$/.test(input)) {
        const generated = upcaFrom11(input.slice(0, 11));
        if (generated !== input) throw new Error("UPC-A com DV inválido.");
        return input;
      }
      throw new Error("UPC-A aceita 11 (gera DV) ou 12 dígitos (valida DV).");

    case "ITF14":
      if (/^\d{13}$/.test(input)) return itf14From13(input);
      if (/^\d{14}$/.test(input)) {
        const generated = itf14From13(input.slice(0, 13));
        if (generated !== input) throw new Error("ITF-14 com DV inválido.");
        return input;
      }
      throw new Error("ITF-14 aceita 13 (gera DV) ou 14 dígitos (valida DV).");

    case "CODE128":
    case "QR":
      return normalizeFreeData(input);

    default:
      // assegura exaustividade
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _exhaustive: never = type;
      throw new Error(`Simbologia não suportada: ${type}`);
  }
}
