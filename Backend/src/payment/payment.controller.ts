import { Response } from "express";
import { CustomRequest } from "../common/middleware/authToken";
import { logger } from "../common/services/logger";
import AppDataSource from "../db";
import { PaymentLog, PaymentStatus } from "./payment.entity";
import { TicketType } from "../ticketType/ticketType.entity";
import { 
    validatePurchaseEligibility,
    createMercadoPagoPreference,
    createPlatformPreference 
} from "./preference.service";
import { 
    processApprovedPayment,
    waitForPaymentApproval,
    getPlatformMPClient 
} from "./payment.core";

/**
 * Payment Controller
 * 
 * Controlador refactorizado que delega la lógica de negocio a servicios especializados.
 * Mantiene solo la responsabilidad de manejar HTTP requests/responses.
 */

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
    try {
        const userId = req.user?.id;
        const { ticketQuantity, ticketTypeId, promoterCode } = req.body;
        
        // Validaciones básicas
        if (!userId) {
            return res.status(401).json({ message: "No autorizado." });
        }
        
        if (!ticketTypeId) {
            return res.status(400).json({ message: "Falta ticketTypeId." });
        }
        
        const quantity = parseInt(ticketQuantity);
        if (isNaN(quantity) || quantity <= 0) {
            return res.status(400).json({ message: "Cantidad inválida." });
        }
        
        // Validar elegibilidad de compra
        const validation = await validatePurchaseEligibility({
            userId,
            ticketTypeId: parseInt(ticketTypeId),
            quantity
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
                ticketTypeId: parseInt(ticketTypeId),
                quantity,
                promoterCode
            });
            
            // Calcular desglose de precios para el frontend
            const ticketTypeRepo = AppDataSource.getRepository(TicketType);
            const ticketType = await ticketTypeRepo.findOne({
                where: { id: parseInt(ticketTypeId) }
            });
            
            const baseAmount = ticketType ? Number(ticketType.price) * quantity : 0;
            const serviceFeePercent = Number(process.env.PLATFORM_SERVICE_FEE_PERCENT || 10);
            const serviceFeeAmount = (baseAmount * serviceFeePercent) / 100;
            const totalAmount = baseAmount + serviceFeeAmount;
            
            return res.status(200).json({
                id: result.id,
                init_point: result.initPoint,
                marketplace: true,
                pricing: {
                    base_amount: baseAmount,
                    service_fee_percent: serviceFeePercent,
                    service_fee_amount: serviceFeeAmount,
                    total_amount: totalAmount
                },
                commission_info: {
                    organizer_net_amount: baseAmount
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
            
            throw error;
        }
        
    } catch (error: any) {
        logger.error("ERROR_CREATING_PREFERENCE", { 
            error: error?.message,
            userId: req.user?.id 
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
 * Responde inmediatamente 200 OK y procesa asíncronamente.
 */
export const paymentWebhook = async (req: CustomRequest, res: Response) => {
    const paymentId = req.query.id || req.query['data.id'] || req.body?.data?.id || req.body?.id;
    const topic = req.query.topic || req.query.type || req.body?.type;
    
    logger.info("WEBHOOK_RECEIVED", { paymentId, topic, query: req.query, body: req.body });
    
    // Siempre responder 200 OK inmediatamente
    res.status(200).json({ received: true });
    
    // Procesar solo si es un pago
    const isPayment = topic === 'payment' || req.body?.type === 'payment';
    
    if (!paymentId || !isPayment) {
        logger.info("WEBHOOK_IGNORED", { reason: 'Not a payment', topic });
        return;
    }
    
    // Procesar asíncronamente
    setImmediate(async () => {
        try {
            const paymentData = await waitForPaymentApproval(String(paymentId), getPlatformMPClient());
            
            if (!paymentData) {
                logger.warn("WEBHOOK_PAYMENT_NOT_APPROVED", { paymentId });
                return;
            }
            
            const result = await processApprovedPayment(String(paymentId), paymentData);
            
            if (result.success) {
                logger.info("WEBHOOK_PAYMENT_PROCESSED", {
                    paymentId,
                    ticketsCount: result.tickets?.length
                });
            } else {
                logger.error("WEBHOOK_PAYMENT_FAILED", { paymentId, error: result.error });
            }
        } catch (error: any) {
            logger.error("WEBHOOK_PROCESSING_ERROR", { paymentId, error: error?.message });
        }
    });
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
        if (process.env.NODE_ENV === 'production' && !process.env.MP_FORCE_SANDBOX_MODE) {
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
            status,
            paymentLogId: paymentLog.id,
            createdAt: paymentLog.createdAt
        });
        
    } catch (error: any) {
        logger.error("GET_PAYMENT_STATUS_ERROR", { error: error?.message });
        return res.status(500).json({
            success: false,
            message: "Error al verificar estado del pago"
        });
    }
};
