/**
 * Product Routes
 * Endpoints for managing the organizer's product catalog
 */
import { Router } from "express";
import {
    getMyCatalog,
    createProductController,
    updateProductController,
    deleteProductController
} from "./product.controller";
import { checkAuthToken } from "../common/middleware/authToken";
import { checkRoleAuth } from "../common/middleware/checkRole";

const router = Router();

// GET /api/product - Listar catálogo del organizador logueado
router.get("/", checkAuthToken, getMyCatalog);

// POST /api/product - Crear producto en el catálogo
router.post("/", checkAuthToken, checkRoleAuth(["organizer", "admin"]), createProductController);

// PUT /api/product/:id - Actualizar producto
router.put("/:id", checkAuthToken, checkRoleAuth(["organizer", "admin"]), updateProductController);

// DELETE /api/product/:id - Eliminar producto (soft delete)
router.delete("/:id", checkAuthToken, checkRoleAuth(["organizer", "admin"]), deleteProductController);

export default router;
