import { Router } from "express";
import { asyncHandler } from "../middlewares/async.js";
import { EtiquetasController } from "../controllers/EtiquetasController.js";

const router = Router();

// GET /api/etiquetas?sequencia=...&sequencias=1,2,3&data=YYYY-MM-DD&from=YYYY-MM-DD&to=YYYY-MM-DD
router.get("/", asyncHandler(EtiquetasController.listar));

// GET /api/etiquetas/:sequencia
router.get("/:sequencia", asyncHandler(EtiquetasController.obter));

// POST /api/etiquetas
router.post("/", asyncHandler(EtiquetasController.criar));

// PUT /api/etiquetas/:sequencia
router.put("/:sequencia", asyncHandler(EtiquetasController.atualizar));

// DELETE /api/etiquetas/:sequencia
router.delete("/:sequencia", asyncHandler(EtiquetasController.remover));

export default router;
