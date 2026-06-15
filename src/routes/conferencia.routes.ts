import { Router } from "express";
import { ConferenciaCargaController } from "../controllers/ConferenciaCargaController.js";

const router = Router();

/**
 * Fluxo:
 * 1) listar cargas da equipe
 * 2) abrir detalhes da carga
 * 3) escolher conferência por pedido ou por total de itens
 * 4) listar pedidos ou resumo de itens
 * 5) bipar etiqueta
 * 6) listar etiquetas já conferidas
 * 7) finalizar carga
 */

router.get("/cargas", ConferenciaCargaController.listarCargas);
router.get("/cargas/:seqOc", ConferenciaCargaController.obterCarga);
router.get("/cargas/:seqOc/pedidos", ConferenciaCargaController.listarPedidos);
router.get("/cargas/:seqOc/resumo-itens", ConferenciaCargaController.listarResumoItens);
router.get("/cargas/:seqOc/etiquetas", ConferenciaCargaController.listarEtiquetasConferidas);

router.post("/cargas/:seqOc/bipar", ConferenciaCargaController.registrarBipagem);
router.post("/cargas/:seqOc/finalizar", ConferenciaCargaController.finalizarCarga);

export default router;