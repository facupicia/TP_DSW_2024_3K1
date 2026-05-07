import { Request, Response } from "express";
import { Coupon } from "./coupon.entity";
import { Event } from "../event/event.entity";
import { CustomRequest } from "../common/middleware/authToken";
import AppDataSource from "../db";

/**
 * CREATE COUPON (Organizer only)
 * POST /coupon
 */
export const createCoupon = async (req: CustomRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        const isAdmin = (req.user?.roles || []).includes("admin");
        if (!userId) {
            return res.status(401).json({ message: "No autorizado" });
        }

        const { code, discountPercent, maxUses, expiresAt, eventId } = req.body;
        const normalizedCode = typeof code === "string" ? code.trim().toUpperCase() : "";
        const numericEventId = Number(eventId);
        const numericDiscount = Number(discountPercent);
        const numericMaxUses = maxUses === undefined || maxUses === null || maxUses === "" ? 0 : Number(maxUses);

        if (!normalizedCode) {
            return res.status(400).json({ message: "El código es requerido" });
        }

        if (!Number.isInteger(numericEventId) || numericEventId <= 0) {
            return res.status(400).json({ message: "Evento inválido" });
        }

        // Validate discount percent
        if (!Number.isFinite(numericDiscount) || numericDiscount < 1 || numericDiscount > 100) {
            return res.status(400).json({ message: "El descuento debe ser entre 1% y 100%" });
        }

        if (!Number.isInteger(numericMaxUses) || numericMaxUses < 0) {
            return res.status(400).json({ message: "El máximo de usos no puede ser negativo" });
        }

        // Validate event exists and belongs to user
        const event = await Event.findOne({
            where: { id: numericEventId },
            select: ["id", "user_id"]
        });
        if (!event || (event.user_id !== userId && !isAdmin)) {
            return res.status(404).json({ message: "Evento no encontrado o no te pertenece" });
        }

        // Check if code already exists
        const existingCoupon = await Coupon.findOne({
            where: { code: normalizedCode },
            select: ["id"]
        });
        if (existingCoupon) {
            return res.status(400).json({ message: "El código ya existe" });
        }

        const coupon = new Coupon();
        coupon.code = normalizedCode;
        coupon.discountPercent = numericDiscount;
        coupon.maxUses = numericMaxUses; // 0 = unlimited
        coupon.expiresAt = expiresAt ? new Date(expiresAt) : null;
        coupon.eventId = numericEventId;
        coupon.isActive = true;

        await coupon.save();

        return res.status(201).json(coupon);
    } catch (error: any) {
        console.error("Error creating coupon:", error);
        return res.status(500).json({ message: "Error al crear cupón", error: error.message });
    }
};

/**
 * GET COUPONS BY EVENT (Organizer only)
 * GET /coupon/event/:eventId
 */
export const getCouponsByEvent = async (req: CustomRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        const isAdmin = (req.user?.roles || []).includes("admin");
        const eventId = parseInt(req.params.eventId);

        if (!userId) {
            return res.status(401).json({ message: "No autorizado" });
        }

        if (isNaN(eventId) || eventId <= 0) {
            return res.status(400).json({ message: "Evento inválido" });
        }

        // Verify event belongs to user
        const event = await Event.findOne({
            where: { id: eventId },
            select: ["id", "user_id"]
        });
        if (!event || (event.user_id !== userId && !isAdmin)) {
            return res.status(404).json({ message: "Evento no encontrado o no te pertenece" });
        }

        const { skip, take } = (await import("../common/services/pagination")).getPagination(req.query, 50, 100);
        const [coupons, total] = await Coupon.findAndCount({
            where: { eventId },
            order: { createdAt: "DESC" },
            skip,
            take
        });

        return res.json({ data: coupons, total });
    } catch (error: any) {
        console.error("Error fetching coupons:", error);
        return res.status(500).json({ message: "Error al obtener cupones" });
    }
};

/**
 * DELETE COUPON (Organizer only)
 * DELETE /coupon/:id
 */
export const deleteCoupon = async (req: CustomRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        const isAdmin = (req.user?.roles || []).includes("admin");
        const couponId = parseInt(req.params.id);

        if (!userId) {
            return res.status(401).json({ message: "No autorizado" });
        }

        if (isNaN(couponId) || couponId <= 0) {
            return res.status(400).json({ message: "Cupón inválido" });
        }

        const coupon = await AppDataSource.getRepository(Coupon)
            .createQueryBuilder("coupon")
            .innerJoin("coupon.event", "event")
            .select([
                'coupon.id AS "id"',
                'event.user_id AS "eventUserId"'
            ])
            .where("coupon.id = :couponId", { couponId })
            .getRawOne();

        if (!coupon) {
            return res.status(404).json({ message: "Cupón no encontrado" });
        }

        // Verify event belongs to user
        if (Number(coupon.eventUserId) !== userId && !isAdmin) {
            return res.status(403).json({ message: "No tienes permiso para eliminar este cupón" });
        }

        await Coupon.update(couponId, { isActive: false });

        return res.json({ message: "Cupón desactivado correctamente" });
    } catch (error: any) {
        console.error("Error deleting coupon:", error);
        return res.status(500).json({ message: "Error al eliminar cupón" });
    }
};

/**
 * TOGGLE COUPON ACTIVE STATUS (Organizer only)
 * PUT /coupon/:id/toggle
 */
export const toggleCoupon = async (req: CustomRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        const isAdmin = (req.user?.roles || []).includes("admin");
        const couponId = parseInt(req.params.id);

        if (!userId) {
            return res.status(401).json({ message: "No autorizado" });
        }

        if (isNaN(couponId) || couponId <= 0) {
            return res.status(400).json({ message: "Cupón inválido" });
        }

        const coupon = await AppDataSource.getRepository(Coupon)
            .createQueryBuilder("coupon")
            .innerJoin("coupon.event", "event")
            .select([
                'coupon.id AS "id"',
                'coupon.isActive AS "isActive"',
                'event.user_id AS "eventUserId"'
            ])
            .where("coupon.id = :couponId", { couponId })
            .getRawOne();

        if (!coupon) {
            return res.status(404).json({ message: "Cupón no encontrado" });
        }

        if (Number(coupon.eventUserId) !== userId && !isAdmin) {
            return res.status(403).json({ message: "No tienes permiso para modificar este cupón" });
        }

        await Coupon.update(couponId, { isActive: !coupon.isActive });
        const updatedCoupon = await Coupon.findOneBy({ id: couponId });

        return res.json(updatedCoupon);
    } catch (error: any) {
        console.error("Error toggling coupon:", error);
        return res.status(500).json({ message: "Error al modificar cupón" });
    }
};

/**
 * VALIDATE COUPON (Public - for checkout)
 * POST /coupon/validate
 */
export const validateCoupon = async (req: Request, res: Response) => {
    try {
        const { code, eventId } = req.body;
        const normalizedCode = typeof code === "string" ? code.trim().toUpperCase() : "";
        const numericEventId = Number(eventId);

        if (!normalizedCode || !Number.isInteger(numericEventId) || numericEventId <= 0) {
            return res.status(400).json({ valid: false, message: "Código y evento requeridos" });
        }

        const coupon = await Coupon.findOne({
            where: { code: normalizedCode, eventId: numericEventId, isActive: true },
            select: ["id", "discountPercent", "maxUses", "usedCount", "expiresAt"]
        });

        if (!coupon) {
            return res.status(404).json({ valid: false, message: "Cupón no válido para este evento" });
        }

        // Check expiration
        if (coupon.expiresAt && new Date() > coupon.expiresAt) {
            return res.status(400).json({ valid: false, message: "Cupón expirado" });
        }

        // Check usage limit
        if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) {
            return res.status(400).json({ valid: false, message: "Cupón agotado" });
        }

        return res.json({
            valid: true,
            discountPercent: coupon.discountPercent,
            couponId: coupon.id,
            message: `Descuento del ${coupon.discountPercent}% aplicado`
        });
    } catch (error: any) {
        console.error("Error validating coupon:", error);
        return res.status(500).json({ valid: false, message: "Error al validar cupón" });
    }
};

/**
 * INCREMENT COUPON USAGE (Internal use after successful payment)
 */
export const incrementCouponUsage = async (couponId: number): Promise<void> => {
    try {
        await Coupon.update(couponId, {
            usedCount: () => "usedCount + 1"
        });
    } catch (error) {
        console.error("Error incrementing coupon usage:", error);
    }
};
