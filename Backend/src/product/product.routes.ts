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
import { schemaValidation } from '../common/middleware/schemaValidacion';
import { createProductSchema, updateProductSchema, productIdSchema } from '../schemas/schema.product';

const router = Router();

// GET /api/product - Listar catálogo del organizador logueado
router.get("/", checkAuthToken, getMyCatalog);

// POST /api/product - Crear producto en el catálogo
router.post("/", checkAuthToken, checkRoleAuth(["organizer", "admin"]), schemaValidation(createProductSchema), createProductController);

// PUT /api/product/:id - Actualizar producto
router.put("/:id", checkAuthToken, checkRoleAuth(["organizer", "admin"]), schemaValidation(updateProductSchema), updateProductController);

// DELETE /api/product/:id - Eliminar producto (soft delete)
router.delete("/:id", checkAuthToken, checkRoleAuth(["organizer", "admin"]), schemaValidation(productIdSchema), deleteProductController);

export default router;
