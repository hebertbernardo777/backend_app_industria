import { Router } from "express";
import { asyncHandler } from "../middlewares/async.js";
import { EtiquetasController } from "../controllers/EtiquetasController.js";
import { ProdutosGrupoRefugoController } from "../controllers/ProdutosGrupoRefugoController.js";
import { CarrosTransporteController } from "../controllers/CarrosTransporteController.js";

const router = Router();

router.get(
  "/refugo/produtos-refugo",
  asyncHandler(ProdutosGrupoRefugoController.listar)
);

router.get(
  "/refugo/carrinhos",
  asyncHandler(CarrosTransporteController.listar)
);

// GET /api/etiquetas/opcoes/causa-refugo
router.get(
  "/opcoes/causa-refugo",
  asyncHandler(EtiquetasController.listarOpcoesCausaRefugo)
);

// GET /api/etiquetas/relatorio/fim-turno?data=YYYY-MM-DD&turno=A&maquina=123
router.get(
  "/relatorio/fim-turno",
  asyncHandler(EtiquetasController.relatorioFimTurno)
);

// Alias para o front atual:
// GET /api/etiquetas/relatorio-fim-turno?data=YYYY-MM-DD&turno=A&maquina=123
router.get(
  "/relatorio-fim-turno",
  asyncHandler(EtiquetasController.relatorioFimTurno)
);

// GET /api/etiquetas/por-codigo/:codigoBarra
router.get(
  "/por-codigo/:codigoBarra",
  asyncHandler(EtiquetasController.obterPorCodigoBarra)
);

// GET /api/etiquetas?sequencia=...&sequencias=1,2,3&data=YYYY-MM-DD&from=YYYY-MM-DD&to=YYYY-MM-DD
router.get(
  "/",
  asyncHandler(EtiquetasController.listar)
);

// POST /api/etiquetas
router.post(
  "/",
  asyncHandler(EtiquetasController.criar)
);

// Rotas dinâmicas por sequência sempre depois das rotas fixas
router.get(
  "/:sequencia",
  asyncHandler(EtiquetasController.obter)
);

router.put(
  "/:sequencia",
  asyncHandler(EtiquetasController.atualizar)
);

router.patch(
  "/:sequencia/status",
  asyncHandler(EtiquetasController.atualizarStatus)
);

router.post(
  "/:sequencia/reimpressao",
  asyncHandler(EtiquetasController.incrementarReimpressao)
);

router.delete(
  "/:sequencia",
  asyncHandler(EtiquetasController.remover)
);

export default router;