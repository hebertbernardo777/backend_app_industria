import { Router } from "express";
import { asyncHandler } from "../middlewares/async.js";
import { OpsController } from "../controllers/OpsController.js";

const router = Router();

// GET /api/ops/plantas
router.get(
  "/plantas",
  asyncHandler(OpsController.listarPlantas)
);

// GET /api/ops/maquinas?codplp=1
router.get(
  "/maquinas",
  asyncHandler(OpsController.listarMaquinas)
);

// GET /api/ops/produtos?search=50600
router.get(
  "/produtos",
  asyncHandler(OpsController.listarProdutosOp)
);

// GET /api/ops/produtos/:codprodpa
router.get(
  "/produtos/:codprodpa",
  asyncHandler(OpsController.detalharProdutoOp)
);

// POST /api/ops
router.post(
  "/",
  asyncHandler(OpsController.criarOp)
);

// GET /api/ops/maquinas/:codwcp/ops
router.get(
  "/maquinas/:codwcp/ops",
  asyncHandler(OpsController.listarOpsDaMaquina)
);

// PATCH /api/ops/maquinas/:codwcp/ops/:idiproc/prioridade/mover
router.patch(
  "/maquinas/:codwcp/ops/:idiproc/prioridade/mover",
  asyncHandler(OpsController.moverPrioridadeOp)
);

// PATCH /api/ops/maquinas/:codwcp/ops/:idiproc/aceitar
router.patch(
  "/maquinas/:codwcp/ops/:idiproc/aceitar",
  asyncHandler(OpsController.aceitarOp)
);

// PATCH /api/ops/maquinas/:codwcp/ops/:idiproc/iniciar
router.patch(
  "/maquinas/:codwcp/ops/:idiproc/iniciar",
  asyncHandler(OpsController.iniciarAtividadeOp)
);

// PATCH /api/ops/maquinas/:codwcp/ops/:idiproc/finalizar
router.patch(
  "/maquinas/:codwcp/ops/:idiproc/finalizar",
  asyncHandler(OpsController.finalizarAtividadeOp)
);

// PATCH /api/ops/:idiproc/aceitar
router.patch(
  "/:idiproc/aceitar",
  asyncHandler(OpsController.aceitarOp)
);

// PATCH /api/ops/:idiproc/redimensionar
router.patch(
  "/:idiproc/redimensionar",
  asyncHandler(OpsController.redimensionarLoteOp)
);

// PATCH /api/ops/:idiproc/cancelar
router.patch(
  "/:idiproc/cancelar",
  asyncHandler(OpsController.cancelarOp)
);

// PATCH /api/ops/:idiproc/suspender
router.patch(
  "/:idiproc/suspender",
  asyncHandler(OpsController.suspenderOp)
);

// PATCH /api/ops/:idiproc/iniciar
router.patch(
  "/:idiproc/iniciar",
  asyncHandler(OpsController.iniciarAtividadeOp)
);

// PATCH /api/ops/:idiproc/finalizar
router.patch(
  "/:idiproc/finalizar",
  asyncHandler(OpsController.finalizarAtividadeOp)
);

// GET /api/ops?statusproc=A
router.get(
  "/",
  asyncHandler(OpsController.listar)
);

export default router;