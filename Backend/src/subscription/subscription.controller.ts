import { Request, Response } from "express";
import { CustomRequest } from "../common/middleware/authToken";
import AppDataSource from "../db";
import { SubscriptionPlan } from "./subscription_plan.entity";
import { UserSubscription } from "./user_subscription.entity";
import {
    getActiveSubscription,
    getSubscriptionLimits,
    upgradeToPlan
} from "./subscription.service";
import {
    createSubscriptionCheckout,
    processSubscriptionWebhook,
    cancelUserSubscription,
    fetchSubscriptionFromMP,
    parseSubscriptionExternalRef
} from "./subscription.core";
import { logger } from "../common/services/logger";
import { getRedis } from "../common/services/redis";
import { getMPConfig } from "../payment/mp.config";

const PLANS_CACHE_KEY = "subscription:plans";
const PLANS_CACHE_TTL = 300; // 5 minutos

async function getCachedPlans() {
    const redis = await getRedis();
    if (redis) {
        const cached = await redis.get(PLANS_CACHE_KEY).catch(() => null);
        if (cached) {
            try {
                return JSON.parse(cached);
            } catch {
                // fallthrough to DB
            }
        }
    }

    const planRepo = AppDataSource.getRepository(SubscriptionPlan);
    const plans = await planRepo.find({
        where: { active: true },
        order: { sortOrder: 'ASC' }
    });

    if (redis) {
        await redis.setEx(PLANS_CACHE_KEY, PLANS_CACHE_TTL, JSON.stringify(plans)).catch(() => {});
    }

    return plans;
}

export async function invalidatePlansCache(): Promise<void> {
    const redis = await getRedis();
    if (redis) {
        await redis.del(PLANS_CACHE_KEY).catch(() => {});
    }
}

/**
 * Subscription Controller (Refactored)
 * 
 * Controlador refactorizado que usa el SubscriptionCore para la lógica de negocio.
 * Mantiene solo la responsabilidad de HTTP requests/responses.
 */

// ============================================================================
// PUBLIC ENDPOINTS
// ============================================================================

/**
 * GET /api/subscription/plans
 * 
 * Obtiene todos los planes de suscripción activos.
 */
export const getPlans = async (req: Request, res: Response) => {
    try {
        const plans = await getCachedPlans();

        res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
        return res.json({
            success: true,
            plans
        });

    } catch (error: any) {
        logger.error("Error fetching plans:", error);
        return res.status(500).json({
            success: false,
            message: "Error al obtener planes"
        });
    }
};

// ============================================================================
// AUTHENTICATED USER ENDPOINTS
// ============================================================================

/**
 * GET /api/subscription/my-subscription
 * 
 * Obtiene la suscripción activa del usuario actual.
 */
export const getMySubscription = async (req: CustomRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ 
                success: false,
                message: "Unauthorized" 
            });
        }
        
        const subscription = await getActiveSubscription(userId);
        
        return res.json({
            success: true,
            subscription: {
                id: subscription.id,
                plan: {
                    id: subscription.plan.id,
                    name: subscription.plan.name,
                    displayName: subscription.plan.displayName,
                    commissionPercent: Number(subscription.plan.commissionPercent),
                    serviceFeePercent: Number(subscription.plan.serviceFeePercent),
                    minimumServiceFee: Number(subscription.plan.minimumServiceFee),
                    maxProductsInCatalog: subscription.plan.maxProductsInCatalog,
                    canSellExtras: subscription.plan.canSellExtras,
                    features: subscription.plan.features,
                    monthlyPrice: Number(subscription.plan.monthlyPrice),
                    yearlyPrice: subscription.plan.yearlyPrice 
                        ? Number(subscription.plan.yearlyPrice) 
                        : null
                },
                status: subscription.status,
                currentPeriodStart: subscription.currentPeriodStart,
                currentPeriodEnd: subscription.currentPeriodEnd,
                externalSubscriptionId: subscription.externalSubscriptionId
            }
        });
        
    } catch (error: any) {
        logger.error("Error fetching subscription:", error);
        return res.status(500).json({ 
            success: false,
            message: "Error al obtener suscripción" 
        });
    }
};

/**
 * GET /api/subscription/my-limits
 * 
 * Obtiene los límites y uso actual del usuario.
 */
export const getMyLimits = async (req: CustomRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ 
                success: false,
                message: "Unauthorized" 
            });
        }
        
        const limits = await getSubscriptionLimits(userId);
        
        return res.json({
            success: true,
            ...limits
        });
        
    } catch (error: any) {
        logger.error("Error fetching limits:", error);
        return res.status(500).json({ 
            success: false,
            message: "Error al obtener límites" 
        });
    }
};

/**
 * POST /api/subscription/checkout/:planId
 * 
 * Crea un checkout de MercadoPago para suscripción.
 */
export const createCheckout = async (req: CustomRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        const planId = parseInt(req.params.planId);
        const { billingType = 'monthly' } = req.body;
        
        if (!userId) {
            return res.status(401).json({ 
                success: false,
                message: "Unauthorized" 
            });
        }
        
        if (!planId || isNaN(planId)) {
            return res.status(400).json({ 
                success: false,
                message: "Plan ID inválido" 
            });
        }
        
        if (billingType !== 'monthly' && billingType !== 'yearly') {
            return res.status(400).json({ 
                success: false,
                message: "billingType debe ser 'monthly' o 'yearly'" 
            });
        }
        
        const { initPoint, preapprovalId } = await createSubscriptionCheckout({
            userId,
            planId,
            billingType
        });
        
        return res.json({
            success: true,
            checkoutUrl: initPoint,
            preapprovalId,
            message: "Redirige al usuario a checkoutUrl para completar el pago"
        });
        
    } catch (error: any) {
        logger.error("Error creating checkout:", error);
        return res.status(500).json({ 
            success: false,
            message: error.message || "Error al crear checkout" 
        });
    }
};

/**
 * POST /api/subscription/verify/:id
 * 
 * Verifica manualmente una suscripción por su preapproval_id.
 * Útil cuando el webhook se demora.
 */
export const verifySubscription = async (req: CustomRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        const preapprovalId = req.params.id;
        
        if (!userId) {
            return res.status(401).json({ 
                success: false,
                message: "Unauthorized" 
            });
        }
        
        if (!preapprovalId) {
            return res.status(400).json({ 
                success: false,
                message: "ID de preaprobación requerido" 
            });
        }

        const remoteSubscription = await fetchSubscriptionFromMP(preapprovalId);
        const parsedRef = remoteSubscription?.external_reference
            ? parseSubscriptionExternalRef(String(remoteSubscription.external_reference))
            : null;

        if (!parsedRef || parsedRef.userId !== userId) {
            return res.status(403).json({
                success: false,
                message: "No tienes permiso para verificar esta suscripción"
            });
        }
        
        // Procesar webhook manualmente
        await processSubscriptionWebhook("preapproval", preapprovalId);
        
        // Obtener suscripción actualizada
        const subscription = await getActiveSubscription(userId);
        
        return res.json({
            success: true,
            status: subscription.status,
            active: subscription.status === 'active',
            plan: subscription.plan.name
        });
        
    } catch (error: any) {
        logger.error("Error verifying subscription:", error);
        return res.status(500).json({ 
            success: false,
            message: error.message || "Error al verificar suscripción" 
        });
    }
};

/**
 * POST /api/subscription/cancel
 * 
 * Cancela la suscripción activa del usuario.
 */
export const cancelMySubscription = async (req: CustomRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ 
                success: false,
                message: "Unauthorized" 
            });
        }
        
        await cancelUserSubscription(userId);
        
        return res.json({
            success: true,
            message: "Suscripción cancelada. Tu plan se mantendrá activo hasta el fin del período actual."
        });
        
    } catch (error: any) {
        logger.error("Error cancelling subscription:", error);
        return res.status(500).json({ 
            success: false,
            message: error.message || "Error al cancelar suscripción" 
        });
    }
};

// ============================================================================
// WEBHOOK & CALLBACK
// ============================================================================

/**
 * POST/GET /api/subscription/webhook
 * 
 * Recibe notificaciones de MercadoPago sobre suscripciones.
 */
export const subscriptionWebhook = async (req: Request, res: Response) => {
    try {
        const type = req.query.type || req.body?.type;
        const dataId = req.query['data.id'] || req.body?.data?.id;
        
        logger.info('SUBSCRIPTION_WEBHOOK_RECEIVED', { 
            type, 
            dataId, 
            hasBody: !!req.body,
            queryKeys: Object.keys(req.query || {})
        });
        
        if (!type || !dataId) {
            // Solo acknowledge - podría ser un test ping
            return res.sendStatus(200);
        }
        
        await processSubscriptionWebhook(String(type), String(dataId));
        
        return res.sendStatus(200);
        
    } catch (error: any) {
        logger.error("Subscription webhook error:", { error: error?.message });
        return res.sendStatus(500);
    }
};

/**
 * GET /api/subscription/callback
 * 
 * Redirige al frontend después del checkout de MP.
 */
export const subscriptionCallback = async (req: Request, res: Response) => {
    try {
        const preapprovalId = req.query.preapproval_id || '';
        const status = req.query.status || '';
        const config = getMPConfig();
        
        const params = new URLSearchParams();
        if (preapprovalId) params.set('preapproval_id', String(preapprovalId));
        if (status) params.set('status', String(status));
        
        const redirectUrl = `${config.clientUrl}/subscription/callback${
            params.toString() ? '?' + params.toString() : ''
        }`;
        
        logger.info('SUBSCRIPTION_CALLBACK_REDIRECT', { 
            preapprovalId, 
            status, 
            redirectUrl 
        });
        
        return res.redirect(redirectUrl);
        
    } catch (error: any) {
        logger.error('Subscription callback error:', error);
        const config = getMPConfig();
        return res.redirect(
            `${config.clientUrl}/subscription/callback?error=redirect_failed`
        );
    }
};

// ============================================================================
// ADMIN ENDPOINTS
// ============================================================================

/**
 * POST /api/subscription/admin/assign
 * 
 * Admin: Asigna un plan a un usuario manualmente.
 */
export const adminAssignPlan = async (req: CustomRequest, res: Response) => {
    try {
        const userId = Number(req.body?.userId);
        const planId = Number(req.body?.planId);
        const durationMonths = Number(req.body?.durationMonths ?? 1);
        
        if (!Number.isSafeInteger(userId) || userId <= 0 || !Number.isSafeInteger(planId) || planId <= 0) {
            return res.status(400).json({ 
                success: false,
                message: "userId y planId son requeridos" 
            });
        }

        if (!Number.isSafeInteger(durationMonths) || durationMonths < 1 || durationMonths > 36) {
            return res.status(400).json({
                success: false,
                message: "durationMonths debe ser un entero entre 1 y 36"
            });
        }
        
        const subscription = await upgradeToPlan(userId, planId, durationMonths);
        await invalidatePlansCache();

        return res.json({
            success: true,
            message: "Plan asignado exitosamente",
            subscription: {
                id: subscription.id,
                userId: subscription.userId,
                planId: subscription.planId,
                planName: subscription.plan.name,
                status: subscription.status,
                expiresAt: subscription.currentPeriodEnd
            }
        });
        
    } catch (error: any) {
        logger.error("Error assigning plan:", error);
        return res.status(500).json({ 
            success: false,
            message: error.message || "Error al asignar plan" 
        });
    }
};

/**
 * GET /api/subscription/admin/stats
 * 
 * Admin: Estadísticas de suscripciones.
 */
export const adminGetStats = async (req: CustomRequest, res: Response) => {
    try {
        const subscriptionRepo = AppDataSource.getRepository(UserSubscription);
        const planRepo = AppDataSource.getRepository(SubscriptionPlan);
        
        const plans = await planRepo.find();
        
        const stats = await Promise.all(plans.map(async (plan) => {
            const activeCount = await subscriptionRepo.count({
                where: { planId: plan.id, status: 'active' as any }
            });
            return {
                planId: plan.id,
                planName: plan.name,
                activeSubscriptions: activeCount
            };
        }));
        
        return res.json({
            success: true,
            subscriptionsByPlan: stats,
            totalActiveSubscriptions: stats.reduce((sum, s) => sum + s.activeSubscriptions, 0)
        });
        
    } catch (error: any) {
        logger.error("Error fetching admin stats:", error);
        return res.status(500).json({ 
            success: false,
            message: "Error al obtener estadísticas" 
        });
    }
};
