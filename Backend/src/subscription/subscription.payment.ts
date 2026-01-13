import { MercadoPagoConfig, PreApprovalPlan, PreApproval } from 'mercadopago';
import AppDataSource from "../db";
import { SubscriptionPlan } from "./subscription_plan.entity";
import { UserSubscription, SubscriptionStatus } from "./user_subscription.entity";
import { User } from "../user/user.entity";
import { logger } from "../lib/logger";

// Separate MP client for subscriptions (uses different access token)
const getSubscriptionClient = () => {
    const accessToken = process.env.MP_ACCESS_TOKEN_SUSCRIPCION;
    return new MercadoPagoConfig({ accessToken });
};

/**
 * Create a Mercado Pago checkout URL for subscription upgrade
 */
export const createSubscriptionCheckout = async (
    userId: number,
    planId: number,
    billingType: 'monthly' | 'yearly' = 'monthly'
): Promise<{ initPoint: string; preapprovalId: string }> => {
    const planRepo = AppDataSource.getRepository(SubscriptionPlan);
    const userRepo = AppDataSource.getRepository(User);

    const plan = await planRepo.findOne({ where: { id: planId, active: true } });
    if (!plan) {
        throw new Error('Plan no encontrado o inactivo');
    }

    if (plan.monthlyPrice <= 0) {
        throw new Error('Este plan es gratuito, no requiere pago');
    }

    const user = await userRepo.findOne({ where: { id: userId } });
    if (!user) {
        throw new Error('Usuario no encontrado');
    }

    const client = getSubscriptionClient();
    const preApproval = new PreApproval(client);

    // Calculate price and frequency based on billing type
    const price = billingType === 'yearly' && plan.yearlyPrice
        ? Number(plan.yearlyPrice)
        : Number(plan.monthlyPrice);

    const frequency = billingType === 'yearly' ? 12 : 1;
    const frequencyType = 'months';

    // Notification URL for webhook
    const notificationUrl = process.env.MP_NOTIFICATION_URL_SUSCRIPCION ||
        `${process.env.BACKEND_URL || 'http://localhost:3000'}/api/subscription/webhook`;

    // Back URLs - MP subscriptions require public URLs, not localhost
    const backUrl = process.env.MP_SUBSCRIPTION_BACK_URL || process.env.CLIENT_URL || 'http://localhost:4200';

    try {
        // Using 'as any' because MP SDK types may not include all valid API fields
        const response = await preApproval.create({
            body: {
                reason: `EventLife ${plan.displayName || plan.name} - ${billingType === 'yearly' ? 'Anual' : 'Mensual'}`,
                auto_recurring: {
                    frequency,
                    frequency_type: frequencyType,
                    transaction_amount: price,
                    currency_id: 'ARS'
                },
                back_url: `${backUrl}/subscription/callback`,
                payer_email: user.email,
                external_reference: `SUB|${userId}|${planId}|${billingType}`
            } as any
        });

        if (!response.init_point || !response.id) {
            throw new Error('Mercado Pago no devolvió URL de checkout');
        }

        logger.info('SUBSCRIPTION_CHECKOUT_CREATED', {
            userId,
            planId,
            preapprovalId: response.id
        });

        return {
            initPoint: response.init_point,
            preapprovalId: response.id
        };
    } catch (error: any) {
        logger.error('SUBSCRIPTION_CHECKOUT_ERROR', {
            userId,
            planId,
            error: error?.message
        });
        throw new Error(`Error al crear checkout de suscripción: ${error?.message}`);
    }
};

/**
 * Process subscription webhook from Mercado Pago
 */
export const processSubscriptionWebhook = async (
    type: string,
    dataId: string
): Promise<void> => {
    // Only process preapproval (subscription) events
    if (type !== 'preapproval') {
        logger.info('SUBSCRIPTION_WEBHOOK_IGNORED', { type, dataId });
        return;
    }

    const client = getSubscriptionClient();
    const preApproval = new PreApproval(client);

    try {
        // Get subscription details from MP
        const subscription = await preApproval.get({ id: dataId });

        if (!subscription) {
            logger.error('SUBSCRIPTION_NOT_FOUND', { dataId });
            return;
        }

        const status = subscription.status;
        const externalRef = subscription.external_reference;

        if (!externalRef) {
            logger.error('SUBSCRIPTION_NO_EXTERNAL_REF', { dataId });
            return;
        }

        // Parse external reference: SUB|userId|planId|billingType
        const parts = externalRef.split('|');
        if (parts.length < 4 || parts[0] !== 'SUB') {
            logger.error('SUBSCRIPTION_INVALID_EXTERNAL_REF', { externalRef });
            return;
        }

        const userId = Number(parts[1]);
        const planId = Number(parts[2]);
        const billingType = parts[3] as 'monthly' | 'yearly';

        if (!userId || !planId) {
            logger.error('SUBSCRIPTION_PARSE_ERROR', { externalRef });
            return;
        }

        const subscriptionRepo = AppDataSource.getRepository(UserSubscription);
        const planRepo = AppDataSource.getRepository(SubscriptionPlan);

        // Handle different MP statuses
        switch (status) {
            case 'authorized':
            case 'active':
                // Subscription approved - activate the plan
                const plan = await planRepo.findOne({ where: { id: planId } });
                if (!plan) {
                    logger.error('SUBSCRIPTION_PLAN_NOT_FOUND', { planId });
                    return;
                }

                // Deactivate any existing subscription
                await subscriptionRepo.update(
                    { userId, status: SubscriptionStatus.ACTIVE },
                    { status: SubscriptionStatus.EXPIRED }
                );

                // Calculate period end based on billing type
                const now = new Date();
                const periodEnd = new Date(now);
                periodEnd.setMonth(periodEnd.getMonth() + (billingType === 'yearly' ? 12 : 1));

                // Create or update subscription
                let userSub = await subscriptionRepo.findOne({
                    where: { externalSubscriptionId: dataId }
                });

                if (userSub) {
                    userSub.status = SubscriptionStatus.ACTIVE;
                    userSub.currentPeriodEnd = periodEnd;
                } else {
                    userSub = subscriptionRepo.create({
                        userId,
                        planId,
                        status: SubscriptionStatus.ACTIVE,
                        currentPeriodStart: now,
                        currentPeriodEnd: periodEnd,
                        externalSubscriptionId: dataId
                    });
                }

                await subscriptionRepo.save(userSub);
                logger.info('SUBSCRIPTION_ACTIVATED', { userId, planId, dataId });
                break;

            case 'paused':
            case 'cancelled':
                // Subscription cancelled - mark as cancelled but don't downgrade immediately
                await subscriptionRepo.update(
                    { externalSubscriptionId: dataId },
                    {
                        status: SubscriptionStatus.CANCELLED,
                        cancelledAt: new Date()
                    }
                );
                logger.info('SUBSCRIPTION_CANCELLED', { userId, dataId });
                break;

            case 'pending':
                // Still pending - do nothing
                logger.info('SUBSCRIPTION_PENDING', { dataId });
                break;

            default:
                logger.info('SUBSCRIPTION_UNKNOWN_STATUS', { status, dataId });
        }

    } catch (error: any) {
        logger.error('SUBSCRIPTION_WEBHOOK_ERROR', {
            dataId,
            error: error?.message
        });
    }
};

/**
 * Cancel a user's MP subscription
 */
export const cancelSubscription = async (userId: number): Promise<void> => {
    const subscriptionRepo = AppDataSource.getRepository(UserSubscription);

    const activeSub = await subscriptionRepo.findOne({
        where: { userId, status: SubscriptionStatus.ACTIVE },
        relations: ['plan']
    });

    if (!activeSub) {
        throw new Error('No tienes una suscripción activa');
    }

    if (activeSub.plan.monthlyPrice <= 0) {
        throw new Error('No puedes cancelar el plan gratuito');
    }

    // If we have an external subscription ID, cancel in MP too
    if (activeSub.externalSubscriptionId) {
        try {
            const client = getSubscriptionClient();
            const preApproval = new PreApproval(client);

            await preApproval.update({
                id: activeSub.externalSubscriptionId,
                body: { status: 'cancelled' }
            });
        } catch (error: any) {
            logger.error('MP_CANCEL_ERROR', {
                userId,
                error: error?.message
            });
            // Continue with local cancellation even if MP fails
        }
    }

    // Mark as cancelled locally
    activeSub.status = SubscriptionStatus.CANCELLED;
    activeSub.cancelledAt = new Date();
    await subscriptionRepo.save(activeSub);

    logger.info('SUBSCRIPTION_USER_CANCELLED', { userId });
};
