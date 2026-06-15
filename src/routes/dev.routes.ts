import { Router } from "express";
import { ConferenciaDevController } from "../controllers/ConferenciaDevController.js";
import { DevolucoesController } from "../controllers/DevolucoesController.js";

const router = Router();

router.get("/pendentes", DevolucoesController.listarPendentes);
router.get("/:seq/itens", DevolucoesController.listarItens);
router.get("/:seq/etiquetas-geradas", DevolucoesController.listarEtiquetasGeradas);

router.post("/:seq/itens/:codProd/conferencias", DevolucoesController.lancarConferencia);
router.post("/:seq/concluir", DevolucoesController.concluirDevolucao);
// antiga, se ainda estiver em uso
router.post("/conferencia", ConferenciaDevController.inserir);

export default router;