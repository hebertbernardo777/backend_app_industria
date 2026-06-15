import { Router } from "express";
import { AlfaPesoController } from "../controllers/AlfaPesoController.js";

const router = Router();

router.get("/balanca/peso", AlfaPesoController.obterPeso);

export default router;


// GET /balanca/peso?ip=192.168.0.50

// GET /balanca/peso?ip=192.168.0.50&port=5000&unitId=1&timeoutMs=2000&dwordWordOrder=low-high