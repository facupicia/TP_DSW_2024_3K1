import { MercadoPagoConfig, PreApproval } from 'mercadopago';
import AppDataSource from '../db';
import { SubscriptionPlan } from './subscription_plan.entity';
import { UserSubscription, SubscriptionStatus } from './user_subscription.entity';
import { User } from '../user/user.entity';
import { logger } from '../common/services/logger';
import { getMPConfig, sanitizeUrl } from '../payment/mp.config';

/**
 * Subscription Core Service
 * 
 * Lógica central de procesamiento de suscripciones con MercadoPago.
 * Separa la interacción con MP de la lógica de negocio.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface SubscriptionCheckoutInput {
    userId: number;
    planId: number;
    billingType: 'monthly' | 'yearly';
}

export interface SubscriptionCheckoutResult {
    initPoint: string;
    preapprovalId: string;
}

export interface WebhookData {
    type: string;
    dataId: string;
}

// ============================================================================
// MERCADOPAGO CLIENT
// ============================================================================

/**
 * Obtiene el cliente de MP para suscripciones
 * Usa MP_ACCESS_TOKEN_SUSCRIPCION si está disponible, sino el default
 */
export function getSubscriptionMPClient(): MercadoPagoConfig {
    const config = getMPConfig();
    const token = config.subscriptionAccessToken || config.accessToken;
    return new MercadoPagoConfig({ accessToken: token });
}

// ============================================================================
// CHECKOUT CREATION
// ============================================================================

/**
 * Valida que se pueda crear un checkout de suscripción
 */
export async function validateCheckoutInput(
    input: SubscriptionCheckoutInput
): Promise<{ valid: boolean; error?: string }> {
    const { userId, planId, billingType } = input;
    
    if (!userId) {
        return { valid: false, error: 'Usuario no autorizado' };
    }
    
    if (!planId || isNaN(planId)) {
        return { valid: false, error: 'Plan ID inválido' };
    }
    
    if (billingType !== 'monthly' && billingType !== 'yearly') {
        return { valid: false, error: "billingType debe ser 'monthly' o 'yearly'" };
    }
    
    const planRepo = AppDataSource.getRepository(SubscriptionPlan);
    const plan = await planRepo.findOne({ where: { id: planId, active: true } });
    
    if (!plan) {
        return { valid: false, error: 'Plan no encontrado o inactivo' };
    }
    
    if (plan.monthlyPrice <= 0) {
        return { valid: false, error: 'Este plan es gratuito, no requiere pago' };
    }
    
    const userRepo = AppDataSource.getRepository(User);
    const user = await userRepo.findOne({ where: { id: userId } });
    
    if (!user) {
        return { valid: false, error: 'Usuario no encontrado' };
    }
    
    return { valid: true };
}

/**
 * Calcula el precio basado en el tipo de facturación
 */
export function calculateSubscriptionPrice(
    plan: SubscriptionPlan,
    billingType: 'monthly' | 'yearly'
): number {
    if (billingType === 'yearly' && plan.yearlyPrice && plan.yearlyPrice > 0) {
        return Number(plan.yearlyPrice);
    }
    return Number(plan.monthlyPrice);
}

/**
 * Crea un checkout de suscripción en MercadoPago
 */
export async function createSubscriptionCheckout(
    input: SubscriptionCheckoutInput
): Promise<SubscriptionCheckoutResult> {
    const validation = await validateCheckoutInput(input);
    if (!validation.valid) {
        throw new Error(validation.error);
    }
    
    const { userId, planId, billingType } = input;
    
    const planRepo = AppDataSource.getRepository(SubscriptionPlan);
    const userRepo = AppDataSource.getRepository(User);
    
    const plan = await planRepo.findOneOrFail({ where: { id: planId } });
    const user = await userRepo.findOneOrFail({ where: { id: userId } });
    
    const client = getSubscriptionMPClient();
    const preApproval = new PreApproval(client);
    
    const price = calculateSubscriptionPrice(plan, billingType);
    const config = getMPConfig();
    
    try {
        // Using 'as any' porque MP SDK types pueden no incluir todos los campos válidos
        const response = await preApproval.create({
            body: {
                reason: `EventLife ${plan.displayName || plan.name} - ${billingType === 'yearly' ? 'Anual' : 'Mensual'}`,
                auto_recurring: {
                    frequency: 1,
                    frequency_type: 'months',
                    transaction_amount: price,
                    currency_id: 'ARS'
                },
                back_url: `${sanitizeUrl(config.subscriptionBackUrl)}/api/subscription/callback`,
                payer_email: user.email,
                status: 'pending',
                external_reference: `SUB|${userId}|${planId}|${billingType}`
            } as any
        });
        
        if (!response.init_point || !response.id) {
            throw new Error('MercadoPago no devolvió URL de checkout');
        }
        
        logger.info('SUBSCRIPTION_CHECKOUT_CREATED', {
            userId,
            planId,
            billingType,
            preapprovalId: response.id,
            amount: price
        });
        
        return {
            initPoint: response.init_point!,
            preapprovalId: response.id
        };
        
    } catch (error: any) {
        logger.error('SUBSCRIPTION_CHECKOUT_ERROR', {
            userId,
            planId,
            billingType,
            error: error?.message
        });
        throw new Error(`Error al crear checkout de suscripción: ${error?.message}`);
    }
}

// ============================================================================
// WEBHOOK PROCESSING
// ============================================================================

const VALID_SUBSCRIPTION_TYPES = ['preapproval', 'subscription_preapproval'];

/**
 * Valida si el tipo de webhook es de suscripción
 */
export function isValidSubscriptionWebhook(type: string): boolean {
    return VALID_SUBSCRIPTION_TYPES.includes(type);
}

/**
 * Parsea la referencia externa de suscripción
 * Formato: SUB|userId|planId|billingType
 */
export function parseSubscriptionExternalRef(
    externalRef: string
): { userId: number; planId: number; billingType: 'monthly' | 'yearly' } | null {
    const parts = externalRef.split('|');
    
    if (parts.length < 4 || parts[0] !== 'SUB') {
        logger.error('SUBSCRIPTION_INVALID_EXTERNAL_REF', { externalRef });
        return null;
    }
    
    const userId = Number(parts[1]);
    const planId = Number(parts[2]);
    const billingType = parts[3] as 'monthly' | 'yearly';
    
    if (!userId || !planId || !['monthly', 'yearly'].includes(billingType)) {
        logger.error('SUBSCRIPTION_PARSE_ERROR', { externalRef, userId, planId, billingType });
        return null;
    }
    
    return { userId, planId, billingType };
}

/**
 * Calcula la fecha de fin del período
 */
export function calculatePeriodEnd(
    startDate: Date,
    billingType: 'monthly' | 'yearly',
    nextPaymentDate?: Date | null
): Date {
    // Si MP envía next_payment_date, usarla
    if (nextPaymentDate) {
        return new Date(nextPaymentDate);
    }
    
    // Fallback: calcular manualmente
    const endDate = new Date(startDate);
    if (billingType === 'yearly') {
        endDate.setFullYear(endDate.getFullYear() + 1);
    } else {
        endDate.setMonth(endDate.getMonth() + 1);
    }
    return endDate;
}

/**
 * Activa una suscripción para un usuario
 */
export async function activateSubscription(
    userId: number,
    planId: number,
    externalSubscriptionId: string,
    billingType: 'monthly' | 'yearly',
    nextPaymentDate?: Date | null
): Promise<UserSubscription> {
    const subscriptionRepo = AppDataSource.getRepository(UserSubscription);
    const planRepo = AppDataSource.getRepository(SubscriptionPlan);
    
    const plan = await planRepo.findOne({ where: { id: planId } });
    if (!plan) {
        throw new Error(`Plan not found: ${planId}`);
    }
    
    // Desactivar suscripción activa actual
    await subscriptionRepo.update(
        { userId, status: SubscriptionStatus.ACTIVE },
        { status: SubscriptionStatus.EXPIRED }
    );
    
    // Buscar si ya existe esta suscripción externa
    let userSub = await subscriptionRepo.findOne({
        where: { externalSubscriptionId }
    });
    
    const now = new Date();
    const periodEnd = calculatePeriodEnd(now, billingType, nextPaymentDate);
    
    if (userSub) {
        // Actualizar existente
        userSub.status = SubscriptionStatus.ACTIVE;
        userSub.currentPeriodEnd = periodEnd;
        userSub.planId = planId;
        userSub.currentPeriodStart = now;
    } else {
        // Crear nueva
        userSub = subscriptionRepo.create({
            userId,
            planId,
            status: SubscriptionStatus.ACTIVE,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            externalSubscriptionId
        });
    }
    
    await subscriptionRepo.save(userSub);
    
    logger.info('SUBSCRIPTION_ACTIVATED', {
        userId,
        planId,
        externalSubscriptionId,
        expiresAt: periodEnd.toISOString()
    });
    
    return userSub;
}

/**
 * Cancela una suscripción por su ID externo
 */
export async function cancelSubscriptionByExternalId(
    externalSubscriptionId: string,
    reason: string
): Promise<void> {
    const subscriptionRepo = AppDataSource.getRepository(UserSubscription);
    
    const result = await subscriptionRepo.update(
        { externalSubscriptionId },
        {
            status: SubscriptionStatus.CANCELLED,
            cancelledAt: new Date()
        }
    );
    
    if (result.affected && result.affected > 0) {
        logger.info('SUBSCRIPTION_CANCELLED', {
            externalSubscriptionId,
            reason
        });
    }
}

/**
 * Obtiene detalles de una suscripción desde MP
 */
export async function fetchSubscriptionFromMP(
    preapprovalId: string
): Promise<any | null> {
    try {
        const client = getSubscriptionMPClient();
        const preApproval = new PreApproval(client);
        
        const subscription = await preApproval.get({ id: preapprovalId });
        return subscription;
        
    } catch (error: any) {
        logger.error('SUBSCRIPTION_FETCH_ERROR', {
            preapprovalId,
            error: error?.message
        });
        return null;
    }
}

/**
 * Procesa un webhook de suscripción
 */
export async function processSubscriptionWebhook(
    type: string,
    dataId: string
): Promise<void> {
    // Validar tipo
    if (!isValidSubscriptionWebhook(type)) {
        logger.info('SUBSCRIPTION_WEBHOOK_IGNORED', { type, dataId });
        return;
    }
    
    // Obtener detalles de MP
    const subscription = await fetchSubscriptionFromMP(dataId);
    if (!subscription) {
        logger.error('SUBSCRIPTION_NOT_FOUND', { dataId });
        return;
    }
    
    const status = subscription.status;
    const externalRef = subscription.external_reference;
    
    if (!externalRef) {
        logger.error('SUBSCRIPTION_NO_EXTERNAL_REF', { dataId, status });
        return;
    }
    
    // Parsear referencia externa
    const parsedRef = parseSubscriptionExternalRef(externalRef);
    if (!parsedRef) {
        return; // Error ya logueado en parseSubscriptionExternalRef
    }
    
    const { userId, planId, billingType } = parsedRef;
    
    // Procesar según estado
    switch (status) {
        case 'authorized':
        case 'active':
            await activateSubscription(
                userId,
                planId,
                dataId,
                billingType,
                subscription.next_payment_date
            );
            break;
            
        case 'paused':
            await cancelSubscriptionByExternalId(dataId, 'subscription_paused');
            break;
            
        case 'cancelled':
            await cancelSubscriptionByExternalId(dataId, 'subscription_cancelled');
            break;
            
        case 'pending':
            logger.info('SUBSCRIPTION_PENDING', { dataId, userId, planId });
            break;
            
        default:
            logger.info('SUBSCRIPTION_UNKNOWN_STATUS', { status, dataId, userId });
    }
}

// ============================================================================
// USER SUBSCRIPTION MANAGEMENT
// ============================================================================

/**
 * Cancela una suscripción activa de un usuario
 * También cancela en MP si hay externalSubscriptionId
 */
export async function cancelUserSubscription(userId: number): Promise<void> {
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
    
    // Cancelar en MP si existe external ID
    if (activeSub.externalSubscriptionId) {
        try {
            const client = getSubscriptionMPClient();
            const preApproval = new PreApproval(client);
            
            await preApproval.update({
                id: activeSub.externalSubscriptionId,
                body: { status: 'cancelled' }
            });
            
            logger.info('SUBSCRIPTION_CANCELLED_IN_MP', {
                userId,
                externalId: activeSub.externalSubscriptionId
            });
            
        } catch (error: any) {
            logger.error('MP_CANCEL_ERROR', {
                userId,
                externalId: activeSub.externalSubscriptionId,
                error: error?.message
            });
            // Continuar con cancelación local aunque falle MP
        }
    }
    
    // Cancelar localmente
    activeSub.status = SubscriptionStatus.CANCELLED;
    activeSub.cancelledAt = new Date();
    await subscriptionRepo.save(activeSub);
    
    logger.info('SUBSCRIPTION_USER_CANCELLED', { userId });
}
