import { Request, Response } from "express";
import { logger } from "../common/services/logger";
import { Product, ProductCategory } from "./product.entity";
import { CustomRequest } from "../common/middleware/authToken";
import {
    getProductsByOrganizer,
    createProduct,
    updateProduct,
    softDeleteProduct
} from "./product.service";

/* ======================================================
   GET ORGANIZER CATALOG
====================================================== */
export const getMyCatalog = async (req: CustomRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ code: "AUTH_REQUIRED", message: "No autorizado" });
        }

        const products = await getProductsByOrganizer(userId);
        return res.json(products);

    } catch (error) {
        logger.error("Error fetching product catalog:", error);
        return res.status(500).json({
            code: "INTERNAL_ERROR",
            message: "Error al obtener catálogo de productos"
        });
    }
};

/* ======================================================
   CREATE PRODUCT
====================================================== */
export const createProductController = async (req: CustomRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ code: "AUTH_REQUIRED", message: "No autorizado" });
        }

        const { name, description, category, basePrice, imageUrl } = req.body;

        if (!name || !category || basePrice == null) {
            return res.status(400).json({
                code: "MISSING_FIELDS",
                message: "Faltan campos requeridos: name, category, basePrice"
            });
        }

        if (!Object.values(ProductCategory).includes(category)) {
            return res.status(400).json({
                code: "INVALID_CATEGORY",
                message: `Categoría inválida. Valores permitidos: ${Object.values(ProductCategory).join(', ')}`
            });
        }

        if (Number(basePrice) < 0) {
            return res.status(400).json({ code: "INVALID_PRICE", message: "El precio no puede ser negativo" });
        }

        const product = await createProduct(userId, {
            name,
            description,
            category,
            basePrice,
            imageUrl
        });

        return res.status(201).json(product);

    } catch (error: any) {
        logger.error("Error creating product:", error);
        if (error.code === "PLAN_LIMIT_CATALOG") {
            return res.status(403).json({
                code: error.code,
                message: error.message,
                upgradeRequired: error.upgradeRequired || true
            });
        }
        return res.status(500).json({
            code: "INTERNAL_ERROR",
            message: "Error al crear producto"
        });
    }
};

/* ======================================================
   UPDATE PRODUCT
====================================================== */
export const updateProductController = async (req: CustomRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ code: "AUTH_REQUIRED", message: "No autorizado" });
        }

        const id = Number(req.params.id);
        if (isNaN(id) || id <= 0) {
            return res.status(400).json({ code: "INVALID_ID", message: "ID de producto inválido" });
        }

        const { name, description, category, basePrice, imageUrl } = req.body;

        if (category && !Object.values(ProductCategory).includes(category)) {
            return res.status(400).json({
                code: "INVALID_CATEGORY",
                message: `Categoría inválida. Valores permitidos: ${Object.values(ProductCategory).join(', ')}`
            });
        }

        if (basePrice !== undefined && Number(basePrice) < 0) {
            return res.status(400).json({ code: "INVALID_PRICE", message: "El precio no puede ser negativo" });
        }

        const product = await updateProduct(id, userId, { name, description, category, basePrice, imageUrl });
        return res.json(product);

    } catch (error: any) {
        logger.error("Error updating product:", error);
        if (error.code === "NOT_FOUND") {
            return res.status(404).json({ code: error.code, message: error.message });
        }
        return res.status(500).json({
            code: "INTERNAL_ERROR",
            message: "Error al actualizar producto"
        });
    }
};

/* ======================================================
   DELETE PRODUCT (SOFT)
====================================================== */
export const deleteProductController = async (req: CustomRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ code: "AUTH_REQUIRED", message: "No autorizado" });
        }

        const id = Number(req.params.id);
        if (isNaN(id) || id <= 0) {
            return res.status(400).json({ code: "INVALID_ID", message: "ID de producto inválido" });
        }

        await softDeleteProduct(id, userId);
        return res.sendStatus(204);

    } catch (error: any) {
        logger.error("Error deleting product:", error);
        if (error.code === "NOT_FOUND") {
            return res.status(404).json({ code: error.code, message: error.message });
        }
        return res.status(500).json({
            code: "INTERNAL_ERROR",
            message: "Error al eliminar producto"
        });
    }
};
