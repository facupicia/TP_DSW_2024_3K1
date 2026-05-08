import { MercadoPagoConfig, PreApprovalPlan, PreApproval } from 'mercadopago';
import AppDataSource from "../db";
import { SubscriptionPlan } from "./subscription_plan.entity";
import { UserSubscription, SubscriptionStatus } from "./user_subscription.entity";
import { User } from "../user/user.entity";
import { logger } from "../common/services/logger";
import { getMPConfig } from "../payment/mp.config";
import { env } from "../config/env";

// Separate MP client for subscriptions (uses different access token)
const getSubscriptionClient = () => {
    const config = getMPConfig();
    if (!config.subscriptionAccessToken) {
        throw new Error('MP_ACCESS_TOKEN_SUSCRIPCION is required for subscription payments');
    }

    return new MercadoPagoConfig({ accessToken: config.subscriptionAccessToken });
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



    // Back URL for redirect after payment
    const backendUrl = env.MP_SUBSCRIPTION_BACK_URL || env.BACKEND_URL || 'http://localhost:3000';

    try {
        // Using 'as any' because MP SDK types may not include all valid API fields
        const response = await preApproval.create({
            body: {
                reason: `EventLife ${plan.displayName || plan.name} - ${billingType === 'yearly' ? 'Anual' : 'Mensual'}`,
                auto_recurring: {
                    frequency: 1,
                    frequency_type: 'months',
                    transaction_amount: price,
                    currency_id: 'ARS'
                },
                back_url: `${backendUrl}/api/subscription/callback`,
                payer_email: user.email,
                status: 'pending',
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
    // 1. Validar que el evento sea de suscripción (Preapproval)
    const validTypes = ['preapproval', 'subscription_preapproval'];
    if (!validTypes.includes(type)) {
        logger.info('SUBSCRIPTION_WEBHOOK_IGNORED', { type, dataId });
        return;
    }

    const client = getSubscriptionClient();
    const preApproval = new PreApproval(client);

    try {
        // 2. Obtener los detalles actualizados directamente desde la API de Mercado Pago
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

        // 3. Parsear la referencia externa: SUB|userId|planId|billingType
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

        // 4. Manejo de estados de Mercado Pago
        switch (status) {
            case 'authorized':
            case 'active':
                // --- PROCESO DE ACTIVACIÓN ---
                const plan = await planRepo.findOne({ where: { id: planId } });
                if (!plan) {
                    logger.error('SUBSCRIPTION_PLAN_NOT_FOUND', { planId });
                    return;
                }

                // Desactivar cualquier suscripción previa que tenga el usuario
                await subscriptionRepo.update(
                    { userId, status: SubscriptionStatus.ACTIVE },
                    { status: SubscriptionStatus.EXPIRED }
                );

                // Cálculo de fechas
                const now = new Date();

                // Fallback manual en caso de que MP no envíe next_payment_date
                const fallbackDate = new Date(now);
                fallbackDate.setMonth(fallbackDate.getMonth() + (billingType === 'yearly' ? 12 : 1));

                // Prioridad: 1. next_payment_date de MP | 2. Cálculo manual
                const periodEnd = subscription.next_payment_date
                    ? new Date(subscription.next_payment_date)
                    : fallbackDate;

                // Buscar si ya existe el registro de esta suscripción externa
                let userSub = await subscriptionRepo.findOne({
                    where: { externalSubscriptionId: dataId }
                });

                if (userSub) {
                    userSub.status = SubscriptionStatus.ACTIVE;
                    userSub.currentPeriodEnd = periodEnd;
                    userSub.planId = planId; // Por si cambió de plan
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
                logger.info('SUBSCRIPTION_ACTIVATED', {
                    userId,
                    dataId,
                    expiresAt: periodEnd.toISOString()
                });
                break;

            case 'paused':
            case 'cancelled':
                // Marcar como cancelada (el usuario mantiene acceso hasta currentPeriodEnd normalmente)
                await subscriptionRepo.update(
                    { externalSubscriptionId: dataId },
                    {
                        status: SubscriptionStatus.CANCELLED,
                        cancelledAt: new Date()
                    }
                );
                logger.info('SUBSCRIPTION_CANCELLED_OR_PAUSED', { userId, dataId, status });
                break;

            case 'pending':
                logger.info('SUBSCRIPTION_PENDING', { dataId });
                break;

            default:
                logger.info('SUBSCRIPTION_UNKNOWN_STATUS', { status, dataId });
        }

    } catch (error: any) {
        logger.error('SUBSCRIPTION_WEBHOOK_ERROR', {
            dataId,
            error: error?.message,
            stack: error?.stack
        });
        // IMPORTANTE: Aquí podrías lanzar el error si quieres que MP reintente el webhook,
        // pero ten cuidado de no crear bucles infinitos si es un error de código.
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
