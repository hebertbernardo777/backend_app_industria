import { Router } from "express";

import etiquetas from "./etiquetas.routes.js";
import authRoutes from "./auth.routes.js";
import printRoutes from "./print.routes.js";
import opsRoutes from "./ops.routes.js";
import alfaRoutes from "./alfa.routes.js";
import retrabalho from "./retrabalho.routes.js";
import produtosRoutes from "./produtos.routes.js";
import devolucoes from "./dev.routes.js";
import conferenciaRoutes from "./conferencia.routes.js";

import { authGuard } from "../middlewares/auth.js";

const routes = Router();

routes.use("/api/auth", authRoutes);

routes.use("/api/etiquetas", authGuard, etiquetas);
routes.use("/api/etiquetas", authGuard, printRoutes);
routes.use("/api/ops", authGuard, opsRoutes);
routes.use("/api/alfa", authGuard, alfaRoutes);
routes.use("/api/retrabalho", authGuard, retrabalho);
routes.use("/api/produtos", authGuard, produtosRoutes);
routes.use("/api/devolucoes", authGuard, devolucoes);
routes.use("/api/conferencia", authGuard, conferenciaRoutes);

export default routes;