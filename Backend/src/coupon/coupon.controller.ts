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
        if (!userId) {
            return res.status(401).json({ message: "No autorizado" });
        }

        const { code, discountPercent, maxUses, expiresAt, eventId } = req.body;

        // Validate discount percent
        if (!discountPercent || discountPercent < 1 || discountPercent > 100) {
            return res.status(400).json({ message: "El descuento debe ser entre 1% y 100%" });
        }

        // Validate event exists and belongs to user
        const event = await Event.findOne({ where: { id: eventId, user_id: userId } });
        if (!event) {
            return res.status(404).json({ message: "Evento no encontrado o no te pertenece" });
        }

        // Check if code already exists
        const existingCoupon = await Coupon.findOne({ where: { code: code.toUpperCase() } });
        if (existingCoupon) {
            return res.status(400).json({ message: "El código ya existe" });
        }

        const coupon = new Coupon();
        coupon.code = code.toUpperCase().trim();
        coupon.discountPercent = discountPercent;
        coupon.maxUses = maxUses || 0; // 0 = unlimited
        coupon.expiresAt = expiresAt ? new Date(expiresAt) : null;
        coupon.eventId = eventId;
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
        const eventId = parseInt(req.params.eventId);

        if (!userId) {
            return res.status(401).json({ message: "No autorizado" });
        }

        // Verify event belongs to user
        const event = await Event.findOne({ where: { id: eventId, user_id: userId } });
        if (!event) {
            return res.status(404).json({ message: "Evento no encontrado o no te pertenece" });
        }

        const coupons = await Coupon.find({
            where: { eventId },
            order: { createdAt: "DESC" }
        });

        return res.json(coupons);
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
        const couponId = parseInt(req.params.id);

        if (!userId) {
            return res.status(401).json({ message: "No autorizado" });
        }

        const coupon = await Coupon.findOne({
            where: { id: couponId },
            relations: ["event"]
        });

        if (!coupon) {
            return res.status(404).json({ message: "Cupón no encontrado" });
        }

        // Verify event belongs to user
        if (coupon.event.user_id !== userId) {
            return res.status(403).json({ message: "No tienes permiso para eliminar este cupón" });
        }

        await coupon.remove();

        return res.json({ message: "Cupón eliminado correctamente" });
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
        const couponId = parseInt(req.params.id);

        if (!userId) {
            return res.status(401).json({ message: "No autorizado" });
        }

        const coupon = await Coupon.findOne({
            where: { id: couponId },
            relations: ["event"]
        });

        if (!coupon) {
            return res.status(404).json({ message: "Cupón no encontrado" });
        }

        if (coupon.event.user_id !== userId) {
            return res.status(403).json({ message: "No tienes permiso para modificar este cupón" });
        }

        coupon.isActive = !coupon.isActive;
        await coupon.save();

        return res.json(coupon);
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

        if (!code || !eventId) {
            return res.status(400).json({ valid: false, message: "Código y evento requeridos" });
        }

        const coupon = await Coupon.findOne({
            where: { code: code.toUpperCase().trim(), eventId, isActive: true }
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
