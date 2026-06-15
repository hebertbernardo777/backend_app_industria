import oracledb from "oracledb";
import net from "net";
import path from "path";
import fs from "fs";
import { ENV } from "../config/env.js";
import { pngToGFA } from "../utils/zpl-logo.js";

type EtiquetaRow = {
  CODBARRA: string;
  CODBARRAGS1: string;
  CODPROD: number;
  DESCRPROD: string | null;
  DATA: Date | string | null;
  OP: number | null;
  PCT: number | null;
  TURNO: string | number | null;
  ORDEM_CARGA: number | string | null;
};
// ---------- helpers ----------
function parseNumberClean(v: any): number {
  return Number(String(v ?? "").trim());
}

function parseIntSafe(v: any, fallback: number) {
  const n = parseNumberClean(v);
  return Number.isFinite(n) ? n : fallback;
}

function parsePort(v: any, fallback = 9100) {
  const n = parseIntSafe(v, NaN);
  return Number.isFinite(n) && n > 0 && n < 65536 ? n : fallback;
}

/** Aceita "10.0.0.49" | "10.0.0.49:9100" | "[fe80::1]:9100" */
function splitHostPort(addr: string): { host: string; port?: number } {
  let host = String(addr ?? "").trim();
  let port: number | undefined;

  const m6 = host.match(/^\[([^\]]+)\]:(\d+)$/);
  if (m6) return { host: m6[1], port: parsePort(m6[2]) };

  const m = host.match(/^(.+):(\d+)$/);
  if (m && host.indexOf(":") === host.lastIndexOf(":")) {
    host = m[1];
    port = parsePort(m[2]);
  }

  return { host, port };
}

function mmToDots(mm: number, dpi: number) {
  if (!Number.isFinite(mm) || !Number.isFinite(dpi) || dpi <= 0) {
    throw new Error(`mmToDots: parâmetros inválidos (mm=${mm}, dpi=${dpi})`);
  }
  return Math.round(mm * (dpi / 25.4));
}

function safeStr(v: any): string {
  if (v == null) return "";
  return String(v).trim();
}

function safeNum(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function formatDateBR(v: Date | string | null | undefined): string {
  if (!v) return "";
  const d = new Date(v as any);
  if (Number.isNaN(+d)) return "";
  return d.toLocaleDateString("pt-BR");
}

function formatDateTimeBR(v: Date | string | null | undefined): string {
  if (!v) return "";

  const d = new Date(v as any);
  if (Number.isNaN(+d)) return "";

  const data = d.toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const hora = d.toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });

  return `${data} - ${hora}`;
}

function onlyDigits(v: string): string {
  return String(v ?? "").replace(/\D/g, "");
}

/**
 * Escapa caracteres problemáticos para ^FD no ZPL.
 * \ => \\   ^ => \^   ~ => \~
 * Também remove quebras de linha.
 */
function zplEscape(value: any): string {
  return safeStr(value)
    .replace(/\\/g, "\\\\")
    .replace(/\^/g, "\\^")
    .replace(/~/g, "\\~")
    .replace(/\r?\n/g, " ");
}

function truncate(value: any, max: number): string {
  return safeStr(value).slice(0, max);
}

function formatQtdPct(pct: number | null): string {
  if (pct == null) return "";
  if (Number.isInteger(pct)) return `${pct}PC`;
  return `${String(pct).replace(".", ",")}PC`;
}

function getPrinterDpi() {
  const dpiParsed = parseNumberClean(ENV.ZPL_DPI);
  return Number.isFinite(dpiParsed) && dpiParsed > 0 ? dpiParsed : 203;
}

function zplEscapeQR(value: any): string {
  return safeStr(value)
    .replace(/\\/g, "\\\\")
    .replace(/\^/g, "\\^")
    .replace(/~/g, "\\~")
    .replace(/\r?\n/g, " ");
}

type PrintModel = "default" | "shipping" | "maispvc" | "maispvc-industrial";

export class PrintService {
  /**
   * Busca dados da etiqueta
   *
   * ORDEM_CARGA:
   * - por enquanto vai como NULL para não quebrar caso ainda não exista no banco
   * - se depois você tiver a coluna em AD_ETIQUETAS ou em outra tabela,
   *   basta trocar esse CAST(NULL AS NUMBER) pela coluna real
   */
  static async fetchEtiqueta(sequencia: number): Promise<EtiquetaRow | null> {
    const sql = `
      SELECT
        ETI.CODBARRA,
        ETI.CODBARRAGS1,
        ETI.OP,
        ETI.PCT,
        ETI.TURNO,
        ETI.DATA,
        PRO.CODPROD,
        PRO.DESCRPROD,
        CAST(NULL AS NUMBER) AS ORDEM_CARGA
      FROM AD_ETIQUETAS ETI
      INNER JOIN TGFPRO PRO
        ON PRO.CODPROD = ETI.CODPROD
      WHERE ETI.SEQUENCIA = :sequencia
    `;

    let conn: oracledb.Connection | undefined;

    try {
      conn = await oracledb.getConnection({
        user: ENV.DB_USER,
        password: ENV.DB_PASS,
        connectString: ENV.DB_CONNECT_STRING,
      });

      const r = await conn.execute(
        sql,
        { sequencia },
        { outFormat: oracledb.OUT_FORMAT_OBJECT, maxRows: 1 }
      );

      return (r.rows?.[0] as any) ?? null;
    } finally {
      try {
        await conn?.close();
      } catch {}
    }
  }

  /**
   * Bloco de setup da impressora.
   * Enviado antes da etiqueta para tentar forçar a configuração básica da mídia.
   *
   * Para o modelo "maispvc":
   * - 11 x 6 cm
   * - 6 dpmm (152 dpi)
   * - PW = 660
   * - LL = 360
   */
  static buildPrinterSetup(model: PrintModel = "default") {
    if (model === "default") {
      // Default: 10 x 7 cm em 203 dpi
      // 100mm x 70mm = aproximadamente 800 x 560 dots
      return [
        "^XA",
        "^CI28",
        "^PW800",
        "^LL560",
        "^LH0,0",
        "^LS0",
        "^LT0",
        "^MNW",
        "^MMT",
        "^MTT",
        "^XZ",
      ].join("\n");
    }
  
    if (model === "maispvc" || model === "maispvc-industrial") {
      return [
        "^XA",
        "^CI28",
        "^PW660",
        "^LL360",
        "^LH0,0",
        "^LS0",
        "^LT0",
        "^MNW",
        "^MMT",
        "^MTT",
        "^XZ",
      ].join("\n");
    }
  
    return [
      "^XA",
      "^CI28",
      "^LH0,0",
      "^LS0",
      "^LT0",
      "^MNW",
      "^MMT",
      "^MTT",
      "^XZ",
    ].join("\n");
  }

/** MODELO PADRÃO NOVO AJUSTADO — 10x7 cm em 203 dpi */
static async buildZpl(row: EtiquetaRow) {
  const dpi = 203;

  // 10 x 7 cm em 203 dpi
  const PW = 800;
  const LL = 560;

  const codBarra = safeStr(row.CODBARRA);
  const codBarraGs1 = safeStr((row as any).CODBARRAGS1);
  const codLinear = codBarraGs1 || codBarra;

  const codProd = safeStr(row.CODPROD);
  const descrProdOriginal = safeStr(row.DESCRPROD);
  
  // Formatando a quantidade (ex: 15 PC)
  const qtdPct = formatQtdPct(safeNum(row.PCT)) || "0PC";
  
  // Montando a String Única: CODPROD - DESCRPROD - PC
  const textoCompletoProduto = `${codProd} - ${descrProdOriginal} - ${qtdPct}`;
  const descrProd = truncate(textoCompletoProduto, 120);

  // Data incluindo a Hora
  const dataFmt = formatDateTimeBR(row.DATA);  
  const op = safeStr(row.OP) || "-";
  const ordemCarga = safeStr(row.ORDEM_CARGA) || "-";
  const turno = safeStr((row as any).TURNO) || "-";

  if (!codBarra) {
    throw new Error("Etiqueta sem CODBARRA para impressão.");
  }

  const logoPath = path.isAbsolute(ENV.LOGO_PATH)
    ? ENV.LOGO_PATH
    : path.resolve(process.cwd(), ENV.LOGO_PATH);

  if (!fs.existsSync(logoPath)) {
    throw new Error(`Logo não encontrado em "${logoPath}". Verifique LOGO_PATH no .env`);
  }

  const logoW = mmToDots(25, dpi);
  const logoH = mmToDots(13, dpi);
  const { gfa } = await pngToGFA(logoPath, logoW, logoH);

  // ========================================================
  // Ajuste dinâmico do bloco de produto unificado
  // ========================================================
  let productFontH = 34;
  let productFontW = 32;
  let productLines = 3;

  if (descrProd.length <= 35) {
    productFontH = 46;
    productFontW = 44;
    productLines = 2;
  } else if (descrProd.length <= 70) {
    productFontH = 38;
    productFontW = 36;
    productLines = 2;
  }

  // ========================================================
  // Código de Barras Ajustado (Para não estourar a área)
  // ========================================================
  // Trava em 2 para garantir que códigos longos não estourem a linha divisória
  const barcodeModule = 2; 
  const barcodeHeight = 110; 

  // Ajuste fino do cálculo de largura para centralização mais precisa
  const estimatedCode128Width = codLinear.length * 11 * barcodeModule + 52;
  const barcodeAreaX = 6;
  const barcodeAreaW = 570;
  
  // Posicionamento X recalculado trazendo um pouco mais para a esquerda
  const barcodeX = barcodeAreaX + Math.max(15, Math.round((barcodeAreaW - estimatedCode128Width) / 2) - 10);

  // ========================================================
  // QR Code Otimizado (Reposicionado para não vazar)
  // ========================================================
  const qrMagnification = 5; 
  const qrCodeValue = `http://appmpvc.com.br:8189/codbarras/${encodeURIComponent(
  codBarra
)}`;

  const zpl = [
    "^XA",
    "^CI28",
    `^PW${PW}`,
    `^LL${LL}`,
    "^LH0,0",
    "^LS0",
    "^LT0",
    "^MMT",

    // Moldura externa
    "^FO2,2^GB796,556,3^FS",

    // ========================================================
    // TOPO
    // ========================================================
    "^FO2,2^GB796,34,34^FS",
    "^FT18,27^A0N,24,24^FR^FDETiqueta de Producao / Expedicao^FS",

    // ========================================================
    // CABEÇALHO
    // ========================================================
    "^FO10,44",
    gfa,
    "^FS",

    "^FT210,62^A0N,28,28^FDMAIS PVC INDUSTRIA E COMERCIO LTDA^FS",
    "^FT210,89^A0N,18,18^FDRua Amelia Rosa, quadra CHA - Sitio de Recreio Ipe^FS",
    "^FT210,113^A0N,18,18^FDGoiania - GO, 74681-420 / Tel.: (62) 4008-0288^FS",

    "^FO6,126^GB788,0,3^FS",

    // ========================================================
    // PRODUTO - Caixa expandida
    // ========================================================
    "^FO6,132^GB788,154,3^FS",
    "^FO6,132^GB788,30,30^FS",
    "^FT22,155^A0N,20,20^FR^FDPRODUTO (COD - DESCRICAO - EMBALAGEM)^FS",

    // Texto dinâmico do produto unificado
    `^FO16,174^A0N,${productFontH},${productFontW}^FB768,${productLines},4,L,0^FD${zplEscape(descrProd)}^FS`,

    // ========================================================
    // LINHA DE INFORMAÇÕES (TURNO, DATA/HORA, OP, ORDEM)
    // ========================================================
    // TURNO
    "^FO6,292^GB110,60,3^FS",
    "^FO6,292^GB110,22,22^FS",
    "^FT24,309^A0N,15,15^FR^FDTURNO^FS",
    `^FT12,339^A0N,28,26^FB98,1,0,C,0^FD${zplEscape(turno)}^FS`,

    // DATA / HORA
    "^FO122,292^GB250,60,3^FS",
    "^FO122,292^GB250,22,22^FS",
    "^FT210,309^A0N,15,15^FR^FDDATA / HORA^FS",
    `^FT128,339^A0N,24,22^FB238,1,0,C,0^FD${zplEscape(dataFmt || "-")}^FS`,

    // OP
    "^FO378,292^GB190,60,3^FS",
    "^FO378,292^GB190,22,22^FS",
    "^FT460,309^A0N,15,15^FR^FDO.P^FS",
    `^FT384,339^A0N,26,24^FB178,1,0,C,0^FD${zplEscape(op)}^FS`,

    // ORDEM
    "^FO574,292^GB220,60,3^FS",
    "^FO574,292^GB220,22,22^FS",
    "^FT660,309^A0N,15,15^FR^FDORDEM^FS",
    `^FT580,339^A0N,26,24^FB208,1,0,C,0^FD${zplEscape(ordemCarga)}^FS`,

    // ========================================================
    // RODAPÉ - CÓDIGO DE BARRAS (PERFEITO) E QR CODE (CENTRALIZAÇÃO FINAL)
    // ========================================================

    // Área do Código de Barras
    "^FO6,358^GB570,196,3^FS",
    "^FO6,358^GB570,26,26^FS",
    "^FT22,377^A0N,16,16^FR^FDGS1 / CODIGO DE BARRAS^FS",

    // Código de barras (Mantido idêntico)
    `^BY${barcodeModule},3,${barcodeHeight}`,
    `^FO${barcodeX},405^BCN,${barcodeHeight},N,N,N^FD${zplEscape(codLinear)}^FS`,

    // Texto do código de barras
    `^FT26,536^A0N,20,18^FB530,1,0,C,0^FD${zplEscape(codLinear)}^FS`,

    // Área do QR Code
    "^FO582,358^GB212,196,3^FS",
    "^FO582,358^GB212,26,26^FS",
    "^FT645,377^A0N,16,16^FR^FDQR CODE^FS",

    // AJUSTE DE CENTRALIZAÇÃO FINAL:
    // Movido de X=612 para X=619 para empurrar o QR Code ligeiramente para a direita.
    "^BQN,2,4,Q",
    `^FT619,522^FDLA,${zplEscapeQR(qrCodeValue)}^FS`,

    // Texto do código interno mantido na base segura (Y=544)
    `^FT588,544^A0N,14,13^FB200,1,0,C,0^FD${zplEscape(codBarra)}^FS`,

    "^PQ1,0,1,Y",
    "^XZ",
  ].join("\n");

  return zpl;
}
  /** MODELO SHIPPING antigo */
  /** MODELO SHIPPING */
static async buildZplShipping(row: EtiquetaRow) {
  const dpi = 152;
  const PW = 660; // 110 mm
  const LL = 360; // 60 mm

  const codBarra = safeStr(row.CODBARRA);
  const codBarraGs1 = safeStr((row as any).CODBARRAGS1);
  const codLinear = codBarraGs1 || codBarra;

  const codProd = safeStr(row.CODPROD);
  const descrProd = truncate(row.DESCRPROD, 32);
  const dataFmt = formatDateBR(row.DATA);
  const op = safeStr(row.OP);
  const turno = safeStr((row as any).TURNO);
  const ordemCarga = safeStr(row.ORDEM_CARGA);
  const qtdPct = formatQtdPct(safeNum(row.PCT));

  if (!codBarra) {
    throw new Error("Etiqueta sem CODBARRA para impressão.");
  }

  const logoPath = path.isAbsolute(ENV.LOGO_PATH)
    ? ENV.LOGO_PATH
    : path.resolve(process.cwd(), ENV.LOGO_PATH);

  if (!fs.existsSync(logoPath)) {
    throw new Error(`Logo não encontrado em "${logoPath}". Verifique LOGO_PATH no .env`);
  }

  const logoW = mmToDots(18, dpi);
  const logoH = mmToDots(10, dpi);
  const { gfa } = await pngToGFA(logoPath, logoW, logoH);

  // =========================
  // Layout
  // =========================
  const leftX = 8;
  const leftW = 364;

  const rightX = 382;
  const rightW = 250;

  const dataBoxY = 132;
  const dataBoxH = 112;

  const gs1BoxY = 252;
  const gs1BoxH = 102;

  const qrBoxY = 132;
  const qrBoxH = 222;

  // =========================
  // Barcode GS1 / Código de barras
  // Mantive ^BY1 para não cortar nas laterais.
  // Aumentei somente a altura de 46 para 56.
  // =========================
  const barcodeModule = 1;
  const barcodeHeight = 56;

  const estimatedCode128Width = Math.max(
    180,
    Math.min(leftW - 24, codLinear.length * 11 * barcodeModule + 46)
  );

  const barcodeX = Math.max(
    leftX + 10,
    Math.round(leftX + (leftW - estimatedCode128Width) / 2)
  );

  // Subi um pouco para caber a barra maior dentro da caixa
  const barcodeY = 278;

  // =========================
  // QR centralizado
  // =========================
  const qrTopBandH = 16;
  const qrInnerY = qrBoxY + qrTopBandH + 8;
  const qrInnerH = qrBoxH - qrTopBandH - 12;

  const qrMagnification = 7;
  const qrSizeGuess = 196;

  const qrX = Math.round(rightX + (rightW - qrSizeGuess) / 2) + 20;
  const qrY = Math.round(qrInnerY + (qrInnerH - qrSizeGuess) / 2) - 20;

  const zpl = [
    "^XA",
    "^CI28",
    `^PW${PW}`,
    `^LL${LL}`,
    "^LH0,0",
    "^LS0",
    "^LT0",
    "^MMT",

    // faixa superior
    "^FO1,1^GB640,18,18^FS",
    "^FT14,15^A0N,14,14^FR^FDETiqueta Logística / Expedição^FS",

    // cabeçalho
    "^FO10,24",
    gfa,
    "^FS",

    "^FT132,35^A0N,15,16^FDMAIS PVC INDUSTRIA E COMERCIO LTDA^FS",
    "^FT132,49^A0N,10,10^FDRua Amélia Rosa, quadra CHA - Sitio de Recreio Ipe^FS",
    "^FT132,62^A0N,10,10^FDGoiania - GO, 74681-420 / Tel.: (62) 4008-0288^FS",

    "^FO8,72^GB624,0,2^FS",

    // produto
    "^FO8,80^GB430,44,2^FS",
    "^FO8,80^GB430,16,16^FS",
    "^FT18,93^A0N,11,11^FR^FDPRODUTO^FS",
    `^FT14,118^A0N,24,26^FB418,1,4,C^FD${zplEscape(descrProd)}^FS`,

    // qtd
    "^FO448,80^GB84,44,2^FS",
    "^FO448,80^GB84,16,16^FS",
    "^FT470,93^A0N,11,11^FR^FDQTD^FS",
    `^FT456,118^A0N,22,20^FD${zplEscape(qtdPct || "0PC")}^FS`,

    // prod
    "^FO542,80^GB90,44,2^FS",
    "^FO542,80^GB90,16,16^FS",
    "^FT560,93^A0N,11,11^FR^FDPROD^FS",
    `^FT550,118^A0N,20,18^FD${zplEscape(codProd)}^FS`,

    // =========================
    // BLOCO ESQUERDO - DADOS
    // =========================
    `^FO${leftX},${dataBoxY}^GB${leftW},${dataBoxH},2^FS`,
    `^FO${leftX},${dataBoxY}^GB${leftW},16,16^FS`,
    "^FT18,145^A0N,11,11^FR^FDDADOS DA ETIQUETA^FS",

    `^FT18,169^A0N,15,15^FDData:^FS`,
    `^FT82,169^A0N,15,15^FD${zplEscape(dataFmt || "-")}^FS`,

    `^FT18,191^A0N,15,15^FDOrdem:^FS`,
    `^FT82,191^A0N,15,15^FD${zplEscape(ordemCarga || "-")}^FS`,

    `^FT18,213^A0N,15,15^FDO.P:^FS`,
    `^FT82,213^A0N,15,15^FD${zplEscape(op || "-")}^FS`,

    `^FT18,235^A0N,15,15^FDTurno:^FS`,
    `^FT82,235^A0N,15,15^FD${zplEscape(turno || "-")}^FS`,

    // =========================
    // BLOCO ESQUERDO - GS1
    // =========================
    `^FO${leftX},${gs1BoxY}^GB${leftW},${gs1BoxH},2^FS`,
    `^FO${leftX},${gs1BoxY}^GB${leftW},18,18^FS`,
    "^FT20,266^A0N,11,11^FR^FDGS1 / CODIGO DE BARRAS^FS",

    `^BY${barcodeModule},2,${barcodeHeight}`,
    `^FO${barcodeX},${barcodeY}^BCN,${barcodeHeight},Y,N,N`,
    `^FD${zplEscape(codLinear)}^FS`,

    // =========================
    // BLOCO DIREITO - QR
    // =========================
    `^FO${rightX},${qrBoxY}^GB${rightW},${qrBoxH},2^FS`,
    `^FO${rightX},${qrBoxY}^GB${rightW},16,16^FS`,
    "^FT350,145^A0N,11,11^FR^FDQR INTERNO^FS",

    `^BQN,2,${qrMagnification}`,
    `^FO${qrX},${qrY}^FDLA,${zplEscapeQR(codBarra)}^FS`,

    "^PQ1,0,1,Y",
    "^XZ",
  ].join("\n");

  return zpl;
}

  /**
   * NOVO MODELO MAISPVC
   * baseado no layout 11 x 6 cm
   */

  static async buildZplMaisPVCIndustrialTeste(row: EtiquetaRow) {
    const codBarraOriginal = safeStr(row.CODBARRA);
    const codBarraDigits = onlyDigits(codBarraOriginal);
    const codLinear = codBarraDigits || codBarraOriginal;
  
    const codProd = safeStr(row.CODPROD);
    const descrProdOriginal = safeStr(row.DESCRPROD);
    const descrProd = truncate(descrProdOriginal, 58);
  
    const op = safeStr(row.OP) || "0";
    const ordemCarga = safeStr(row.ORDEM_CARGA) || "0";
  
    function formatDateTimeBR(v: Date | string | null | undefined): string {
      if (!v) return "";
      const d = new Date(v as any);
      if (Number.isNaN(+d)) return "";
  
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yyyy = d.getFullYear();
      const hh = String(d.getHours()).padStart(2, "0");
      const min = String(d.getMinutes()).padStart(2, "0");
  
      return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
    }
  
    function formatQtdPc(v: number | null): string {
      if (v == null || !Number.isFinite(v)) return "0 PC";
      if (Number.isInteger(v)) return `${v} PC`;
      return `${String(v).replace(".", ",")} PC`;
    }
  
    const dataFmt = formatDateTimeBR(row.DATA);
    const qtdPct = formatQtdPc(safeNum(row.PCT));
  
    if (!codBarraOriginal) {
      throw new Error("Etiqueta sem código de barras para impressão.");
    }
  
    if (!codProd) {
      throw new Error("Etiqueta sem código do produto para impressão.");
    }
  
    const dpi = 152;
    const PW = 660;
    const LL = 360;
  
    const logoPath = path.isAbsolute(ENV.LOGO_PATH)
      ? ENV.LOGO_PATH
      : path.resolve(process.cwd(), ENV.LOGO_PATH);
  
    if (!fs.existsSync(logoPath)) {
      throw new Error(`Logo não encontrado em "${logoPath}". Verifique LOGO_PATH no .env`);
    }
  
    const logoW = mmToDots(31, dpi);
    const logoH = mmToDots(10, dpi);
    const { gfa } = await pngToGFA(logoPath, logoW, logoH);
  
    let productFontH = 28;
    let productFontW = 26;
    let productLines = 2;
  
    if (descrProd.length <= 24) {
      productFontH = 34;
      productFontW = 31;
      productLines = 1;
    } else if (descrProd.length <= 38) {
      productFontH = 30;
      productFontW = 28;
      productLines = 2;
    } else {
      productFontH = 25;
      productFontW = 23;
      productLines = 2;
    }
  
    // =========================
    // CÓDIGO DE BARRAS INFERIOR
    // =========================
    const barcodeModule =
  codLinear.length <= 14 ? 3 : codLinear.length <= 24 ? 2 : 1;

const barcodeHeight = 88;

// IMPORTANTE:
// antes estava usando >; que força Code128-C e deixa número curto.
// agora usa >: para Code128-B, aumentando o comprimento visual.
const barcodeValue =
  codBarraDigits && codBarraDigits.length > 0
    ? `>:${codBarraDigits}`
    : codBarraOriginal;

const barcodeAreaX = 8;
const barcodeAreaW = 642;

// cálculo mais próximo da largura real do Code128-B
const estimatedBarcodeWidth =
  codBarraDigits && codBarraDigits.length > 0
    ? Math.min(
        600,
        Math.max(
          420,
          ((codBarraDigits.length + 2) * 11 + 13) * barcodeModule
        )
      )
    : Math.min(
        600,
        Math.max(
          420,
          ((codLinear.length + 2) * 11 + 13) * barcodeModule
        )
      );

const barcodeX =
  barcodeAreaX + Math.round((barcodeAreaW - estimatedBarcodeWidth) / 2);

const barcodeY = 230;
  
    const zpl = [
      "^XA",
      "^CI28",
      `^PW${PW}`,
      `^LL${LL}`,
      "^LH0,0",
      "^LS0",
      "^LT0",
      "^MMT",
  
      "^FO2,2^GB654,354,2^FS",
  
      // logo
      "^FO18,12",
      gfa,
      "^FS",
  
      // caixas OP / OC
      "^FO352,8^GB292,28,2^FS",
      "^FO352,36^GB292,28,2^FS",
  
      "^FT365,29^A0N,22,22^FDOP^FS",
      `^FT424,29^A0N,23,23^FD${zplEscape(op)}^FS`,
  
      "^FT365,57^A0N,22,22^FDOC^FS",
      `^FT424,57^A0N,23,23^FD${zplEscape(ordemCarga)}^FS`,
  
      "^FO405,8^GB0,56,1^FS",
  
      "^FT22,72^A0N,16,16^FDTel.: (62) 4008-0288^FS",
  
      "^FO8,82^GB642,0,2^FS",
  
      // linha superior
      "^FO8,86^GB642,34,1^FS",
      "^FO250,86^GB0,34,1^FS",
      "^FO430,86^GB0,34,1^FS",
  
      `^FT32,110^A0N,16,16^FD${zplEscape(codProd)}^FS`,
      `^FT282,110^A0N,16,16^FD${zplEscape(qtdPct)}^FS`,
      `^FT442,110^A0N,17,17^FD${zplEscape(dataFmt)}^FS`,
  
      // faixa preta
      "^FO8,122^GB642,96,96^FS",
  
      `^FO14,148^A0N,${productFontH},${productFontW}^FR^FB470,${productLines},4,L,0^FD${zplEscape(
        descrProd || "-"
      )}^FS`,
  
      `^FO500,170^A0N,28,26^FR^FB136,1,0,R,0^FD${zplEscape(qtdPct)}^FS`,
  
      // barcode
      // barcode
      "^FO8,224^GB642,126,1^FS",
      `^BY${barcodeModule},2,${barcodeHeight}`,
      `^FO${barcodeX},${barcodeY}^BCN,${barcodeHeight},N,N,N^FD${zplEscape(barcodeValue)}^FS`,

      `^FT20,342^A0N,18,18^FB620,1,0,C,0^FD${zplEscape(codLinear)}^FS`,
      "^PQ1,0,1,Y",
      "^XZ",
    ].join("\n");
  
    return zpl;
  }

  
  static async buildZplMaisPVC(row: EtiquetaRow) {
    const codBarraOriginal = safeStr(row.CODBARRA);
    const codBarraDigits = onlyDigits(codBarraOriginal);
    const codProd = safeStr(row.CODPROD);
    const descrProd = truncate(row.DESCRPROD, 28);
    const dataFmt = formatDateBR(row.DATA);
    const op = safeStr(row.OP);
    const ordemCarga = safeStr(row.ORDEM_CARGA);
    const qtdPct = formatQtdPct(safeNum(row.PCT));
  
    if (!codBarraOriginal) {
      throw new Error("Etiqueta sem código de barras para impressão.");
    }
  
    if (!codProd) {
      throw new Error("Etiqueta sem código do produto para impressão.");
    }
  
    const dpi = 152;
  
    const PW = 660; // 110 mm
    const LL = 360; // 60 mm
  
    const ean13Top = codBarraDigits.length === 13 ? codBarraDigits : "";
    const barcodeBottom = codBarraDigits ? `>;${codBarraDigits}` : codBarraOriginal;
  
    const logoPath = path.isAbsolute(ENV.LOGO_PATH)
      ? ENV.LOGO_PATH
      : path.resolve(process.cwd(), ENV.LOGO_PATH);
  
    if (!fs.existsSync(logoPath)) {
      throw new Error(`Logo não encontrado em "${logoPath}". Verifique LOGO_PATH no .env`);
    }
  
    // Área fixa da logo. A proporção real fica por conta do pngToGFA ajustado.
    const logoW = mmToDots(22, dpi);
    const logoH = mmToDots(10, dpi);
    const { gfa } = await pngToGFA(logoPath, logoW, logoH);
  
    // Linhas principais
    const lineTop1 = 72;
    const lineTop2 = 238; // descida para não cortar numeração do barcode superior
    const lineTop3 = 348; // descida para fechar melhor a área inferior
  
    // Blocos
    const productBoxX = 1;
    const productBoxY = 74;
    const productBoxW = 520;
    const productBoxH = 36;
  
    const qtyBoxX = 522;
    const qtyBoxY = 74;
    const qtyBoxW = 118;
    const qtyBoxH = 36;
  
    // Info direita
    const infoX = 345;
  
    const zpl = [
      "^XA",
      "^CI28",
      `^PW${PW}`,
      `^LL${LL}`,
      "^LH0,0",
      "^LS0",
      "^LT0",
      "^MMT",
  
      // linhas horizontais
      `^FO1,${lineTop1}^GB640,0,2^FS`,
      `^FO1,${lineTop2}^GB640,0,2^FS`,
      `^FO1,${lineTop3}^GB640,0,2^FS`,
  
      // logo
      "^FO12,8",
      gfa,
      "^FS",
  
      // cabeçalho
      "^FT155,20^A0N,15,16^FDMAIS PVC INDUSTRIA E COMERCIO LTDA^FS",
      "^FT155,37^A0N,11,11^FDRua Amélia Rosa, quadra CHA - Sitio de Recreio Ipe^FS",
      "^FT155,52^A0N,11,11^FDGoiania - GO, 74681-420 / Tel.: (62) 4008-0288^FS",
      "^FT155,67^A0N,11,11^FDwww.maispvc.com.br^FS",
  
      // faixa produto
      `^FO${productBoxX},${productBoxY}^GB${productBoxW},${productBoxH},34^FS`,
      `^LRY^FT0,101^A0N,24,30^FB${productBoxW},1,6,C^FD${zplEscape(descrProd)}^FS^LRN`,
  
      // qtd
      `^FO${qtyBoxX},${qtyBoxY}^GB${qtyBoxW},${qtyBoxH},34^FS`,
      `^LRY^FT530,101^A0N,24,20^FDQtd. ${zplEscape(qtdPct)}^FS^LRN`,
  
      // EAN13 superior
      ...(ean13Top
        ? [
            "^BY3,2,72",
            "^FO145,118^BEN,72,Y,N",
            `^FD${zplEscape(ean13Top)}^FS`,
          ]
        : []),
  
      // divisor vertical direita
      `^FO332,${lineTop2}^GB0,${lineTop3 - lineTop2},2^FS`,
  
      // barcode inferior esquerdo
      "^BY2,2,64",
      "^FO18,248^BCN,64,Y,N,N",
      `^FD${barcodeBottom}^FS`,
  
      // infos direita
      `^FT${infoX},262^A0N,18,18^FDData: ${zplEscape(dataFmt)}^FS`,
      `^FT${infoX},286^A0N,18,18^FDOrdem Carga: ${zplEscape(ordemCarga)}^FS`,
      `^FT${infoX},310^A0N,18,18^FDO.P: ${zplEscape(op)}^FS`,
      `^FT${infoX},334^A0N,18,18^FDProd: ${zplEscape(codProd)}^FS`,
  
      "^PQ1,0,1,Y",
      "^XZ",
    ].join("\n");
  
    return zpl;
  }

  // Envia o ZPL para a Zebra via TCP/9100
  static sendToZebra(ipOrHost: string, zpl: string, portArg?: number | string) {
    const { host, port: fromIp } = splitHostPort(ipOrHost);
    const port = parsePort(portArg ?? fromIp ?? ENV.PRINTER_PORT, 9100);

    return new Promise<void>((resolve, reject) => {
      const socket = new net.Socket();
      let finished = false;

      const done = (err?: unknown) => {
        if (finished) return;
        finished = true;
        socket.destroy();
        if (err) reject(err);
        else resolve();
      };

      socket.setTimeout(15000);

      socket.once("error", done);
      socket.once("timeout", () => done(new Error("timeout")));

      socket.connect(port, host, () => {
        socket.write(zpl, "utf8", (err) => {
          if (err) return done(err);
          socket.end();
        });
      });

      socket.once("close", (hadError) => {
        if (!finished) {
          if (hadError) return done(new Error("Falha ao fechar conexão com a impressora."));
          return done();
        }
      });
    });
  }

  /**
   * Imprime a etiqueta por SEQUENCIA
   * model: "default" | "shipping" | "maispvc"
   *
   * Agora envia primeiro um bloco de setup e depois a etiqueta.
   */
  static async printSequencia(
    sequencia: number,
    ip?: string,
    port?: number | string,
    model: PrintModel = "default"
  ) {
    const row = await this.fetchEtiqueta(sequencia);

    if (!row) {
      const e = new Error("Etiqueta não encontrada.");
      (e as any).status = 404;
      throw e;
    }

    

    let labelZpl: string;

    if (model === "maispvc-industrial") {
      labelZpl = await this.buildZplMaisPVCIndustrialTeste(row);
    } else if (model === "maispvc") {
      labelZpl = await this.buildZplMaisPVC(row);
    } else if (model === "shipping") {
      labelZpl = await this.buildZplShipping(row);
    } else {
      labelZpl = await this.buildZpl(row);
    }

    const setupZpl = this.buildPrinterSetup(model);
    const finalZpl = `${setupZpl}\n${labelZpl}`;

    const finalIp = ip || ENV.PRINTER_IP;
    const finalPort = port ?? ENV.PRINTER_PORT;

    console.log("[PRINT] model recebido:", model);
console.log("[PRINT] usando função:", 
  model === "maispvc-industrial"
    ? "buildZplMaisPVCIndustrialTeste"
    : model === "maispvc"
    ? "buildZplMaisPVC"
    : model === "shipping"
    ? "buildZplShipping"
    : "buildZpl DEFAULT"
);

console.log("[PRINT] contém texto teste?", finalZpl.includes("DEFAULT NOVO 10X7"));
console.log("[PRINT] PW:", finalZpl.match(/\^PW\d+/g));
console.log("[PRINT] LL:", finalZpl.match(/\^LL\d+/g));

    await this.sendToZebra(finalIp, finalZpl, finalPort);

    return {
      ok: true,
      ip: finalIp,
      port: finalPort,
      sequencia,
      ean13: row.CODBARRA,
      model,
      dados: {
        CODPROD: row.CODPROD ?? "",
        DESCRPROD: row.DESCRPROD ?? "",
        DATA: formatDateBR(row.DATA),
        OP: row.OP ?? "",
        TURNO:(row as any ).TURNO ?? "",
        ORDEM_CARGA: row.ORDEM_CARGA ?? "",
        PCT: row.PCT ?? "",
      },
    };
  }
}