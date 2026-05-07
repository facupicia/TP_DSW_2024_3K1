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
export const createPreference = async (req: CustomRequest, res: Response) => {
    const guestBuyer = normalizeGuestBuyer(req.body?.buyer);

    try {
        const userId = req.user?.id;
        const { ticketQuantity, ticketTypeId, promoterCode, couponId, couponCode } = req.body;
        const isGuestCheckout = !userId;
        
        // Validaciones básicas
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
        
        const parsedTicketTypeId = parsePositiveInteger(ticketTypeId);
        if (!parsedTicketTypeId) {
            return res.status(400).json({ message: "ticketTypeId inválido." });
        }
        
        const quantity = parsePositiveInteger(ticketQuantity);
        if (!quantity) {
            return res.status(400).json({ message: "Cantidad inválida." });
        }

        const parsedCouponId = couponId ? parsePositiveInteger(couponId) : undefined;
        if (couponId && !parsedCouponId) {
            return res.status(400).json({ code: "COUPON_INVALID", message: "Cupón inválido." });
        }
        
        // Validar elegibilidad de compra
        const validation = await validatePurchaseEligibility({
            userId,
            ticketTypeId: parsedTicketTypeId,
            quantity,
            guestBuyer: guestBuyer || undefined
        });
        
        if (!validation.valid) {
            return res.status(validation.statusCode || 400).json({
                message: validation.error,
                code: validation.code
            });
        }
        
        // Intentar crear preferencia con token del organizador (marketplace)
        try {
            const result = await createMercadoPagoPreference({
                userId,
                ticketTypeId: parsedTicketTypeId,
                quantity,
                promoterCode,
                couponId: parsedCouponId,
                couponCode,
                guestBuyer: guestBuyer || undefined
            });
            const ticketTypeRepo = AppDataSource.getRepository(TicketType);
            const ticketType = await ticketTypeRepo.findOne({ where: { id: parsedTicketTypeId }, relations: ['event'] });
            const marketplaceInfo = ticketType
                ? await getMarketPlaceInfo(ticketType.event.user_id)
                : { commissionPercent: 8, planName: 'FREE' };
            const commissionAmount = Math.ceil((result.pricing.totalAmount * marketplaceInfo.commissionPercent) / 100);
            
            return res.status(200).json({
                id: result.id,
                init_point: result.initPoint,
                marketplace: true,
                external_reference: result.externalReference,
                guest_checkout: result.guestCheckout,
                delivery_email: result.buyerEmail,
                pricing: {
                    base_amount: result.pricing.baseAmount,
                    discount_amount: result.pricing.discountAmount,
                    total_amount: result.pricing.totalAmount,
                    coupon_id: result.pricing.couponId
                },
                commission_info: {
                    commission_percent: marketplaceInfo.commissionPercent,
                    commission_amount: commissionAmount,
                    plan_name: marketplaceInfo.planName,
                    organizer_net_amount: result.pricing.totalAmount - commissionAmount
                }
            });
            
        } catch (error: any) {
            // Si el error es que el organizador no tiene MP vinculado,
            // podríamos usar el token de la plataforma como fallback
            if (error.message === 'ORGANIZER_MP_NOT_LINKED') {
                logger.warn('PREFERENCE_USING_PLATFORM_TOKEN', {
                    userId,
                    ticketTypeId,
                    reason: 'Organizer MP not linked'
                });
                
                // Opcional: Usar token de plataforma
                // const result = await createPlatformPreference({...});
                // return res.status(200).json({...});
                
                // Por ahora, devolvemos error para forzar la vinculación
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
    const paymentId = req.query.id || req.query['data.id'] || req.body?.data?.id || req.body?.id;
    const topic = req.query.topic || req.query.type || req.body?.type;
    
    logger.info("WEBHOOK_RECEIVED", {
        paymentId: paymentId ? String(paymentId) : undefined,
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
        const lookup = await resolveWebhookPayment(String(paymentId), {
            id: String(paymentId),
            status: 'unknown',
            external_reference: req.body?.data?.external_reference || req.query.external_reference
        } as any);

        if (!lookup) {
            // Cannot resolve payment - might be a test payment or deleted organizer.
            // Return 200 so MP stops retrying; log for manual investigation.
            logger.error("WEBHOOK_PAYMENT_LOOKUP_FAILED", { paymentId: String(paymentId) });
            res.status(200).json({ received: true, warning: 'Payment lookup failed' });
            return;
        }

        const paymentData = lookup.payment.status === 'approved'
            ? lookup.payment
            : await waitForPaymentApproval(String(paymentId), lookup.client);

        if (!paymentData) {
            logger.warn("WEBHOOK_PAYMENT_NOT_APPROVED", { paymentId: String(paymentId) });
            res.status(200).json({ received: true, ignored: true });
            return;
        }

        const result = await processApprovedPayment(String(paymentId), paymentData);

        if (result.success) {
            logger.info("WEBHOOK_PAYMENT_PROCESSED", {
                paymentId: String(paymentId),
                tokenSource: lookup.source,
                organizerId: lookup.organizerId,
                ticketsCount: result.tickets?.length
            });
            res.status(200).json({ received: true });
        } else {
            // Business logic failure (e.g. no stock). Return 200 to stop MP retries,
            // but log for monitoring. Only return 500 for transient infra errors.
            logger.error("WEBHOOK_PAYMENT_FAILED", { paymentId: String(paymentId), error: result.error });
            res.status(200).json({ received: true, warning: result.error });
        }
    } catch (error: any) {
        // Transient errors (DB down, network) should return 500 so MP retries.
        // Distinguish known transient errors from logic errors.
        const isTransient = error?.code?.startsWith('ECONN') || 
                           error?.code === '23503' ||
                           error?.message?.includes('timeout') ||
                           error?.message?.includes('connection');
        
        logger.error("WEBHOOK_PROCESSING_ERROR", { 
            paymentId: String(paymentId), 
            error: error?.message,
            isTransient 
        });
        
        if (isTransient) {
            res.status(500).json({ received: false });
        } else {
            res.status(200).json({ received: true, warning: 'Processing error logged' });
        }
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
        // Solo permitir en sandbox o development
        if (env.NODE_ENV === 'production') {
            return res.status(403).json({
                success: false,
                message: 'Este endpoint solo está disponible en modo sandbox'
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
        
        const paymentLogRepo = AppDataSource.getRepository(PaymentLog);
        
        // Buscar el log de pago por external_reference
        const paymentLog = await paymentLogRepo.findOne({
            where: { externalReference: externalRef },
            order: { createdAt: 'DESC' }
        });
        
        if (!paymentLog) {
            return res.status(200).json({
                success: true,
                status: 'pending',
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
                status = 'failure';
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
