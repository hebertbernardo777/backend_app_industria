import oracledb from "oracledb";
import { getPool } from "../infra/oracleClient.js";
import {
  ConferenciaCargaRepository,
  type BuscarProdutoNaCargaInput,
} from "../repositories/ConferenciaCargaRepository.js";

export class AppError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
  }
}

export type ModoConferencia = "PEDIDO" | "TOTAL";

export type RegistrarBipagemInput = {
  seqOc: number;
  codBarra: string;
  modoConferencia: ModoConferencia;
  nunota?: number | null;
};

function asNumber(value: unknown, fieldName: string) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new AppError(`Campo ${fieldName} inválido.`);
  }
  return n;
}

function asOptionalNumber(value: unknown) {
  if (value == null || String(value).trim() === "") return null;

  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new AppError("Valor numérico inválido.");
  }

  return n;
}

function asBarcode(value: unknown) {
  const s = String(value ?? "")
    .replace(/[\r\n\t]/g, "")
    .trim();

  if (!s) {
    throw new AppError("Código de barras não informado.");
  }

  return s;
}

function asModoConferencia(value: unknown): ModoConferencia {
  const s = String(value ?? "").trim().toUpperCase();
  if (s !== "PEDIDO" && s !== "TOTAL") {
    throw new AppError("Modo de conferência inválido. Use PEDIDO ou TOTAL.");
  }
  return s;
}

export class ConferenciaCargaService {
  private repository: ConferenciaCargaRepository;

  constructor(repository = new ConferenciaCargaRepository()) {
    this.repository = repository;
  }

  private async withConnection<T>(
    callback: (conn: oracledb.Connection) => Promise<T>
  ) {
    const pool = await getPool();
    const conn = await pool.getConnection();

    try {
      return await callback(conn);
    } finally {
      await conn.close();
    }
  }

  async listarCargasPorEquipe(codEqpExpParam: unknown) {
    const codEqpExp = asNumber(codEqpExpParam, "codEqpExp");

    return this.withConnection(async (conn) => {
      return this.repository.listarCargasPorEquipe(conn, codEqpExp);
    });
  }

  async obterCarga(seqOcParam: unknown) {
    const seqOc = asNumber(seqOcParam, "seqOc");

    return this.withConnection(async (conn) => {
      const carga = await this.repository.buscarCarga(conn, seqOc);

      if (!carga) {
        throw new AppError("Carga não encontrada.", 404);
      }

      return carga;
    });
  }

  async listarPedidos(seqOcParam: unknown) {
    const seqOc = asNumber(seqOcParam, "seqOc");

    return this.withConnection(async (conn) => {
      const carga = await this.repository.buscarCarga(conn, seqOc);

      if (!carga) {
        throw new AppError("Carga não encontrada.", 404);
      }

      return this.repository.listarPedidos(conn, seqOc);
    });
  }

  async listarResumoItens(seqOcParam: unknown, nunotaParam?: unknown) {
    const seqOc = asNumber(seqOcParam, "seqOc");
    const nunota = asOptionalNumber(nunotaParam);

    return this.withConnection(async (conn) => {
      const carga = await this.repository.buscarCarga(conn, seqOc);

      if (!carga) {
        throw new AppError("Carga não encontrada.", 404);
      }

      return this.repository.listarResumoProdutos(conn, seqOc, nunota);
    });
  }

  async listarEtiquetasConferidas(seqOcParam: unknown) {
    const seqOc = asNumber(seqOcParam, "seqOc");

    return this.withConnection(async (conn) => {
      const carga = await this.repository.buscarCarga(conn, seqOc);

      if (!carga) {
        throw new AppError("Carga não encontrada.", 404);
      }

      return this.repository.listarEtiquetasConferidas(conn, seqOc);
    });
  }

  async registrarBipagem(input: RegistrarBipagemInput) {
    const seqOc = asNumber(input.seqOc, "seqOc");
    const codBarraLido = asBarcode(input.codBarra);
    const modoConferencia = asModoConferencia(input.modoConferencia);
    const nunota = asOptionalNumber(input.nunota);

    if (modoConferencia === "PEDIDO" && nunota == null) {
      throw new AppError("Para conferência por pedido, informe a nunota.");
    }

    const pool = await getPool();
    const conn = await pool.getConnection();

    try {
      const carga = await this.repository.bloquearCargaParaBipagem(conn, seqOc);

      if (!carga) {
        throw new AppError("Carga não encontrada.", 404);
      }

      if (String((carga as any).STATUS ?? "1") === "3") {
        throw new AppError("A carga já está finalizada.");
      }

      const etiquetaOrigem = await this.repository.buscarEtiquetaOrigem(
        conn,
        codBarraLido
      );

      if (!etiquetaOrigem) {
        throw new AppError("Etiqueta não encontrada na origem (AD_ETIQUETAS).");
      }

      const codBarraPersistir = String(
        (etiquetaOrigem as any).CODBARRA ?? ""
      ).trim();

      if (!codBarraPersistir) {
        throw new AppError(
          "A etiqueta encontrada não possui CODBARRA numérico para persistência."
        );
      }

      const jaConferida = await this.repository.existeEtiquetaConferida(
        conn,
        seqOc,
        codBarraPersistir
      );

      if (jaConferida) {
        throw new AppError("Esta etiqueta já foi bipada para esta carga.");
      }

      const codProd = Number((etiquetaOrigem as any).CODPROD ?? 0);

      if (!Number.isFinite(codProd) || codProd <= 0) {
        throw new AppError("A etiqueta não possui produto válido.");
      }

      const produtoInput: BuscarProdutoNaCargaInput = {
        seqOc,
        codProd,
        nunota: modoConferencia === "PEDIDO" ? nunota : null,
      };

      const produtoNaCarga = await this.repository.buscarProdutoNaCarga(
        conn,
        produtoInput
      );

      if (!produtoNaCarga) {
        if (modoConferencia === "PEDIDO") {
          throw new AppError(
            "O produto da etiqueta não pertence ao pedido selecionado nesta carga."
          );
        }

        throw new AppError("O produto da etiqueta não pertence a esta carga.");
      }

      const qtdEtiqueta = Number((etiquetaOrigem as any).QTDETIQUETA ?? 0);
      if (!Number.isFinite(qtdEtiqueta) || qtdEtiqueta <= 0) {
        throw new AppError("Quantidade da etiqueta inválida.");
      }

      const qtdPctEtiquetaRaw = (etiquetaOrigem as any).QTDPCT;
      const qtdPctEtiqueta =
        qtdPctEtiquetaRaw == null || qtdPctEtiquetaRaw === ""
          ? null
          : Number(qtdPctEtiquetaRaw);

      const qtdPrevista = Number((produtoNaCarga as any).QTD_PREVISTA ?? 0);
      const qtdBipada = Number((produtoNaCarga as any).QTD_BIPADA ?? 0);
      const saldo = qtdPrevista - qtdBipada;

      if (saldo <= 0) {
        throw new AppError("O total desse produto já foi concluído na carga.");
      }

      if (qtdEtiqueta > saldo) {
        throw new AppError(
          `A etiqueta excede o saldo do produto na carga. Saldo atual: ${saldo}. Quantidade da etiqueta: ${qtdEtiqueta}.`
        );
      }

      await this.repository.marcarCargaEmCarregamento(conn, seqOc);

      const proximoConfEtq = await this.repository.proximoConfEtq(conn, seqOc);

      await this.repository.inserirEtiquetaConferida(conn, {
        seqOc,
        confEtq: proximoConfEtq,
        nunota: modoConferencia === "PEDIDO" ? nunota : null,
        codProd,
        codBarra: codBarraPersistir,
        qtdEtiqueta,
        qtdPct:
          qtdPctEtiqueta != null && Number.isFinite(qtdPctEtiqueta)
            ? qtdPctEtiqueta
            : null,
      });

      const resumoConclusao = await this.repository.resumoConclusaoCarga(
        conn,
        seqOc
      );

      const totalProdutos = Number((resumoConclusao as any)?.TOTAL_PRODUTOS ?? 0);
      const produtosConcluidos = Number(
        (resumoConclusao as any)?.PRODUTOS_CONCLUIDOS ?? 0
      );

      if (totalProdutos > 0 && produtosConcluidos >= totalProdutos) {
        await this.repository.atualizarStatusCarga(conn, seqOc, "3");
      } else {
        await this.repository.atualizarStatusCarga(conn, seqOc, "2");
      }

      const cargaAtualizada = await this.repository.buscarCarga(conn, seqOc);
      const resumoProdutosAtualizado = await this.repository.listarResumoProdutos(
        conn,
        seqOc,
        modoConferencia === "PEDIDO" ? nunota : null
      );

      await conn.commit();

      return {
        ok: true,
        message: "Etiqueta conferida com sucesso.",
        etiqueta: {
          confEtq: proximoConfEtq,
          codBarraLido,
          codBarraPersistido: codBarraPersistir,
          codProd,
          descrProd: (etiquetaOrigem as any).DESCRPROD ?? null,
          qtdEtiqueta,
          qtdPct:
            qtdPctEtiqueta != null && Number.isFinite(qtdPctEtiqueta)
              ? qtdPctEtiqueta
              : null,
          nunota: modoConferencia === "PEDIDO" ? nunota : null,
        },
        carga: cargaAtualizada,
        resumoProdutos: resumoProdutosAtualizado,
      };
    } catch (error: any) {
      await conn.rollback();

      if (error?.errorNum === 30006 || error?.errorNum === 54) {
        throw new AppError(
          "Outra leitura desta carga está em processamento. Tente novamente em alguns segundos.",
          409
        );
      }

      throw error;
    } finally {
      await conn.close();
    }
  }

  async finalizarCarga(seqOcParam: unknown) {
    const seqOc = asNumber(seqOcParam, "seqOc");
    const pool = await getPool();
    const conn = await pool.getConnection();

    try {
      const carga = await this.repository.buscarCarga(conn, seqOc);

      if (!carga) {
        throw new AppError("Carga não encontrada.", 404);
      }

      const resumoConclusao = await this.repository.resumoConclusaoCarga(
        conn,
        seqOc
      );

      const totalProdutos = Number((resumoConclusao as any)?.TOTAL_PRODUTOS ?? 0);
      const produtosConcluidos = Number(
        (resumoConclusao as any)?.PRODUTOS_CONCLUIDOS ?? 0
      );

      if (totalProdutos <= 0) {
        throw new AppError("A carga não possui produtos para conferência.");
      }

      if (produtosConcluidos < totalProdutos) {
        throw new AppError(
          "A carga ainda possui produtos pendentes e não pode ser finalizada."
        );
      }

      await this.repository.atualizarStatusCarga(conn, seqOc, "3");
      const cargaAtualizada = await this.repository.buscarCarga(conn, seqOc);

      await conn.commit();

      return {
        ok: true,
        message: "Carga finalizada com sucesso.",
        carga: cargaAtualizada,
      };
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      await conn.close();
    }
  }
}