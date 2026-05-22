import { Request, Response } from "express";
import { logger } from "../common/services/logger";
import { EventProduct } from "./eventProduct.entity";
import { CustomRequest } from "../common/middleware/authToken";
import {
    getActiveEventProducts,
    createEventProduct,
    updateEventProduct,
    deactivateEventProduct,
    getUserExtraItems
} from "./extra.service";

/* ======================================================
   GET ACTIVE EXTRAS FOR AN EVENT (PUBLIC)
====================================================== */
export const getEventExtras = async (req: Request, res: Response) => {
    try {
        const eventId = Number(req.params.eventId);
        if (isNaN(eventId) || eventId <= 0) {
            return res.status(400).json({ code: "INVALID_ID", message: "ID de evento inválido" });
        }

        const extras = await getActiveEventProducts(eventId);
        return res.json(extras);

    } catch (error) {
        logger.error("Error fetching event extras:", error);
        return res.status(500).json({
            code: "INTERNAL_ERROR",
            message: "Error al obtener extras del evento"
        });
    }
};

/* ======================================================
   ACTIVATE A PRODUCT IN AN EVENT
====================================================== */
export const addExtraToEvent = async (req: CustomRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        const isAdmin = (req.user?.roles || []).includes("admin");
        if (!userId) {
            return res.status(401).json({ code: "AUTH_REQUIRED", message: "No autorizado" });
        }

        const eventId = Number(req.params.eventId);
        if (isNaN(eventId) || eventId <= 0) {
            return res.status(400).json({ code: "INVALID_ID", message: "ID de evento inválido" });
        }

        const { productId, eventPrice, hasStock, stock, maxPerOrder } = req.body;

        if (!productId || eventPrice == null) {
            return res.status(400).json({
                code: "MISSING_FIELDS",
                message: "Faltan campos requeridos: productId, eventPrice"
            });
        }

        if (Number(eventPrice) < 0) {
            return res.status(400).json({ code: "INVALID_PRICE", message: "El precio no puede ser negativo" });
        }

        // Verify event ownership
        const { Event } = await import("../event/event.entity");
        const event = await Event.findOne({ where: { id: eventId }, select: ["id", "user_id"] });
        if (!event) {
            return res.status(404).json({ code: "EVENT_NOT_FOUND", message: "Evento no encontrado" });
        }
        if (event.user_id !== userId && !isAdmin) {
            return res.status(403).json({ code: "FORBIDDEN", message: "No tienes permiso para modificar este evento" });
        }

        const extra = await createEventProduct(userId, eventId, {
            productId: Number(productId),
            eventPrice: Number(eventPrice),
            hasStock,
            stock,
            maxPerOrder
        });

        return res.status(201).json(extra);

    } catch (error: any) {
        logger.error("Error adding extra to event:", error);
        if (error.code === "PLAN_LIMIT_EXTRAS") {
            return res.status(403).json({
                code: error.code,
                message: error.message,
                upgradeRequired: error.upgradeRequired || true
            });
        }
        if (error.code === "PRODUCT_NOT_FOUND") {
            return res.status(404).json({ code: error.code, message: error.message });
        }
        return res.status(500).json({
            code: "INTERNAL_ERROR",
            message: "Error al agregar extra al evento"
        });
    }
};

/* ======================================================
   UPDATE EVENT PRODUCT CONFIG
====================================================== */
export const updateEventExtra = async (req: CustomRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ code: "AUTH_REQUIRED", message: "No autorizado" });
        }

        const extraId = Number(req.params.extraId);
        if (isNaN(extraId) || extraId <= 0) {
            return res.status(400).json({ code: "INVALID_ID", message: "ID de extra inválido" });
        }

        const { eventPrice, isActive, hasStock, stock, maxPerOrder } = req.body;

        if (eventPrice !== undefined && Number(eventPrice) < 0) {
            return res.status(400).json({ code: "INVALID_PRICE", message: "El precio no puede ser negativo" });
        }

        const updated = await updateEventProduct(extraId, userId, {
            eventPrice,
            isActive,
            hasStock,
            stock,
            maxPerOrder
        });

        return res.json(updated);

    } catch (error: any) {
        logger.error("Error updating event extra:", error);
        if (error.code === "NOT_FOUND") {
            return res.status(404).json({ code: error.code, message: error.message });
        }
        if (error.code === "FORBIDDEN") {
            return res.status(403).json({ code: error.code, message: error.message });
        }
        return res.status(500).json({
            code: "INTERNAL_ERROR",
            message: "Error al actualizar extra del evento"
        });
    }
};

/* ======================================================
   DEACTIVATE EVENT PRODUCT
====================================================== */
export const removeExtraFromEvent = async (req: CustomRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ code: "AUTH_REQUIRED", message: "No autorizado" });
        }

        const extraId = Number(req.params.extraId);
        if (isNaN(extraId) || extraId <= 0) {
            return res.status(400).json({ code: "INVALID_ID", message: "ID de extra inválido" });
        }

        await deactivateEventProduct(extraId, userId);
        return res.sendStatus(204);

    } catch (error: any) {
        logger.error("Error removing extra from event:", error);
        if (error.code === "NOT_FOUND") {
            return res.status(404).json({ code: error.code, message: error.message });
        }
        if (error.code === "FORBIDDEN") {
            return res.status(403).json({ code: error.code, message: error.message });
        }
        return res.status(500).json({
            code: "INTERNAL_ERROR",
            message: "Error al eliminar extra del evento"
        });
    }
};

/* ======================================================
   GET MY PURCHASED EXTRAS (VOUCHERS)
====================================================== */
export const getMyExtras = async (req: CustomRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ code: "AUTH_REQUIRED", message: "No autorizado" });
        }

        const extras = await getUserExtraItems(userId);
        return res.json(extras);

    } catch (error) {
        logger.error("Error fetching user extras:", error);
        return res.status(500).json({
            code: "INTERNAL_ERROR",
            message: "Error al obtener extras del usuario"
        });
    }
};
