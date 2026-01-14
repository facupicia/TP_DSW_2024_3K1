import { Request, Response } from "express";
import { CustomRequest } from "../middlewares/authToken";
import AppDataSource from "../db";
import { SubscriptionPlan } from "./subscription_plan.entity";
import { UserSubscription } from "./user_subscription.entity";
import {
    getActiveSubscription,
    getSubscriptionLimits,
    upgradeToPlan,
    assignDefaultPlan
} from "./subscription.service";
import {
    createSubscriptionCheckout,
    processSubscriptionWebhook,
    cancelSubscription
} from "./subscription.payment";

/**
 * Get all available subscription plans
 */
export const getPlans = async (req: Request, res: Response) => {
    try {
        const planRepo = AppDataSource.getRepository(SubscriptionPlan);
        const plans = await planRepo.find({
            where: { active: true },
            order: { sortOrder: 'ASC' }
        });

        return res.json(plans);
    } catch (error) {
        console.error("Error fetching plans:", error);
        return res.status(500).json({ message: "Error al obtener planes" });
    }
};

/**
 * Get current user's subscription
 */
export const getMySubscription = async (req: CustomRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const subscription = await getActiveSubscription(userId);

        return res.json({
            id: subscription.id,
            plan: {
                id: subscription.plan.id,
                name: subscription.plan.name,
                displayName: subscription.plan.displayName,
                commissionPercent: Number(subscription.plan.commissionPercent),
                features: subscription.plan.features,
                monthlyPrice: Number(subscription.plan.monthlyPrice),
                yearlyPrice: subscription.plan.yearlyPrice ? Number(subscription.plan.yearlyPrice) : null
            },
            status: subscription.status,
            currentPeriodStart: subscription.currentPeriodStart,
            currentPeriodEnd: subscription.currentPeriodEnd,
            externalSubscriptionId: subscription.externalSubscriptionId
        });
    } catch (error) {
        console.error("Error fetching subscription:", error);
        return res.status(500).json({ message: "Error al obtener suscripción" });
    }
};

/**
 * Get current user's subscription limits and usage
 */
export const getMyLimits = async (req: CustomRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const limits = await getSubscriptionLimits(userId);
        return res.json(limits);
    } catch (error) {
        console.error("Error fetching limits:", error);
        return res.status(500).json({ message: "Error al obtener límites" });
    }
};

/**
 * Create MP checkout for subscription upgrade
 */
export const createCheckout = async (req: CustomRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        const planId = parseInt(req.params.planId);
        const { billingType = 'monthly' } = req.body;

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        if (!planId || isNaN(planId)) {
            return res.status(400).json({ message: "Plan ID inválido" });
        }

        if (billingType !== 'monthly' && billingType !== 'yearly') {
            return res.status(400).json({ message: "billingType debe ser 'monthly' o 'yearly'" });
        }

        const { initPoint, preapprovalId } = await createSubscriptionCheckout(userId, planId, billingType);

        return res.json({
            checkoutUrl: initPoint,
            preapprovalId,
            message: "Redirige al usuario a checkoutUrl para completar el pago"
        });
    } catch (error: any) {
        console.error("Error creating checkout:", error);
        return res.status(500).json({ message: error.message || "Error al crear checkout" });
    }
};

/**
 * Handle Mercado Pago subscription webhook
 */
export const subscriptionWebhook = async (req: Request, res: Response) => {
    try {
        // MP sends data in query params or body depending on the notification type
        const type = req.query.type || req.body.type;
        const dataId = req.query['data.id'] || req.body.data?.id;

        console.log('SUBSCRIPTION_WEBHOOK_RECEIVED:', { type, dataId, body: req.body, query: req.query });

        if (!type || !dataId) {
            // Just acknowledge - might be a test ping
            return res.sendStatus(200);
        }

        // Process asynchronously to respond quickly to MP
        setImmediate(() => {
            processSubscriptionWebhook(String(type), String(dataId)).catch(err => {
                console.error('Subscription webhook processing error:', err);
            });
        });

        return res.sendStatus(200);
    } catch (error) {
        console.error("Subscription webhook error:", error);
        return res.sendStatus(200); // Always return 200 to MP
    }
};

/**
 * Handle callback redirect from Mercado Pago after subscription checkout
 * Redirects to frontend with the preapproval_id
 */
export const subscriptionCallback = async (req: Request, res: Response) => {
    try {
        const preapprovalId = req.query.preapproval_id || '';
        const status = req.query.status || '';
        const clientUrl = process.env.CLIENT_URL || 'http://localhost:4200';

        // Build redirect URL with query params
        const params = new URLSearchParams();
        if (preapprovalId) params.set('preapproval_id', String(preapprovalId));
        if (status) params.set('status', String(status));

        const redirectUrl = `${clientUrl}/subscription/callback${params.toString() ? '?' + params.toString() : ''}`;

        console.log('SUBSCRIPTION_CALLBACK_REDIRECT:', { preapprovalId, status, redirectUrl });

        return res.redirect(redirectUrl);
    } catch (error) {
        console.error('Subscription callback error:', error);
        const clientUrl = process.env.CLIENT_URL || 'http://localhost:4200';
        return res.redirect(`${clientUrl}/subscription/callback?error=redirect_failed`);
    }
};

/**
 * Cancel current subscription
 */
export const cancelMySubscription = async (req: CustomRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        await cancelSubscription(userId);

        return res.json({
            message: "Suscripción cancelada. Tu plan se mantendrá activo hasta el fin del período actual.",
            success: true
        });
    } catch (error: any) {
        console.error("Error cancelling subscription:", error);
        return res.status(500).json({ message: error.message || "Error al cancelar suscripción" });
    }
};

// ============== ADMIN ENDPOINTS ==============

/**
 * Admin: Assign a plan to a user
 */
export const adminAssignPlan = async (req: CustomRequest, res: Response) => {
    try {
        const { userId, planId, durationMonths = 1 } = req.body;

        if (!userId || !planId) {
            return res.status(400).json({ message: "userId y planId son requeridos" });
        }

        const subscription = await upgradeToPlan(userId, planId, durationMonths);

        return res.json({
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
        console.error("Error assigning plan:", error);
        return res.status(500).json({ message: error.message || "Error al asignar plan" });
    }
};

/**
 * Admin: Get subscription statistics
 */
export const adminGetStats = async (req: CustomRequest, res: Response) => {
    try {
        const subscriptionRepo = AppDataSource.getRepository(UserSubscription);
        const planRepo = AppDataSource.getRepository(SubscriptionPlan);

        // Get all plans
        const plans = await planRepo.find();

        // Count subscriptions per plan
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

        // Get total commissions from PaymentLog (if we had historical data)
        // This is a placeholder - in real app would query PaymentLog

        return res.json({
            subscriptionsByPlan: stats,
            totalActiveSubscriptions: stats.reduce((sum, s) => sum + s.activeSubscriptions, 0)
        });
    } catch (error) {
        console.error("Error fetching admin stats:", error);
        return res.status(500).json({ message: "Error al obtener estadísticas" });
    }
};
