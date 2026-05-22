import { EventProduct } from "./eventProduct.entity";
import { Product } from "../product/product.entity";
import { ExtraItem, ExtraItemStatus } from "./extraItem.entity";
import AppDataSource from "../db";
import { getActiveSubscription } from "../subscription/subscription.service";
import { IsNull, Not } from "typeorm";

/**
 * Get active event products for a public event detail page.
 */
export const getActiveEventProducts = async (eventId: number): Promise<EventProduct[]> => {
    return EventProduct.find({
        where: { eventId, isActive: true },
        relations: ["product"],
        order: { createdAt: "ASC" }
    });
};

/**
 * Validate if user can activate extras in an event.
 */
export const canActivateExtrasInEvent = async (userId: number): Promise<{
    allowed: boolean;
    reason?: string;
    upgradeRequired?: boolean;
}> => {
    const subscription = await getActiveSubscription(userId);
    const plan = subscription.plan;

    if (!plan.canSellExtras) {
        return {
            allowed: false,
            reason: `Tu plan ${plan.displayName || plan.name} no permite vender extras. Actualiza a PRO para activar esta funcionalidad.`,
            upgradeRequired: true
        };
    }

    return { allowed: true };
};

/**
 * Activate a catalog product in an event (create EventProduct).
 */
export const createEventProduct = async (
    organizerId: number,
    eventId: number,
    data: {
        productId: number;
        eventPrice: number;
        hasStock?: boolean;
        stock?: number;
        maxPerOrder?: number;
    }
): Promise<EventProduct> => {
    const extraCheck = await canActivateExtrasInEvent(organizerId);
    if (!extraCheck.allowed) {
        const error: any = new Error(extraCheck.reason || "Not allowed to sell extras");
        error.code = "PLAN_LIMIT_EXTRAS";
        error.upgradeRequired = extraCheck.upgradeRequired;
        throw error;
    }

    // Verify the product belongs to this organizer
    const product = await Product.findOne({
        where: { id: data.productId, organizerId }
    });
    if (!product) {
        const error: any = new Error("Producto no encontrado en tu catálogo");
        error.code = "PRODUCT_NOT_FOUND";
        throw error;
    }

    const eventProduct = EventProduct.create({
        eventId,
        productId: data.productId,
        eventPrice: Number(data.eventPrice),
        hasStock: data.hasStock ?? false,
        stock: data.hasStock ? Number(data.stock || 0) : 0,
        maxPerOrder: Number(data.maxPerOrder || 10),
        isActive: true
    });

    await eventProduct.save();
    return eventProduct;
};

/**
 * Update an EventProduct configuration (price, stock, active, etc.)
 */
export const updateEventProduct = async (
    eventProductId: number,
    organizerId: number,
    data: {
        eventPrice?: number;
        isActive?: boolean;
        hasStock?: boolean;
        stock?: number;
        maxPerOrder?: number;
    }
): Promise<EventProduct> => {
    const eventProduct = await EventProduct.findOne({
        where: { id: eventProductId },
        relations: ["event", "product"]
    });

    if (!eventProduct) {
        const error: any = new Error("EventProduct no encontrado");
        error.code = "NOT_FOUND";
        throw error;
    }

    // Ownership check via event
    if (eventProduct.event?.user_id !== organizerId) {
        const error: any = new Error("No tienes permiso para modificar este evento");
        error.code = "FORBIDDEN";
        throw error;
    }

    if (data.eventPrice !== undefined) eventProduct.eventPrice = Number(data.eventPrice);
    if (data.isActive !== undefined) eventProduct.isActive = Boolean(data.isActive);
    if (data.hasStock !== undefined) eventProduct.hasStock = Boolean(data.hasStock);
    if (data.stock !== undefined) eventProduct.stock = Number(data.stock);
    if (data.maxPerOrder !== undefined) eventProduct.maxPerOrder = Number(data.maxPerOrder);

    await eventProduct.save();
    return eventProduct;
};

/**
 * Soft delete / deactivate an EventProduct.
 */
export const deactivateEventProduct = async (
    eventProductId: number,
    organizerId: number
): Promise<void> => {
    const eventProduct = await EventProduct.findOne({
        where: { id: eventProductId },
        relations: ["event"]
    });

    if (!eventProduct) {
        const error: any = new Error("EventProduct no encontrado");
        error.code = "NOT_FOUND";
        throw error;
    }

    if (eventProduct.event?.user_id !== organizerId) {
        const error: any = new Error("No tienes permiso para modificar este evento");
        error.code = "FORBIDDEN";
        throw error;
    }

    eventProduct.isActive = false;
    await eventProduct.save();
};

/**
 * Get extra items (vouchers) purchased by a user.
 */
export const getUserExtraItems = async (userId: number): Promise<ExtraItem[]> => {
    return ExtraItem.find({
        where: {
            userId,
            status: Not(ExtraItemStatus.CANCELLED),
            deletedAt: IsNull()
        },
        relations: ["eventProduct", "eventProduct.product", "eventProduct.event"],
        order: { createdAt: "DESC" }
    });
};
