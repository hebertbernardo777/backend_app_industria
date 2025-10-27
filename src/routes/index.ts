import { Router } from "express";
import etiquetas from "./etiquetas.routes.js";

const routes = Router();

// prefixo único da API
routes.use("/api/etiquetas", etiquetas);

export default routes;
