import { Product } from "./product.entity";
import AppDataSource from "../db";
import { getActiveSubscription } from "../subscription/subscription.service";

/**
 * Get all products in the organizer's catalog (non-deleted)
 */
export const getProductsByOrganizer = async (organizerId: number): Promise<Product[]> => {
    return Product.find({
        where: { organizerId },
        order: { createdAt: "DESC" }
    });
};

/**
 * Validate if user can manage their product catalog based on plan limits.
 */
export const canManageProductCatalog = async (userId: number): Promise<{
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
 * Count products in organizer's catalog.
 */
export const countProductsInCatalog = async (organizerId: number): Promise<number> => {
    return Product.count({ where: { organizerId } });
};

/**
 * Create a new product in the organizer's catalog.
 */
export const createProduct = async (
    organizerId: number,
    data: {
        name: string;
        description?: string;
        category: string;
        basePrice: number;
        imageUrl?: string;
    }
): Promise<Product> => {
    const catalogCheck = await canManageProductCatalog(organizerId);
    if (!catalogCheck.allowed) {
        const error: any = new Error(catalogCheck.reason || "Product catalog limit reached");
        error.code = "PLAN_LIMIT_CATALOG";
        error.upgradeRequired = catalogCheck.upgradeRequired;
        throw error;
    }

    const subscription = await getActiveSubscription(organizerId);
    const plan = subscription.plan;

    if (plan.maxProductsInCatalog !== -1) {
        const currentCount = await countProductsInCatalog(organizerId);
        if (currentCount >= plan.maxProductsInCatalog) {
            const error: any = new Error(
                `Tu plan ${plan.displayName || plan.name} permite máximo ${plan.maxProductsInCatalog} producto(s) en el catálogo.`
            );
            error.code = "PLAN_LIMIT_CATALOG";
            error.upgradeRequired = true;
            throw error;
        }
    }

    const product = Product.create({
        organizerId,
        name: data.name.trim(),
        description: data.description?.trim() || null,
        category: data.category as any,
        basePrice: Number(data.basePrice),
        imageUrl: data.imageUrl || null
    });

    await product.save();
    return product;
};

/**
 * Update an existing product (only owner)
 */
export const updateProduct = async (
    productId: number,
    organizerId: number,
    data: {
        name?: string;
        description?: string;
        category?: string;
        basePrice?: number;
        imageUrl?: string;
    }
): Promise<Product> => {
    const product = await Product.findOne({ where: { id: productId, organizerId } });
    if (!product) {
        const error: any = new Error("Producto no encontrado");
        error.code = "NOT_FOUND";
        throw error;
    }

    if (data.name !== undefined) product.name = data.name.trim();
    if (data.description !== undefined) product.description = data.description?.trim() || null;
    if (data.category !== undefined) product.category = data.category as any;
    if (data.basePrice !== undefined) product.basePrice = Number(data.basePrice);
    if (data.imageUrl !== undefined) product.imageUrl = data.imageUrl || null;

    await product.save();
    return product;
};

/**
 * Soft delete a product from the catalog.
 * Existing EventProducts remain but can no longer be activated in new events.
 */
export const softDeleteProduct = async (productId: number, organizerId: number): Promise<void> => {
    const product = await Product.findOne({ where: { id: productId, organizerId } });
    if (!product) {
        const error: any = new Error("Producto no encontrado");
        error.code = "NOT_FOUND";
        throw error;
    }

    await product.softRemove();
};
