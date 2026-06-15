import { EtiquetasService } from "./EtiquetasService.js";
import { RetrabalhoRepository } from "../repositories/RetrabalhoRepository.js";
import oracledb from "oracledb";

function strOrNull(v: any): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function numOrNull(v: any): number | null {
  if (v == null || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function intOrNull(v: any): number | null {
  if (v == null || String(v).trim() === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (!Number.isInteger(n)) return null;
  return n;
}

export class RetrabalhoService {
  constructor(
    private etiquetasService = new EtiquetasService(),
    private retrabalhoRepo = new RetrabalhoRepository()
  ) {}

  async criar(body: any) {
    const CODEMP = Number(body?.CODEMP);
    const CODFUNC = Number(body?.CODFUNC);

    if (!Number.isFinite(CODEMP) || !Number.isFinite(CODFUNC)) {
      throw new Error("CODEMP e CODFUNC são obrigatórios.");
    }

    const TIPO_ORIGEM =
      String(body?.TIPO_ORIGEM ?? "").trim().toUpperCase() === "COM_ETIQUETA"
        ? "COM_ETIQUETA"
        : "SEM_ETIQUETA";

    const TURNO = strOrNull(body?.TURNO);
    const OBS = strOrNull(body?.OBS);

    const DESTINOS = Array.isArray(body?.DESTINOS) ? body.DESTINOS : [];
    if (!DESTINOS.length) {
      throw new Error("Informe ao menos um destino para o retrabalho.");
    }

    const ETIQUETAS_ORIGEM = Array.isArray(body?.ETIQUETAS_ORIGEM)
      ? body.ETIQUETAS_ORIGEM
      : [];

    if (TIPO_ORIGEM === "COM_ETIQUETA" && !ETIQUETAS_ORIGEM.length) {
      throw new Error("Informe as etiquetas de origem do retrabalho.");
    }

    const connection = await this.retrabalhoRepo.getConnection();

    try {
      const origensLidas: any[] = [];

      if (TIPO_ORIGEM === "COM_ETIQUETA") {
        for (const item of ETIQUETAS_ORIGEM) {
          const etiqueta = await this.etiquetasService.obterValidaParaRetrabalho(
            {
              SEQUENCIA: intOrNull(item?.SEQUENCIA),
              CODBARRA: strOrNull(item?.CODBARRA),
            },
            connection
          );

          const jaExiste = origensLidas.some((x) => x.SEQUENCIA === etiqueta.SEQUENCIA);
          if (jaExiste) {
            throw new Error(`Etiqueta repetida no lote: ${etiqueta.CODBARRA}`);
          }

          origensLidas.push(etiqueta);
        }
      }

      const qtdTotalOrigem =
        TIPO_ORIGEM === "COM_ETIQUETA"
          ? origensLidas.length
          : intOrNull(body?.QTD_TOTAL_ORIGEM) ?? null;

      const pesoTotalOrigem =
        TIPO_ORIGEM === "COM_ETIQUETA"
          ? origensLidas.reduce((acc, item) => acc + Number(item.PESO ?? 0), 0)
          : numOrNull(body?.PESO_TOTAL_ORIGEM);

      const qtdTotalDestino = DESTINOS.reduce(
        (acc: number, d: any) => acc + (intOrNull(d?.QUANTIDADE) ?? 0),
        0
      );

      const pesoTotalDestino = DESTINOS.reduce((acc: number, d: any) => {
        const qtd = intOrNull(d?.QUANTIDADE) ?? 0;
        const pesoUnit = numOrNull(d?.PESO) ?? 0;
        return acc + qtd * pesoUnit;
      }, 0);

      const primeiroDestino = DESTINOS[0];
      const CODPROD_DESTINO = Number(primeiroDestino?.CODPROD);

      if (!Number.isFinite(CODPROD_DESTINO)) {
        throw new Error("CODPROD do destino é obrigatório.");
      }

      const idRetrabalho = await this.retrabalhoRepo.insertCabecalho(
        {
          CODEMP,
          CODFUNC,
          TURNO,
          OBS,
          TIPO_ORIGEM,
          CODPROD_DESTINO,
          QTD_TOTAL_ORIGEM: qtdTotalOrigem,
          QTD_TOTAL_DESTINO: qtdTotalDestino,
          PESO_TOTAL_ORIGEM: pesoTotalOrigem,
          PESO_TOTAL_DESTINO: pesoTotalDestino,
        },
        connection
      );

      if (TIPO_ORIGEM === "COM_ETIQUETA") {
        for (const origem of origensLidas) {
          await this.retrabalhoRepo.insertOrigem(
            {
              ID_RETRABALHO: idRetrabalho,
              SEQUENCIA_ETIQUETA: Number(origem.SEQUENCIA),
              CODBARRA: strOrNull(origem.CODBARRA),
              CODPROD: intOrNull(origem.CODPROD),
              QTD: 1,
              PESO: numOrNull(origem.PESO),
              STATUS_CONSUMO: "CONSUMIDA",
            },
            connection
          );

          await this.etiquetasService.marcarComoRetrabalhada(
            Number(origem.SEQUENCIA),
            idRetrabalho,
            connection
          );
        }
      }

      const etiquetasGeradas: any[] = [];

      for (const destino of DESTINOS) {
        const CODPROD = Number(destino?.CODPROD);
        const QUANTIDADE = intOrNull(destino?.QUANTIDADE);

        if (!Number.isFinite(CODPROD)) {
          throw new Error("Cada destino deve ter CODPROD.");
        }

        if (QUANTIDADE == null || QUANTIDADE <= 0) {
          throw new Error(`Quantidade inválida para o produto ${CODPROD}.`);
        }

        const novasEtiquetas = await this.etiquetasService.criarEtiquetasRetrabalhoDestino(
          {
            CODEMP,
            CODFUNC,
            TURNO,
            OBS: strOrNull(destino?.OBS) ?? OBS,
            ID_RETRABALHO_DEST: idRetrabalho,
            CODPROD,
            QUANTIDADE,
            PESO: numOrNull(destino?.PESO),
            OP: intOrNull(destino?.OP),
            UNLOTE: intOrNull(destino?.UNLOTE),
            TAMLOTE: numOrNull(destino?.TAMLOTE),
            PCT: numOrNull(destino?.PCT),
            REFUGO:
              String(destino?.REFUGO ?? "N").trim().toUpperCase() === "S" ? "S" : "N",
            CODIGOCARROPROD: intOrNull(destino?.CODIGOCARROPROD),
            TARACARRO: numOrNull(destino?.TARACARRO),
          },
          connection
        );

        for (const etiqueta of novasEtiquetas) {
          await this.retrabalhoRepo.insertDestino(
            {
              ID_RETRABALHO: idRetrabalho,
              SEQUENCIA_ETIQUETA: etiqueta.SEQUENCIA,
              CODBARRA: etiqueta.CODBARRA,
              CODPROD: etiqueta.CODPROD,
              QTD: 1,
              PESO: etiqueta.PESO,
            },
            connection
          );

          etiquetasGeradas.push(etiqueta);
        }
      }

      await connection.commit();

      return {
        ok: true,
        ID_RETRABALHO: idRetrabalho,
        TIPO_ORIGEM,
        ORIGENS_PROCESSADAS: origensLidas.length,
        DESTINOS_GERADOS: etiquetasGeradas.length,
        ETIQUETAS_GERADAS: etiquetasGeradas,
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      await connection.close();
    }
  }
}