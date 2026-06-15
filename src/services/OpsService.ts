import { OpsRepository } from "../repositories/OpsRepository.js";
import type {
  StatusProc,
  OpRow,
  MaquinaProducaoRow,
  PrioridadeOpUpdate,
} from "../repositories/OpsRepository.js";

const VALID_STATUS: Set<string> = new Set([
  "A", "AP", "C", "C2", "F", "P", "P2", "R", "S", "S2",
]);

const STATUS_BLOQUEIA_ALTERACAO = new Set<string>(["C", "C2", "F"]);

type MachineStatus = "Produzindo" | "Aguardando" | "Parada" | "Sem plano";
type MoveDirection = "up" | "down";

type OpRowComQtd = OpRow & {
  QTDPRODUZIR?: number | null;
};

export type MachineProductDto = {
  id: string;
  idiproc: number;
  name: string;
  order: string;
  quantity: number;
  produced: number;
  priority: number;
  position: number;
  statusproc: StatusProc | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  isExecuting: boolean;
  canStart: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
};

export type MachineDto = {
  id: string;
  code: string;
  name: string;
  status: MachineStatus;
  products: MachineProductDto[];
};

function appError(message: string, status = 400): Error & { status?: number } {
  return Object.assign(new Error(message), { status });
}

function parseDateParam(v: any): string | null {
  if (!v) return null;

  const s = String(v).trim();

  const m1 = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m1) return `${m1[1]}-${m1[2]}-${m1[3]}`;

  const m2 = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (m2) return `${m2[3]}-${m2[2]}-${m2[1]}`;

  return null;
}

function numOrUndef(v: any): number | undefined {
  if (v == null || String(v).trim() === "") return undefined;

  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function numObrigatorio(v: any, campo: string): number {
  const n = Number(v);

  if (!Number.isFinite(n) || n <= 0) {
    throw appError(`${campo} inválido`);
  }

  return n;
}

function intObrigatorio(v: any, campo: string): number {
  const n = numObrigatorio(v, campo);

  if (!Number.isInteger(n)) {
    throw appError(`${campo} inválido`);
  }

  return n;
}

function n(v: any): number {
  const parsed = Number(v);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(v: any): string {
  return String(v ?? "").trim();
}

function parseStatusList(v: any): StatusProc[] | undefined {
  if (!v) return undefined;

  const parts = String(v)
    .split(",")
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean);

  const out: StatusProc[] = [];

  for (const p of parts) {
    if (!VALID_STATUS.has(p)) {
      throw appError(
        `STATUSPROC inválido: '${p}'. Use: A,AP,C,C2,F,P,P2,R,S,S2`,
      );
    }

    out.push(p as StatusProc);
  }

  return out.length ? out : undefined;
}

function parseDirection(body: any): MoveDirection {
  const raw = String(body?.direcao ?? body?.direction ?? "")
    .trim()
    .toLowerCase();

  if (["cima", "subir", "up", "mais", "+"].includes(raw)) return "up";
  if (["baixo", "descer", "down", "menos", "-"].includes(raw)) return "down";

  throw appError("Direção inválida. Use 'cima'/'baixo' ou 'up'/'down'.");
}

function machineName(row: MaquinaProducaoRow): string {
  return text(row.NOMEWCP) || text(row.DESCRWCP) || `Máquina ${row.CODWCP}`;
}

function isOpEmExecucao(op: OpRow): boolean {
  return Boolean(op.DHINICIO && !op.DHFINAL);
}

function prioridadeParaOrdenacao(v: any): number {
  const parsed = Number(v);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : Number.MAX_SAFE_INTEGER;
}

function prioridadeObrigatoria(op: OpRow): number {
  const prioridade = Number(op.PRIORIDADE);

  if (!Number.isFinite(prioridade) || prioridade <= 0) {
    throw appError(
      `OP ${op.IDIPROC} está sem PRIORIDADE válida para movimentação.`,
    );
  }

  return prioridade;
}

function ordenarOpsParaTela(ops: OpRow[]): OpRow[] {
  return [...ops].sort((a, b) => {
    const aExec = isOpEmExecucao(a) ? 1 : 0;
    const bExec = isOpEmExecucao(b) ? 1 : 0;

    if (aExec !== bExec) return bExec - aExec;

    const byPriority =
      prioridadeParaOrdenacao(a.PRIORIDADE) -
      prioridadeParaOrdenacao(b.PRIORIDADE);

    if (byPriority !== 0) return byPriority;

    return n(a.IDIPROC) - n(b.IDIPROC);
  });
}

function machineStatus(ops: OpRow[]): MachineStatus {
  if (!ops.length) return "Sem plano";

  const hasRunning = ops.some(isOpEmExecucao);
  if (hasRunning) return "Produzindo";

  return "Aguardando";
}

function toProduct(
  op: OpRowComQtd,
  index: number,
  total: number,
): MachineProductDto {
  const idiproc = n(op.IDIPROC);
  const priority = n(op.PRIORIDADE) || index + 1;
  const statusproc = (op.STATUSPROC ?? null) as StatusProc | null;
  const isExecuting = isOpEmExecucao(op);

  return {
    id: String(idiproc),
    idiproc,
    name: text(op.DESCRPROD) || `OP ${idiproc}`,
    order: `OP-${idiproc}`,
    quantity: n(op.ESTOQUE ?? op.QTDPRODUZIR),
    produced: n(op.QTDPRODUZIDA),
    priority,
    position: index + 1,
    statusproc,
    startedAt: op.DHINICIO ?? null,
    finishedAt: op.DHFINAL ?? null,
    isExecuting,
    canStart: statusproc === "R" && !op.DHINICIO && !op.DHFINAL,
    canMoveUp: index > 0,
    canMoveDown: index < total - 1,
  };
}

function toMachine(machine: MaquinaProducaoRow, ops: OpRow[]): MachineDto {
  const orderedOps = ordenarOpsParaTela(ops);

  return {
    id: String(machine.CODWCP),
    code: String(machine.CODWCP),
    name: machineName(machine),
    status: machineStatus(orderedOps),
    products: orderedOps.map((op, index) =>
      toProduct(op as OpRowComQtd, index, orderedOps.length),
    ),
  };
}

function loteMinimoDoProcesso(processo: any): number {
  const lote = n(
    processo?.QTDPRODMIN ??
      processo?.TAMLOTEPAD ??
      processo?.MULTIDEAL ??
      processo?.QTD_SUGERIDA,
  );

  return lote > 0 ? lote : 1;
}

function isMultiplo(qtd: number, lote: number): boolean {
  if (!Number.isFinite(qtd) || !Number.isFinite(lote) || lote <= 0) return false;

  const div = qtd / lote;
  return Math.abs(div - Math.round(div)) < 0.000001;
}

export class OpsService {
  constructor(private repo = new OpsRepository()) {}

  async listar(params: any = {}) {
    const f: any = {};

    const idiproc = numOrUndef(params.idiproc);
    if (params.idiproc != null && idiproc == null) {
      throw appError("idiproc inválido");
    }
    if (idiproc != null) f.idiproc = idiproc;

    const codprodpa = numOrUndef(params.codprodpa);
    if (params.codprodpa != null && codprodpa == null) {
      throw appError("codprodpa inválido");
    }
    if (codprodpa != null) f.codprodpa = codprodpa;

    const codwcp = numOrUndef(params.codwcp);
    if (params.codwcp != null && codwcp == null) {
      throw appError("codwcp inválido");
    }
    if (codwcp != null) f.codwcp = codwcp;

    if (params.statusproc != null && params.statusprocs != null) {
      throw appError("Use apenas 'statusproc' OU 'statusprocs', não ambos.");
    }

    if (params.statusproc != null) {
      const one = String(params.statusproc).trim().toUpperCase();

      if (!VALID_STATUS.has(one)) {
        throw appError(
          `statusproc inválido: '${one}'. Use: A,AP,C,C2,F,P,P2,R,S,S2`,
        );
      }

      f.statusproc = one as StatusProc;
    }

    if (params.statusprocs != null) {
      f.statusprocs = parseStatusList(params.statusprocs);
    }

    const fromStr = parseDateParam(params.from);
    if (params.from && !fromStr) {
      throw appError(
        "Parâmetro 'from' inválido. Use YYYY-MM-DD ou DD/MM/YYYY.",
      );
    }
    if (fromStr) f.fromStr = fromStr;

    const toStr = parseDateParam(params.to);
    if (params.to && !toStr) {
      throw appError(
        "Parâmetro 'to' inválido. Use YYYY-MM-DD ou DD/MM/YYYY.",
      );
    }
    if (toStr) f.toStr = toStr;

    const limit = numOrUndef(params.limit);
    if (params.limit != null && limit == null) {
      throw appError("limit inválido");
    }
    if (limit != null) f.limit = limit;

    return this.repo.findMany(f);
  }

  async listarPlantas() {
    return this.repo.listarPlantas();
  }

  async listarMaquinas(params: any = {}) {
    const codplp =
      params.codplp != null ? intObrigatorio(params.codplp, "codplp") : 1;

    const maquinas = await this.repo.listarMaquinasProducao(codplp);
    const result: MachineDto[] = [];

    for (const maquina of maquinas) {
      const ops = await this.repo.listarOpsPorMaquina(Number(maquina.CODWCP));
      result.push(toMachine(maquina, ops));
    }

    return result;
  }

  async listarProdutosOp(params: any = {}) {
    const limit = numOrUndef(params.limit);

    if (params.limit != null && limit == null) {
      throw appError("limit inválido");
    }

    const codplp =
      params.codplp != null ? intObrigatorio(params.codplp, "codplp") : undefined;

    return this.repo.listarProdutosParaOp({
      search: text(params.search ?? params.q ?? params.busca),
      codplp,
      limit,
    });
  }

  async detalharProdutoOp(params: any = {}) {
    const codprodpa = intObrigatorio(params.codprodpa, "codprodpa");

    const codplp =
      params.codplp != null ? intObrigatorio(params.codplp, "codplp") : undefined;

    const produto = await this.repo.obterUltimoProcessoProduto(codprodpa, codplp);

    if (!produto) {
      throw appError(
        "Produto sem processo produtivo cadastrado para a planta informada.",
        404,
      );
    }

    return produto;
  }

  async criarOp(body: any = {}) {
    const codplp = intObrigatorio(body.codplp ?? body.CODPLP, "codplp");
    const codwcp = intObrigatorio(body.codwcp ?? body.CODWCP, "codwcp");
    const codprodpa = intObrigatorio(
      body.codprodpa ?? body.CODPRODPA,
      "codprodpa",
    );

    const codUsuInc = Number(body.codUsuInc ?? body.CODUSUINC ?? 0) || 0;

    const processo = await this.repo.obterUltimoProcessoProduto(codprodpa, codplp);
    if (!processo) {
      throw appError("Produto sem processo produtivo cadastrado.");
    }

    const maquinas = await this.repo.listarMaquinasProducao(codplp);
    const maquina = maquinas.find((m) => Number(m.CODWCP) === codwcp);

    if (!maquina) {
      throw appError("Máquina não encontrada para a planta informada.");
    }

    const qtdInformada = numOrUndef(
      body.qtdProduzir ?? body.QTDPRODUZIR ?? body.quantidade,
    );

    const loteMinimo = loteMinimoDoProcesso(processo);
    const qtdProduzir = qtdInformada ?? loteMinimo;

    if (!Number.isFinite(qtdProduzir) || qtdProduzir <= 0) {
      throw appError("qtdProduzir inválida.");
    }

    if (qtdProduzir < loteMinimo) {
      throw appError(`qtdProduzir não pode ser menor que o lote mínimo: ${loteMinimo}.`);
    }

    if (!isMultiplo(qtdProduzir, loteMinimo)) {
      throw appError(`qtdProduzir deve ser múltipla do lote mínimo: ${loteMinimo}.`);
    }

    const dataInformada = body.dtPrevent ?? body.DTPREVENT ?? body.dataPrevisao;
    const dtPreventStr = parseDateParam(dataInformada);

    if (dataInformada && !dtPreventStr) {
      throw appError("dtPrevent inválida. Use YYYY-MM-DD ou DD/MM/YYYY.");
    }

    const created: any = await this.repo.criarOp({
      codplp,
      codwcp,
      codprodpa,
      qtdProduzir,
      codUsuInc,
      dtPreventStr,
    });

    const op =
      (await this.repo.findMany({
        idiproc: Number(created.idiproc),
        limit: 1,
      }))[0] ?? null;

    return {
      ok: true,
      message: "OP criada com sucesso.",
      ...created,
      loteMinimo,
      produto: processo,
      op,
    };
  }

  async listarOpsDaMaquina(params: any = {}) {
    const codwcp = intObrigatorio(params.codwcp, "codwcp");

    const maquinas = await this.repo.listarMaquinasProducao();
    const maquina = maquinas.find((m) => Number(m.CODWCP) === codwcp);

    if (!maquina) {
      throw appError("Máquina não encontrada.", 404);
    }

    const ops = await this.repo.listarOpsPorMaquina(codwcp);
    return toMachine(maquina, ops);
  }

  async moverPrioridade(params: any = {}, body: any = {}) {
    const codwcp = intObrigatorio(params.codwcp, "codwcp");
    const idiproc = intObrigatorio(params.idiproc, "idiproc");
    const direction = parseDirection(body);

    const maquinas = await this.repo.listarMaquinasProducao();
    const maquina = maquinas.find((m) => Number(m.CODWCP) === codwcp);

    if (!maquina) {
      throw appError("Máquina não encontrada.", 404);
    }

    const ops = ordenarOpsParaTela(await this.repo.listarOpsPorMaquina(codwcp));
    const currentIndex = ops.findIndex((op) => Number(op.IDIPROC) === idiproc);

    if (currentIndex < 0) {
      throw appError("OP não encontrada nesta máquina.", 404);
    }

    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

    if (targetIndex < 0 || targetIndex >= ops.length) {
      return {
        ok: true,
        changed: false,
        message:
          direction === "up"
            ? "A OP já está na primeira posição."
            : "A OP já está na última posição.",
        machine: toMachine(maquina, ops),
      };
    }

    const currentOp = ops[currentIndex];
    const targetOp = ops[targetIndex];

    const currentPriority = prioridadeObrigatoria(currentOp);
    const targetPriority = prioridadeObrigatoria(targetOp);

    if (currentPriority === targetPriority) {
      return {
        ok: true,
        changed: false,
        message:
          "As duas OPs possuem a mesma prioridade. Trocar valores iguais não altera a ordem.",
        machine: toMachine(maquina, ops),
      };
    }

    const updates: PrioridadeOpUpdate[] = [
      {
        IDIPROC: Number(currentOp.IDIPROC),
        PRIORIDADE: targetPriority,
      },
      {
        IDIPROC: Number(targetOp.IDIPROC),
        PRIORIDADE: currentPriority,
      },
    ];

    const rowsAffected = await this.repo.atualizarPrioridadesOps(updates);
    const updatedOps = await this.repo.listarOpsPorMaquina(codwcp);

    return {
      ok: true,
      changed: true,
      rowsAffected,
      swapped: {
        current: {
          idiproc: Number(currentOp.IDIPROC),
          oldPriority: currentPriority,
          newPriority: targetPriority,
        },
        target: {
          idiproc: Number(targetOp.IDIPROC),
          oldPriority: targetPriority,
          newPriority: currentPriority,
        },
      },
      machine: toMachine(maquina, updatedOps),
    };
  }

  async redimensionarLote(params: any = {}, body: any = {}) {
    const idiproc = intObrigatorio(params.idiproc, "idiproc");

    const op =
      (await this.repo.findMany({
        idiproc,
        limit: 1,
      }))[0] ?? null;

    if (!op) {
      throw appError("OP não encontrada.", 404);
    }

    if (STATUS_BLOQUEIA_ALTERACAO.has(String(op.STATUSPROC))) {
      throw appError("Não é permitido redimensionar OP cancelada ou finalizada.");
    }

    const codprodpa = intObrigatorio(op.CODPRODPA, "codprodpa");
    const codplp = op.CODPLP != null ? Number(op.CODPLP) : undefined;

    const processo = await this.repo.obterUltimoProcessoProduto(codprodpa, codplp);

    if (!processo) {
      throw appError("Produto sem processo produtivo cadastrado.");
    }

    const loteMinimo = loteMinimoDoProcesso(processo);
    const qtdAtual = n(op.QTDPRODUZIR ?? op.ESTOQUE);
    const qtdProduzida = n(op.QTDPRODUZIDA);

    let novaQtd = numOrUndef(
      body.qtdProduzir ?? body.QTDPRODUZIR ?? body.quantidade,
    );

    if (novaQtd == null) {
      const direction = parseDirection(body);
      const lotes = body.lotes != null ? intObrigatorio(body.lotes, "lotes") : 1;

      novaQtd =
        direction === "up"
          ? qtdAtual + loteMinimo * lotes
          : qtdAtual - loteMinimo * lotes;
    }

    if (!Number.isFinite(novaQtd) || novaQtd <= 0) {
      throw appError("Quantidade inválida.");
    }

    if (novaQtd < qtdProduzida) {
      throw appError(
        `Quantidade não pode ser menor que o já produzido. Produzido: ${qtdProduzida}.`,
      );
    }

    if (novaQtd < loteMinimo) {
      throw appError(`Quantidade não pode ser menor que o lote mínimo: ${loteMinimo}.`);
    }

    if (!isMultiplo(novaQtd, loteMinimo)) {
      throw appError(`Quantidade deve ser múltipla do lote mínimo: ${loteMinimo}.`);
    }

    const rowsAffected = await this.repo.redimensionarLoteOp(idiproc, novaQtd);

    if (!rowsAffected) {
      throw appError("Nenhuma OP foi atualizada.", 404);
    }

    const opAtualizada =
      (await this.repo.findMany({
        idiproc,
        limit: 1,
      }))[0] ?? null;

    return {
      ok: true,
      message: "Lote redimensionado com sucesso.",
      idiproc,
      loteMinimo,
      qtdAnterior: qtdAtual,
      qtdProduzida,
      qtdProduzir: novaQtd,
      op: opAtualizada,
    };
  }

  async cancelarOp(params: any = {}) {
    const idiproc = intObrigatorio(params.idiproc, "idiproc");

    const op =
      (await this.repo.findMany({
        idiproc,
        limit: 1,
      }))[0] ?? null;

    if (!op) {
      throw appError("OP não encontrada.", 404);
    }

    if (String(op.STATUSPROC) === "F") {
      throw appError("Não é permitido cancelar OP finalizada.");
    }

    const rowsAffected = await this.repo.atualizarStatusOp(idiproc, "C");

    return {
      ok: true,
      message: "OP cancelada com sucesso.",
      idiproc,
      statusproc: "C" as StatusProc,
      rowsAffected,
    };
  }

  async suspenderOp(params: any = {}) {
    const idiproc = intObrigatorio(params.idiproc, "idiproc");

    const op =
      (await this.repo.findMany({
        idiproc,
        limit: 1,
      }))[0] ?? null;

    if (!op) {
      throw appError("OP não encontrada.", 404);
    }

    if (STATUS_BLOQUEIA_ALTERACAO.has(String(op.STATUSPROC))) {
      throw appError("Não é permitido suspender OP cancelada ou finalizada.");
    }

    const rowsAffected = await this.repo.atualizarStatusOp(idiproc, "S");

    return {
      ok: true,
      message: "OP suspensa com sucesso.",
      idiproc,
      statusproc: "S" as StatusProc,
      rowsAffected,
    };
  }

  async aceitarOp(params: any = {}, body: any = {}) {
    const idiproc = intObrigatorio(params.idiproc, "idiproc");

    const op =
      (await this.repo.findMany({
        idiproc,
        limit: 1,
      }))[0] ?? null;

    if (!op) {
      throw appError("OP não encontrada.", 404);
    }

    if (STATUS_BLOQUEIA_ALTERACAO.has(String(op.STATUSPROC))) {
      throw appError("Não é permitido aceitar OP cancelada ou finalizada.");
    }

    const codexec =
      body?.codexec != null && String(body.codexec).trim() !== ""
        ? numObrigatorio(body.codexec, "codexec")
        : null;

    const result = await this.repo.aceitarOp(idiproc, codexec);

    if (!result.opRowsAffected) {
      throw appError("Nenhuma OP foi atualizada.", 404);
    }

    const opAtualizada =
      (await this.repo.findMany({
        idiproc,
        limit: 1,
      }))[0] ?? null;

    return {
      ok: true,
      message: "OP aceita com sucesso.",
      idiproc,
      statusproc: "A" as StatusProc,
      opRowsAffected: result.opRowsAffected,
      atividadeRowsAffected: result.atividadeRowsAffected,
      op: opAtualizada,
    };
  }

  async iniciarAtividade(params: any = {}, body: any = {}) {
    const idiproc = intObrigatorio(params.idiproc, "idiproc");

    const op =
      (await this.repo.findMany({
        idiproc,
        limit: 1,
      }))[0] ?? null;

    if (!op) {
      throw appError("OP não encontrada.", 404);
    }

    if (STATUS_BLOQUEIA_ALTERACAO.has(String(op.STATUSPROC))) {
      throw appError("Não é permitido iniciar OP cancelada ou finalizada.");
    }

    const codexec =
      body?.codexec != null && String(body.codexec).trim() !== ""
        ? numObrigatorio(body.codexec, "codexec")
        : null;

    const codwcp =
      body?.codwcp != null && String(body.codwcp).trim() !== ""
        ? numObrigatorio(body.codwcp, "codwcp")
        : numOrUndef(op.CODWCP) ?? null;

    const result = await this.repo.iniciarAtividade(idiproc, codexec, codwcp);

    if (!result.atividadeRowsAffected) {
      throw appError(
        "Nenhuma atividade foi criada/atualizada para essa OP.",
        409,
      );
    }

    if (!result.opRowsAffected) {
      throw appError("Nenhuma OP foi atualizada.", 404);
    }

    const opAtualizada =
      (await this.repo.findMany({
        idiproc,
        limit: 1,
      }))[0] ?? null;

    return {
      ok: true,
      message: "Atividade iniciada com sucesso.",
      idiproc,
      statusproc: "A" as StatusProc,
      opRowsAffected: result.opRowsAffected,
      atividadeRowsAffected: result.atividadeRowsAffected,
      op: opAtualizada,
    };
  }

  async finalizarAtividade(params: any = {}, body: any = {}) {
    const idiproc = intObrigatorio(params.idiproc, "idiproc");

    const op =
      (await this.repo.findMany({
        idiproc,
        limit: 1,
      }))[0] ?? null;

    if (!op) {
      throw appError("OP não encontrada.", 404);
    }

    const codexec =
      body?.codexec != null && String(body.codexec).trim() !== ""
        ? numObrigatorio(body.codexec, "codexec")
        : null;

    const codwcp =
      body?.codwcp != null && String(body.codwcp).trim() !== ""
        ? numObrigatorio(body.codwcp, "codwcp")
        : numOrUndef(op.CODWCP) ?? null;

    const rowsAffected = await this.repo.finalizarAtividade(
      idiproc,
      codexec,
      codwcp,
    );

    if (!rowsAffected) {
      throw appError("Nenhuma atividade encontrada/criada para essa OP.", 404);
    }

    return {
      ok: true,
      message: "Atividade finalizada com sucesso.",
      idiproc,
      rowsAffected,
    };
  }
}
