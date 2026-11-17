import { enqueueOutbox } from '../queue/outbox.service';
import { CheckoutOrder } from './checkout-order.entity';
import { createHash, timingSafeEqual } from 'crypto';
import { Response } from "express";
import { CustomRequest } from "../common/middleware/authToken";
import { logger } from "../common/services/logger";
import { env } from "../config/env";
import AppDataSource from "../db";
import { PaymentLog, PaymentStatus } from "./payment.entity";
import { TicketType } from "../ticketType/ticketType.entity";
import { Ticket } from "../ticket/ticket.entity";
import { 
    validatePurchaseEligibility,
    createMercadoPagoPreference,
    createPlatformPreference,
    getMarketPlaceInfo
} from "./preference.service";
import { 
    processApprovedPayment,
    waitForPaymentApproval,
    resolveWebhookPayment
} from "./payment.core";

/**
 * Payment Controller
 * 
 * Controlador refactorizado que delega la lógica de negocio a servicios especializados.
 * Mantiene solo la responsabilidad de manejar HTTP requests/responses.
 */

interface GuestBuyerPayload {
    firstname: string;
    lastname: string;
    email: string;
    phone: string;
    birth?: string;
}

function normalizeGuestBuyer(rawBuyer: any): GuestBuyerPayload | null {
    if (!rawBuyer || typeof rawBuyer !== "object") {
        return null;
    }

    const normalized: GuestBuyerPayload = {
        firstname: String(rawBuyer.firstname || "").trim(),
        lastname: String(rawBuyer.lastname || "").trim(),
        email: String(rawBuyer.email || "").trim().toLowerCase(),
        phone: String(rawBuyer.phone || "").trim()
    };

    if (rawBuyer.birth) {
        normalized.birth = String(rawBuyer.birth).trim();
    }

    return normalized;
}

function parsePositiveInteger(value: unknown): number | null {
    if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
        return value;
    }

    if (typeof value === "string" && /^[1-9]\d*$/.test(value.trim())) {
        const parsed = Number(value.trim());
        return Number.isSafeInteger(parsed) ? parsed : null;
    }

    return null;
}

function isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// ============================================================================
// PREFERENCE CREATION
// ============================================================================

/**
 * POST /api/payment/create-preference
 * 
 * Crea una preferencia de MercadoPago para la compra de tickets.
 * En el modelo marketplace, usa el token del organizador.
 */
function validateCartItems(rawItems: any): { valid: boolean; items?: Array<{ ticketTypeId: number; quantity: number }>; error?: string } {
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
        return { valid: false, error: 'Debes enviar un array de items (ticketTypeId + quantity).' };
    }
    const items: Array<{ ticketTypeId: number; quantity: number }> = [];
    for (const raw of rawItems) {
        const ticketTypeId = parsePositiveInteger(raw?.ticketTypeId);
        const quantity = parsePositiveInteger(raw?.quantity);
        if (!ticketTypeId || !quantity) {
            return { valid: false, error: 'Cada item debe tener ticketTypeId y quantity válidos.' };
        }
        if (quantity > 10) {
            return { valid: false, error: 'No puedes comprar más de 10 unidades por tipo de ticket.' };
        }
        items.push({ ticketTypeId, quantity });
    }
    return { valid: true, items };
}

function validateExtraItems(rawExtras: any): { valid: boolean; extraItems?: Array<{ eventProductId: number; quantity: number }>; error?: string } {
    if (!rawExtras) return { valid: true, extraItems: [] };
    if (!Array.isArray(rawExtras)) {
        return { valid: false, error: 'extraItems debe ser un array.' };
    }
    const extraItems: Array<{ eventProductId: number; quantity: number }> = [];
    for (const raw of rawExtras) {
        const eventProductId = parsePositiveInteger(raw?.eventProductId);
        const quantity = parsePositiveInteger(raw?.quantity);
        if (!eventProductId || !quantity) {
            return { valid: false, error: 'Cada extra debe tener eventProductId y quantity válidos.' };
        }
        if (quantity > 10) {
            return { valid: false, error: 'No puedes comprar más de 10 unidades por extra.' };
        }
        extraItems.push({ eventProductId, quantity });
    }
    return { valid: true, extraItems };
}

export const createPreference = async (req: CustomRequest, res: Response) => {
    const guestBuyer = normalizeGuestBuyer(req.body?.buyer);

    try {
        const userId = req.user?.id;
        const { items: rawItems, extraItems: rawExtras, promoterCode, couponId, couponCode } = req.body;
        const isGuestCheckout = !userId;

        if (isGuestCheckout) {
            if (!guestBuyer?.firstname || !guestBuyer?.lastname || !guestBuyer?.email || !guestBuyer?.phone) {
                return res.status(400).json({
                    code: "GUEST_BUYER_REQUIRED",
                    message: "Completa nombre, apellido, email y teléfono para continuar."
                });
            }

            if (!isValidEmail(guestBuyer.email)) {
                return res.status(400).json({
                    code: "GUEST_EMAIL_INVALID",
                    message: "El email del comprador no es válido."
                });
            }
        }

        const cartValidation = validateCartItems(rawItems);
        if (!cartValidation.valid) {
            return res.status(400).json({ message: cartValidation.error });
        }
        const items = cartValidation.items!;

        const extraValidation = validateExtraItems(rawExtras);
        if (!extraValidation.valid) {
            return res.status(400).json({ message: extraValidation.error });
        }
        const extraItems = extraValidation.extraItems!;

        const parsedCouponId = couponId ? parsePositiveInteger(couponId) : undefined;
        if (couponId && !parsedCouponId) {
            return res.status(400).json({ code: "COUPON_INVALID", message: "Cupón inválido." });
        }

        const validation = await validatePurchaseEligibility({
            userId,
            items,
            extraItems,
            guestBuyer: guestBuyer || undefined
        });

        if (!validation.valid) {
            return res.status(validation.statusCode || 400).json({
                message: validation.error,
                code: validation.code
            });
        }

        try {
            const createCheckout = env.MP_MODE === 'sandbox' ? createPlatformPreference : createMercadoPagoPreference;
            const result = await createCheckout({
                userId,
                items,
                extraItems,
                promoterCode,
                couponId: parsedCouponId,
                couponCode,
                guestBuyer: guestBuyer || undefined
            });
            const ticketTypeRepo = AppDataSource.getRepository(TicketType);
            const firstTicketType = await ticketTypeRepo.findOne({ where: { id: items[0].ticketTypeId }, relations: ['event'] });
            const marketplaceInfo = firstTicketType
                ? await getMarketPlaceInfo(firstTicketType.event.user_id)
                : { commissionPercent: 8, serviceFeePercent: 12, minimumServiceFee: 0, planName: 'FREE' };
            const commissionAmount = Math.ceil((result.pricing.totalAmount * marketplaceInfo.commissionPercent) / 100);

            return res.status(200).json({
                id: result.id,
                init_point: result.initPoint,
                marketplace: env.MP_MODE !== 'sandbox',
                test_mode: env.MP_MODE === 'sandbox',
                external_reference: result.externalReference,
                guest_checkout: result.guestCheckout,
                status_token: result.statusToken,
                delivery_email: result.buyerEmail,
                pricing: {
                    base_amount: result.pricing.baseAmount,
                    discount_amount: result.pricing.discountAmount,
                    total_amount: result.pricing.totalAmount,
                    service_fee_percent: result.pricing.serviceFeePercent,
                    service_fee_amount: result.pricing.serviceFeeAmount,
                    buyer_total_amount: result.pricing.buyerTotalAmount,
                    coupon_id: result.pricing.couponId
                },
                commission_info: {
                    commission_percent: marketplaceInfo.commissionPercent,
                    commission_amount: commissionAmount,
                    plan_name: marketplaceInfo.planName,
                    organizer_net_amount: result.pricing.totalAmount
                }
            });

        } catch (error: any) {
            if (error.message === 'PLAN_LIMIT_EXTRAS') return res.status(403).json({ code: 'PLAN_LIMIT_EXTRAS', message: 'El plan del organizador no permite vender extras.' });
            if (['INVALID_CART', 'CART_TOO_LARGE_FOR_MP'].includes(error.message)) return res.status(400).json({ code: 'INVALID_CART', message: 'El carrito supera los límites admitidos o contiene artículos inválidos.' });
            if (error.message === 'ORGANIZER_MP_NOT_LINKED') {
                logger.warn('PREFERENCE_USING_PLATFORM_TOKEN', {
                    userId,
                    items,
                    reason: 'Organizer MP not linked'
                });

                return res.status(400).json({
                    code: 'ORGANIZER_MP_NOT_LINKED',
                    message: 'El organizador de este evento no tiene asociada su cuenta de Mercado Pago. No es posible procesar el pago.'
                });
            }

            if (error.message === 'GUEST_EMAIL_ALREADY_REGISTERED') {
                return res.status(409).json({
                    code: 'GUEST_EMAIL_ALREADY_REGISTERED',
                    message: 'Este email ya está registrado. Iniciá sesión para comprar.'
                });
            }

            if (['COUPON_INVALID', 'COUPON_EXPIRED', 'COUPON_EXHAUSTED'].includes(error.message)) {
                return res.status(400).json({
                    code: error.message,
                    message: error.message === 'COUPON_EXPIRED'
                        ? 'El cupón expiró.'
                        : error.message === 'COUPON_EXHAUSTED'
                            ? 'El cupón ya no tiene usos disponibles.'
                            : 'El cupón no es válido para este evento.'
                });
            }

            if (error.message === 'ZERO_AMOUNT_NOT_SUPPORTED') {
                return res.status(400).json({
                    code: 'ZERO_AMOUNT_NOT_SUPPORTED',
                    message: 'No se pueden procesar pagos de $0. Para entradas gratuitas usá el sistema de invitaciones.'
                });
            }

            if (error.message === 'NO_STOCK') {
                return res.status(409).json({
                    code: 'NO_STOCK',
                    message: 'Las entradas se agotaron mientras preparábamos tu compra.'
                });
            }

            if (error.message === 'NO_EXTRA_STOCK') {
                return res.status(409).json({
                    code: 'NO_EXTRA_STOCK',
                    message: 'Los extras se agotaron mientras preparábamos tu compra.'
                });
            }

            if (error.message === 'EXTRA_NOT_FOUND') {
                return res.status(404).json({
                    code: 'EXTRA_NOT_FOUND',
                    message: 'Uno de los extras no existe.'
                });
            }

            if (error.message === 'EXTRA_INACTIVE') {
                return res.status(400).json({
                    code: 'EXTRA_INACTIVE',
                    message: 'Uno de los extras no está disponible.'
                });
            }

            if (error.message === 'EXTRA_MAX_PER_ORDER') {
                return res.status(400).json({
                    code: 'EXTRA_MAX_PER_ORDER',
                    message: 'Superaste el límite máximo por orden para uno de los extras.'
                });
            }

            if (error.message === 'EVENT_STARTED') {
                return res.status(400).json({
                    code: 'EVENT_STARTED',
                    message: 'El evento ya comenzó. No se pueden comprar más entradas.'
                });
            }

            if (error.message === 'TICKET_TYPE_INACTIVE') {
                return res.status(400).json({
                    code: 'TICKET_TYPE_INACTIVE',
                    message: 'Este tipo de entrada no está disponible.'
                });
            }

            if (error.message === 'MULTIPLE_EVENTS') {
                return res.status(400).json({
                    code: 'MULTIPLE_EVENTS',
                    message: 'Todos los tickets deben ser del mismo evento.'
                });
            }

            throw error;
        }

    } catch (error: any) {
        logger.error("ERROR_CREATING_PREFERENCE", {
            error: error?.message,
            userId: req.user?.id,
            guestEmail: guestBuyer?.email
        });

        return res.status(500).json({
            message: "Error al generar preferencia de pago",
            code: 'INTERNAL_ERROR'
        });
    }
};

// ============================================================================
// WEBHOOK HANDLING
// ============================================================================

/**
 * POST/GET /api/payment/webhook
 * 
 * Recibe notificaciones de MercadoPago sobre pagos.
 * Procesa la notificación antes de confirmar para que MP pueda reintentar ante fallos.
 */
export const paymentWebhook = async (req: CustomRequest, res: Response) => {
    const paymentId = req.paymentId;
    const topic = req.query.topic || req.query.type || req.body?.type;
    
    logger.info("WEBHOOK_RECEIVED", {
        paymentId,
        topic,
        hasBody: !!req.body,
        queryKeys: Object.keys(req.query || {})
    });
    
    // Procesar solo si es un pago
    const isPayment = topic === 'payment' || req.body?.type === 'payment';
    
    if (!paymentId || !isPayment) {
        logger.info("WEBHOOK_IGNORED", { reason: 'Not a payment', topic });
        res.status(200).json({ received: true, ignored: true });
        return;
    }
    
    try {
        // Signed notification acknowledged only once durably persisted.
        const identity = req.body?.id || req.body?.date_created || req.headers?.['x-request-id'] || req.headers?.['x-signature'] || req.body?.action || 'initial';
        const notificationKey = createHash('sha256').update(JSON.stringify([paymentId, identity])).digest('hex');
        await enqueueOutbox(AppDataSource.manager, 'payment-'+notificationKey, 'payment', {
            paymentId: String(paymentId), externalReference: req.body?.data?.external_reference || req.query.external_reference || '',
            mpUserId: req.body?.user_id ? String(req.body.user_id).slice(0,30) : undefined
        });
        res.status(200).json({ received: true });
    } catch (error) {
        logger.error('WEBHOOK_PERSISTENCE_ERROR', { error: (error as Error).message });
        res.status(503).json({ received: false });
    }
};

// ============================================================================
// TEST WEBHOOK (Development/Sandbox only)
// ============================================================================

/**
 * POST /api/payment/test-webhook
 * 
 * Simula un webhook de pago para testing.
 * Solo disponible en modo sandbox/development.
 */
export const simulatePaymentWebhook = async (req: CustomRequest, res: Response) => {
    try {
        // Solo permitir en development
        if (env.NODE_ENV !== 'development') {
            return res.status(403).json({
                success: false,
                message: 'Este endpoint solo está disponible en modo development'
            });
        }
        
        const { paymentId, externalReference } = req.body;
        
        if (!paymentId) {
            return res.status(400).json({
                success: false,
                message: 'paymentId requerido'
            });
        }
        
        logger.info('TEST_WEBHOOK_SIMULATION', { paymentId, externalReference });
        
        // Simular datos de pago aprobado
        const mockPaymentData: any = {
            id: paymentId,
            status: 'approved',
            external_reference: externalReference || 'TEST_REF',
            transaction_amount: 1000,
            metadata: {},
            additional_info: {}
        };
        
        // Procesar el pago
        const result = await processApprovedPayment(paymentId, mockPaymentData);
        
        if (result.success) {
            logger.info('TEST_WEBHOOK_SUCCESS', {
                paymentId,
                ticketsCreated: result.tickets?.length,
                logId: result.logId
            });
            
            return res.json({
                success: true,
                message: 'Pago procesado correctamente (simulación)',
                ticketsCreated: result.tickets?.length,
                logId: result.logId
            });
        } else {
            logger.error('TEST_WEBHOOK_FAILED', { paymentId, error: result.error });
            
            return res.status(400).json({
                success: false,
                message: result.error || 'Error al procesar pago',
                logId: result.logId
            });
        }
        
    } catch (error: any) {
        logger.error('TEST_WEBHOOK_ERROR', { error: error?.message });
        return res.status(500).json({
            success: false,
            message: error.message || 'Error interno'
        });
    }
};

// ============================================================================
// PAYMENT STATUS
// ============================================================================

/**
 * GET /api/payment/status
 * 
 * Verifica el estado de un pago por external_reference.
 * Usado por el frontend para polling después del checkout.
 */
export const getPaymentStatus = async (req: CustomRequest, res: Response) => {
    try {
        const externalRef = req.query.external_reference as string;
        
        if (!externalRef) {
            return res.status(400).json({
                success: false,
                message: "external_reference requerido"
            });
        }

        if (externalRef.length > 160 || !/^[A-Za-z0-9._|:-]+$/.test(externalRef)) {
            return res.status(400).json({
                success: false,
                message: "external_reference inválido"
            });
        }

        const order = await AppDataSource.getRepository(CheckoutOrder).createQueryBuilder('o').addSelect('o.statusTokenHash')
            .where('o.externalReference=:ref',{ref:externalRef}).getOne();
        const bearer = req.header('X-Checkout-Token') || '';
        const digest = createHash('sha256').update(bearer).digest('hex');
        const authorized = order && (req.user?.id === order.userId || (bearer.length >= 32 && order.expiresAt > new Date() &&
            timingSafeEqual(Buffer.from(digest), Buffer.from(order.statusTokenHash))));
        if (!authorized) return res.status(403).json({ success: false, message: 'No autorizado para consultar esta compra' });
        const paymentLogRepo = AppDataSource.getRepository(PaymentLog);
        
        // Buscar el log de pago por external_reference
        let paymentLog = order.snapshot.fulfilledPaymentId ? await paymentLogRepo.findOne({
            where: { externalReference: externalRef, mpPaymentId: String(order.snapshot.fulfilledPaymentId) }
        }) : await paymentLogRepo.findOne({ where: { externalReference: externalRef, status: PaymentStatus.COMPLETED }, order: { createdAt: 'DESC' } });
        if (!paymentLog) paymentLog = await paymentLogRepo.findOne({
            where: { externalReference: externalRef },
            order: { createdAt: 'DESC' }
        });
        
        if (!paymentLog) {
            return res.status(200).json({
                success: true,
                status: order.status,
                message: "Pago aún no procesado"
            });
        }

        // Mapear estado interno a estado del frontend
        let status: string;
        switch (paymentLog.status) {
            case PaymentStatus.COMPLETED:
                status = 'approved';
                break;
            case PaymentStatus.FAILED:
            case PaymentStatus.CHARGED_BACK:
                status = 'failure';
                break;
            case PaymentStatus.REFUNDED:
                status = 'refunded';
                break;
            case PaymentStatus.PROCESSING:
                status = 'processing';
                break;
            default:
                status = 'pending';
        }
        
        return res.status(200).json({
            success: true,
            status
        });
        
    } catch (error: any) {
        logger.error("GET_PAYMENT_STATUS_ERROR", { error: error?.message });
        return res.status(500).json({
            success: false,
            message: "Error al verificar estado del pago"
        });
    }
};
