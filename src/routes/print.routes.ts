// src/routes/print.routes.ts
import { Router } from "express";
import { PrintController } from "../controllers/PrinterController.js";
import { asyncHandler } from "../middlewares/async.js";
import { authGuard } from "../middlewares/auth.js"; // opcional

const router = Router();

// POST /api/etiquetas/:sequencia/print?ip=10.0.0.50
router.post("/:sequencia/print", /*authGuard,*/ asyncHandler(PrintController.print));

export default router;
