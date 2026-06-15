import { Router } from "express";
import { AuthController } from "../controllers/AuthController.js";
import { asyncHandler } from "../middlewares/async.js"; // você já tem isso

const router = Router();

// POST /api/auth/login
router.post("/login", asyncHandler(AuthController.login));

// POST /api/auth/change-password
router.post("/change-password", asyncHandler(AuthController.changePassword));

// (Opcional) GET /api/auth/me  — requer middleware de auth (veja bônus abaixo)
import { authGuard } from "../middlewares/auth.js"; // bônus (abaixo)
router.get("/me", authGuard, asyncHandler(AuthController.me));

export default router;
