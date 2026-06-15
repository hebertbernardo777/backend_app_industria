import { Router } from "express";
import { RetrabalhoController } from "../controllers/RetrabalhoController.js";

const router = Router();

router.post("/", RetrabalhoController.criar);

export default router;