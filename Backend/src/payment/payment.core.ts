import { MercadoPagoConfig, Payment, Preference } from 'mercadopago';
import AppDataSource from '../db';
import { PaymentLog, PaymentStatus } from './payment.entity';
import { User } from '../user/user.entity';
import { TicketType } from '../ticketType/ticketType.entity';
import { Ticket } from '../ticket/ticket.entity';
import { getActiveSubscription } from '../subscription/subscription.service';
import { createTicketsForPurchase, sendTicketEmail } from '../ticket/ticket.service';
import { logger } from '../common/services/logger';
import { getMPConfig } from './mp.config';
import { decryptFromString } from '../common/services/encryption';

/**
 * Payment Core Service
 * 
 * Lógica central de procesamiento de pagos, separada del controlador.
 * Esta capa maneja la interacción con MercadoPago y la persistencia.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface PaymentData {
    id: string;
    status: string;
    external_reference?: string;
    metadata?: Record<string, any>;
    additional_info?: {
        items?: Array<{ id?: string; quantity?: number }>;
    };
    transaction_amount?: number;
}

export interface ExtractedPaymentInfo {
    userId: number;
    ticketTypeId: number;
    quantity: number;
    organizerId: number;
    isQR?: boolean; // Indica si es pago por QR
}

export interface CommissionInfo {
    percent: number;
    amount: number;
    planName: string;
}

export interface PaymentResult {
    success: boolean;
    tickets?: Ticket[];
    error?: string;
    logId?: number;
}

// ============================================================================
// MERCADOPAGO CLIENTS
// ============================================================================

/**
 * Obtiene el cliente de MercadoPago con el token de la plataforma
 */
export function getPlatformMPClient(): MercadoPagoConfig {
    const config = getMPConfig();
    return new MercadoPagoConfig({ accessToken: config.accessToken });
}

/**
 * Obtiene el cliente de MercadoPago con el token de un organizador
 * Desencripta el token si es necesario
 */
export async function getOrganizerMPClient(organizerId: number): Promise<MercadoPagoConfig | null> {
    const userRepo = AppDataSource.getRepository(User);
    
    const user = await userRepo
        .createQueryBuilder('user')
        .select(['user.id', 'user.mpAccessToken', 'user.mpUserId'])
        .where('user.id = :id', { id: organizerId })
        .getOne();
    
    if (!user?.mpAccessToken) {
        return null;
    }
    
    // Desencriptar el token
    const decryptedToken = decryptFromString(user.mpAccessToken);
    
    if (!decryptedToken) {
        logger.error('PAYMENT_ORGANIZER_TOKEN_DECRYPT_FAILED', { organizerId });
        return null;
    }
    
    return new MercadoPagoConfig({ accessToken: decryptedToken });
}

// ============================================================================
// PAYMENT FETCHING
// ============================================================================

const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;

/**
 * Obtiene un pago de MercadoPago con reintentos
 */
export async function fetchPaymentWithRetry(
    paymentId: string, 
    client?: MercadoPagoConfig
): Promise<PaymentData | null> {
    const mpClient = client || getPlatformMPClient();
    const paymentClient = new Payment(mpClient);
    
    let attempts = 0;
    let lastError: Error | null = null;
    
    while (attempts < MAX_RETRY_ATTEMPTS) {
        try {
            const result = await paymentClient.get({ id: paymentId });
            
            // Normalizar la respuesta
            return {
                id: paymentId,
                status: result.status || 'unknown',
                external_reference: result.external_reference || undefined,
                metadata: result.metadata || {},
                additional_info: result.additional_info || {},
                transaction_amount: result.transaction_amount || 0
            };
            
        } catch (error: any) {
            lastError = error;
            attempts++;
            
            logger.warn('PAYMENT_FETCH_RETRY', {
                paymentId,
                attempt: attempts,
                error: error?.message
            });
            
            if (attempts < MAX_RETRY_ATTEMPTS) {
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
            }
        }
    }
    
    logger.error('PAYMENT_FETCH_FAILED', {
        paymentId,
        attempts,
        error: lastError?.message
    });
    
    return null;
}

/**
 * Espera a que un pago esté aprobado, con reintentos
 */
export async function waitForPaymentApproval(
    paymentId: string,
    client?: MercadoPagoConfig
): Promise<PaymentData | null> {
    let payment = await fetchPaymentWithRetry(paymentId, client);
    
    if (!payment || payment.status === 'approved') {
        return payment;
    }
    
    // Si no está aprobado, reintentar unas veces más
    let attempts = 0;
    const maxApprovalAttempts = 3;
    
    while (
        attempts < maxApprovalAttempts && 
        payment && 
        payment.status !== 'approved'
    ) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        payment = await fetchPaymentWithRetry(paymentId, client);
        attempts++;
        
        logger.info('PAYMENT_APPROVAL_WAIT', {
            paymentId,
            attempt: attempts,
            status: payment?.status
        });
    }
    
    return payment?.status === 'approved' ? payment : null;
}

// ============================================================================
// DATA EXTRACTION
// ============================================================================

/**
 * Extrae información del pago desde external_reference o metadata
 */
export function extractPaymentInfo(payment: PaymentData): ExtractedPaymentInfo | null {
    let userId = 0;
    let ticketTypeId = 0;
    let quantity = 0;
    let organizerId = 0;
    let isQR = false;
    
    // Prioridad 1: external_reference
    // Formatos:
    // - Marketplace: userId|ticketTypeId|quantity|organizerId
    // - QR: QR|userId|ticketTypeId|quantity
    if (payment.external_reference) {
        const ref = String(payment.external_reference);
        const parts = ref.split('|');
        
        // Detectar tipo de pago
        if (parts[0] === 'QR') {
            isQR = true;
            // Formato QR: QR|userId|ticketTypeId|quantity
            if (parts.length >= 4) {
                userId = Number(parts[1]) || 0;
                ticketTypeId = Number(parts[2]) || 0;
                quantity = Number(parts[3]) || 0;
            }
        } else {
            // Formato Marketplace: userId|ticketTypeId|quantity|organizerId
            if (parts.length >= 3) {
                userId = Number(parts[0]) || 0;
                ticketTypeId = Number(parts[1]) || 0;
                quantity = Number(parts[2]) || 0;
            }
            if (parts.length >= 4) {
                organizerId = Number(parts[3]) || 0;
            }
        }
    }
    
    // Prioridad 2: Metadata (fallback)
    if (!userId || !ticketTypeId) {
        const meta = payment.metadata || {};
        const additional = payment.additional_info || {};
        const item = Array.isArray(additional.items) ? additional.items[0] : undefined;
        
        userId = Number(meta.user_id) || userId;
        ticketTypeId = Number(meta.ticket_type_id || item?.id) || ticketTypeId;
        quantity = Number(meta.amount_tickets || item?.quantity) || quantity || 1;
        organizerId = Number(meta.organizer_id) || organizerId;
    }
    
    // Validación
    if (!userId || !ticketTypeId || !quantity || quantity <= 0) {
        logger.error('PAYMENT_EXTRACTION_FAILED', {
            externalRef: payment.external_reference,
            metadata: payment.metadata,
            extracted: { userId, ticketTypeId, quantity, organizerId, isQR }
        });
        return null;
    }
    
    return { userId, ticketTypeId, quantity, organizerId, isQR };
}

/**
 * Obtiene información de comisión basada en el plan del organizador
 */
export async function getCommissionInfo(organizerId: number): Promise<CommissionInfo> {
    const defaultCommission: CommissionInfo = {
        percent: 8.00,
        amount: 0,
        planName: 'FREE'
    };
    
    try {
        const subscription = await getActiveSubscription(organizerId);
        return {
            percent: Number(subscription.plan.commissionPercent),
            amount: 0, // Se calcula después
            planName: subscription.plan.name
        };
    } catch (error) {
        logger.warn('COMMISSION_FETCH_ERROR', { organizerId, error: (error as Error).message });
        return defaultCommission;
    }
}

// ============================================================================
// STOCK MANAGEMENT
// ============================================================================

/**
 * Verifica si hay stock disponible para un ticket type
 */
export async function checkStockAvailability(
    ticketTypeId: number,
    quantity: number
): Promise<{ available: boolean; currentStock?: number; ticketType?: TicketType }> {
    const ticketTypeRepo = AppDataSource.getRepository(TicketType);
    
    const ticketType = await ticketTypeRepo.findOne({
        where: { id: ticketTypeId },
        relations: ['event']
    });
    
    if (!ticketType) {
        return { available: false };
    }
    
    const availableStock = ticketType.capacity - ticketType.soldCount;
    
    return {
        available: availableStock >= quantity,
        currentStock: availableStock,
        ticketType
    };
}

/**
 * Actualiza el stock atómicamente
 * Retorna true si se actualizó correctamente
 */
export async function updateStockAtomic(
    queryRunner: any,
    ticketTypeId: number,
    quantity: number
): Promise<boolean> {
    const updateResult = await queryRunner.manager
        .createQueryBuilder()
        .update(TicketType)
        .set({ soldCount: () => `"soldCount" + ${quantity}` })
        .where('id = :id', { id: ticketTypeId })
        .andWhere('("soldCount" + :amount) <= capacity', { amount: quantity })
        .execute();
    
    return updateResult.affected > 0;
}

// ============================================================================
// IDEMPOTENCY
// ============================================================================

/**
 * Verifica si un pago ya fue procesado
 */
export async function isPaymentProcessed(mpPaymentId: string): Promise<boolean> {
    const logRepo = AppDataSource.getRepository(PaymentLog);
    const existing = await logRepo.findOne({
        where: { mpPaymentId },
        select: ['id']
    });
    return !!existing;
}

/**
 * Crea un log de pago inicial (estado PROCESSING)
 * Retorna null si ya existe (idempotencia)
 */
export async function createPaymentLog(
    queryRunner: any,
    data: {
        mpPaymentId: string;
        externalReference: string;
        userId: number;
        ticketTypeId: number;
        organizerId: number;
        unitPrice: number;
        quantity: number;
        totalAmount: number;
        commissionPercent: number;
        commissionAmount: number;
        organizerPlanName: string;
    }
): Promise<PaymentLog | null> {
    const logRepo = queryRunner.manager.getRepository(PaymentLog);
    
    const log = logRepo.create({
        ...data,
        status: PaymentStatus.PROCESSING
    });
    
    try {
        await logRepo.save(log);
        return log;
    } catch (error: any) {
        // Error de unicidad = ya existe
        if (error?.code === '23505' || error?.message?.includes('unique')) {
            logger.info('PAYMENT_ALREADY_PROCESSED', { mpPaymentId: data.mpPaymentId });
            return null;
        }
        throw error;
    }
}

/**
 * Actualiza el estado de un log de pago
 */
export async function updatePaymentLogStatus(
    queryRunner: any,
    logId: number,
    status: PaymentStatus
): Promise<void> {
    const logRepo = queryRunner.manager.getRepository(PaymentLog);
    await logRepo.update(logId, { status });
}

// ============================================================================
// PAYMENT PROCESSING
// ============================================================================

/**
 * Procesa un pago aprobado y crea los tickets
 * Esta función maneja toda la transacción
 */
export async function processApprovedPayment(
    paymentId: string,
    paymentData: PaymentData
): Promise<PaymentResult> {
    logger.info('PROCESS_APPROVED_PAYMENT_START', {
        paymentId,
        externalReference: paymentData.external_reference,
        status: paymentData.status,
        transactionAmount: paymentData.transaction_amount
    });
    
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    
    try {
        // 1. Extraer información del pago
        const info = extractPaymentInfo(paymentData);
        if (!info) {
            logger.error('PROCESS_PAYMENT_EXTRACTION_FAILED', { paymentId, paymentData });
            throw new Error('Failed to extract payment information');
        }
        
        logger.info('PROCESS_PAYMENT_INFO_EXTRACTED', {
            paymentId,
            userId: info.userId,
            ticketTypeId: info.ticketTypeId,
            quantity: info.quantity,
            organizerId: info.organizerId
        });
        
        const { userId, ticketTypeId, quantity, organizerId } = info;
        
        // 2. Verificar que el usuario existe
        const userRepo = queryRunner.manager.getRepository(User);
        const user = await userRepo.findOne({ where: { id: userId } });
        if (!user) {
            throw new Error(`User not found: ${userId}`);
        }
        
        // 3. Obtener ticket type con evento
        const ticketTypeRepo = queryRunner.manager.getRepository(TicketType);
        const ticketType = await ticketTypeRepo.findOne({
            where: { id: ticketTypeId },
            relations: ['event']
        });
        
        if (!ticketType) {
            throw new Error(`TicketType not found: ${ticketTypeId}`);
        }
        
        // 4. Verificar que el monto pagado coincida con lo esperado
        const expectedTotal = Number(ticketType.price) * quantity;
        const paidAmount = paymentData.transaction_amount || 0;
        
        // Tolerancia de 1% para diferencias de redondeo
        const tolerance = expectedTotal * 0.01;
        if (Math.abs(paidAmount - expectedTotal) > tolerance) {
            logger.error('PAYMENT_AMOUNT_MISMATCH', {
                paymentId,
                expected: expectedTotal,
                paid: paidAmount,
                tolerance
            });
            // Continuar pero loguear - no bloquear por pequeñas diferencias
        }
        
        // 5. Obtener comisión del organizador
        const actualOrganizerId = organizerId || ticketType.event.user_id;
        const commission = await getCommissionInfo(actualOrganizerId);
        commission.amount = (expectedTotal * commission.percent) / 100;
        
        // 6. Crear log de pago (idempotencia)
        const log = await createPaymentLog(queryRunner, {
            mpPaymentId: paymentId,
            externalReference: paymentData.external_reference || '',
            userId,
            ticketTypeId,
            organizerId: actualOrganizerId,
            unitPrice: Number(ticketType.price),
            quantity,
            totalAmount: expectedTotal,
            commissionPercent: commission.percent,
            commissionAmount: commission.amount,
            organizerPlanName: commission.planName
        });
        
        if (!log) {
            // Ya procesado
            await queryRunner.rollbackTransaction();
            return { success: true, error: 'Payment already processed' };
        }
        
        // 7. Actualizar stock atómicamente
        const stockUpdated = await updateStockAtomic(queryRunner, ticketTypeId, quantity);
        if (!stockUpdated) {
            logger.warn('PAYMENT_NO_STOCK', { ticketTypeId, requested: quantity });
            await updatePaymentLogStatus(queryRunner, log.id, PaymentStatus.FAILED);
            await queryRunner.commitTransaction();
            return { success: false, error: 'No stock available', logId: log.id };
        }
        
        // 8. Crear tickets
        const tickets = await createTicketsForPurchase(ticketType, user, quantity);
        await queryRunner.manager.save(Ticket, tickets);
        
        // 9. Marcar como completado
        await updatePaymentLogStatus(queryRunner, log.id, PaymentStatus.COMPLETED);
        
        await queryRunner.commitTransaction();
        
        logger.info('PAYMENT_PROCESSED_SUCCESS', {
            paymentId,
            logId: log.id,
            ticketsCreated: tickets.length,
            userId,
            organizerId: actualOrganizerId
        });
        
        // Enviar email asíncronamente (fuera de la transacción)
        if (user.email) {
            sendTicketEmail(
                user.email,
                tickets,
                ticketType,
                ticketType.event,
                user
            ).catch(err => {
                logger.error('PAYMENT_EMAIL_ERROR', { paymentId, error: err?.message });
            });
        }
        
        return { success: true, tickets, logId: log.id };
        
    } catch (error: any) {
        await queryRunner.rollbackTransaction();
        
        logger.error('PAYMENT_PROCESS_ERROR', {
            paymentId,
            error: error.message,
            stack: error.stack
        });
        
        return { success: false, error: error.message };
    } finally {
        await queryRunner.release();
    }
}
