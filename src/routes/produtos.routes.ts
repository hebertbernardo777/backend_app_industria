import { Router } from "express";
import { ProdutosController } from "../controllers/ProdutosController.js";

const router = Router();

router.get("/etiqueta", ProdutosController.listarProdutosEtiqueta);

export default router;