import { MercadoPagoConfig, Payment, Preference } from 'mercadopago';
import { Between } from 'typeorm';
import AppDataSource from '../db';
import { PaymentLog, PaymentStatus } from './payment.entity';
import { User } from '../user/user.entity';
import { TicketType } from '../ticketType/ticketType.entity';
import { Ticket } from '../ticket/ticket.entity';
import { PromoterGroup } from '../promoter/promoter.entity';
import { Coupon } from '../coupon/coupon.entity';
import { getActiveSubscription } from '../subscription/subscription.service';
import { createTicketsForPurchase, sendTicketEmail } from '../ticket/ticket.service';
import { logger } from '../common/services/logger';
import { getMPConfig } from './mp.config';
import { decryptFromString } from '../common/services/encryption';
import { createAccountClaimToken } from '../user/accountClaim.service';
import { sendAccountClaimEmail } from '../common/services/mailer';

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
    promoterCode?: string; // Código del promotor que vendió
    couponId?: number;
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
    promoterId?: number;
    promoterCommission?: number;
}

export interface WebhookPaymentLookupResult {
    payment: PaymentData;
    client: MercadoPagoConfig;
    source: 'platform' | 'organizer';
    organizerId?: number;
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

function normalizePaymentData(paymentId: string, result: any): PaymentData {
    return {
        id: paymentId,
        status: result.status || 'unknown',
        external_reference: result.external_reference || undefined,
        metadata: result.metadata || {},
        additional_info: result.additional_info || {},
        transaction_amount: result.transaction_amount || 0
    };
}

async function fetchPaymentOnce(
    paymentId: string,
    client: MercadoPagoConfig
): Promise<PaymentData | null> {
    try {
        const paymentClient = new Payment(client);
        const result = await paymentClient.get({ id: paymentId });
        return normalizePaymentData(paymentId, result);
    } catch {
        return null;
    }
}

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
            return normalizePaymentData(paymentId, result);
            
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
 * Resuelve el pago recibido por webhook usando el token que realmente puede leerlo.
 *
 * En marketplace las preferencias se crean con el token OAuth del organizador, por
 * eso el token de plataforma no siempre puede consultar el pago notificado.
 */
export async function resolveWebhookPayment(
    paymentId: string,
    paymentData?: PaymentData
): Promise<WebhookPaymentLookupResult | null> {
    // Try platform token first
    const platformClient = getPlatformMPClient();
    const platformPayment = await fetchPaymentWithRetry(paymentId, platformClient);

    if (platformPayment) {
        return {
            payment: platformPayment,
            client: platformClient,
            source: 'platform'
        };
    }

    // Extract organizerId from external_reference if available
    const externalRef = paymentData?.external_reference || '';
    const organizerIdFromRef = extractOrganizerIdFromRef(externalRef);

    if (organizerIdFromRef) {
        const organizerClient = await getOrganizerMPClient(organizerIdFromRef);
        if (organizerClient) {
            const organizerPayment = await fetchPaymentOnce(paymentId, organizerClient);
            if (organizerPayment) {
                logger.info('PAYMENT_LOOKUP_ORGANIZER_HIT', {
                    paymentId,
                    organizerId: organizerIdFromRef,
                    status: organizerPayment.status
                });
                return {
                    payment: organizerPayment,
                    client: organizerClient,
                    source: 'organizer',
                    organizerId: organizerIdFromRef
                };
            }
        }
    }

    logger.warn('PAYMENT_LOOKUP_PLATFORM_MISS', { paymentId });

    // Fallback: limited search (max 10 organizers) to prevent DoS
    const userRepo = AppDataSource.getRepository(User);
    const organizers = await userRepo
        .createQueryBuilder('user')
        .select(['user.id', 'user.mpAccessToken'])
        .where('user.mpAccessToken IS NOT NULL')
        .andWhere('user.mpUserId IS NOT NULL')
        .limit(10)
        .getMany();

    for (const organizer of organizers) {
        const accessToken = decryptFromString(organizer.mpAccessToken);
        if (!accessToken) {
            logger.warn('PAYMENT_ORGANIZER_TOKEN_DECRYPT_SKIPPED', {
                organizerId: organizer.id
            });
            continue;
        }

        const client = new MercadoPagoConfig({ accessToken });
        const organizerPayment = await fetchPaymentOnce(paymentId, client);

        if (organizerPayment) {
            logger.info('PAYMENT_LOOKUP_ORGANIZER_HIT', {
                paymentId,
                organizerId: organizer.id,
                status: organizerPayment.status
            });

            return {
                payment: organizerPayment,
                client,
                source: 'organizer',
                organizerId: organizer.id
            };
        }
    }

    logger.error('PAYMENT_LOOKUP_FAILED_ALL_TOKENS', {
        paymentId,
        organizersChecked: organizers.length
    });

    return null;
}

function extractOrganizerIdFromRef(externalRef: string): number | null {
    if (!externalRef) return null;
    const parts = externalRef.split('|');
    if (parts.length >= 4) {
        const id = Number(parts[3]);
        return Number.isSafeInteger(id) && id > 0 ? id : null;
    }
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
    const toPositiveInt = (value: unknown): number => {
        const n = Number(value);
        return Number.isSafeInteger(n) && n > 0 ? n : 0;
    };

    let userId = 0;
    let ticketTypeId = 0;
    let quantity = 0;
    let organizerId = 0;
    const meta = payment.metadata || {};
    let couponId = toPositiveInt(meta.coupon_id);
    
    // Prioridad 1: external_reference
    // Formato: userId|ticketTypeId|quantity|organizerId|promoterCode(optional)
    let promoterCode: string | undefined;
    
    if (payment.external_reference) {
        const ref = String(payment.external_reference);
        const parts = ref.split('|');
        
        // Formato: userId|ticketTypeId|quantity|organizerId|promoterCode(optional)
        if (parts.length >= 3) {
            userId = toPositiveInt(parts[0]);
            ticketTypeId = toPositiveInt(parts[1]);
            quantity = toPositiveInt(parts[2]);
        }
        if (parts.length >= 4) {
            organizerId = toPositiveInt(parts[3]);
        }
        if (parts.length >= 5) {
            promoterCode = String(parts[4] || "").trim().slice(0, 50) || undefined;
        }
    }
    
    // Prioridad 2: Metadata (fallback)
    if (!userId || !ticketTypeId) {
        const additional = payment.additional_info || {};
        const item = Array.isArray(additional.items) ? additional.items[0] : undefined;
        
        userId = toPositiveInt(meta.user_id) || userId;
        ticketTypeId = toPositiveInt(meta.ticket_type_id || item?.id) || ticketTypeId;
        quantity = toPositiveInt(meta.amount_tickets || item?.quantity) || quantity || 1;
        organizerId = toPositiveInt(meta.organizer_id) || organizerId;
    }
    
    // Validación
    if (!userId || !ticketTypeId || !quantity || quantity <= 0 || quantity > 100) {
        logger.error('PAYMENT_EXTRACTION_FAILED', {
            hasExternalRef: !!payment.external_reference,
            metadataKeys: Object.keys(payment.metadata || {}),
            extracted: { userId, ticketTypeId, quantity, organizerId, hasPromoterCode: !!promoterCode }
        });
        return null;
    }
    
    return { userId, ticketTypeId, quantity, organizerId, promoterCode, couponId: couponId || undefined };
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
        hasExternalReference: !!paymentData.external_reference,
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
            logger.error('PROCESS_PAYMENT_EXTRACTION_FAILED', {
                paymentId,
                status: paymentData.status,
                hasExternalReference: !!paymentData.external_reference,
                metadataKeys: Object.keys(paymentData.metadata || {})
            });
            throw new Error('Failed to extract payment information');
        }
        
        logger.info('PROCESS_PAYMENT_INFO_EXTRACTED', {
            paymentId,
            userId: info.userId,
            ticketTypeId: info.ticketTypeId,
            quantity: info.quantity,
            organizerId: info.organizerId,
            promoterCode: info.promoterCode
        });
        
        const { userId, ticketTypeId, quantity, organizerId, promoterCode, couponId } = info;
        
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
        const baseTotal = Number(ticketType.price) * quantity;
        let expectedTotal = baseTotal;
        let coupon: Coupon | null = null;

        if (couponId) {
            coupon = await queryRunner.manager.findOne(Coupon, {
                where: { id: couponId, eventId: ticketType.event.id, isActive: true }
            });

            if (!coupon) {
                throw new Error('Coupon not valid for this event');
            }

            if (coupon.expiresAt && new Date() > coupon.expiresAt) {
                throw new Error('Coupon expired');
            }

            if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) {
                throw new Error('Coupon exhausted');
            }

            const discountAmount = Math.min(baseTotal, Math.round((baseTotal * coupon.discountPercent) / 100));
            expectedTotal = Math.max(baseTotal - discountAmount, 0);
        }

        const paidAmount = Number(paymentData.transaction_amount);
        if (!Number.isFinite(paidAmount) || paidAmount < 0) {
            throw new Error('Invalid payment amount');
        }
        
        // Tolerancia de $0.01 ARS para diferencias de redondeo
        const tolerance = 0.01;
        if (Math.abs(paidAmount - expectedTotal) > tolerance) {
            logger.error('PAYMENT_AMOUNT_MISMATCH', {
                paymentId,
                expected: expectedTotal,
                paid: paidAmount,
                tolerance
            });
            throw new Error('Payment amount mismatch');
        }
        
        // 5. Obtener comisión del organizador
        const actualOrganizerId = organizerId || ticketType.event.user_id;
        const commission = await getCommissionInfo(actualOrganizerId);
        commission.amount = (expectedTotal * commission.percent) / 100;
        
        // 5.1 Buscar información del promotor si hay código
        let promoterInfo: { promoterId: number; commissionPercentage: number; commissionAmount: number } | null = null;
        if (promoterCode) {
            const promoterGroupRepo = queryRunner.manager.getRepository(PromoterGroup);
            const promoterGroup = await promoterGroupRepo.findOne({
                where: { promoterCode, organizerId: actualOrganizerId, isActive: true },
                relations: ['promoter']
            });
            
            if (promoterGroup && promoterGroup.promoter) {
                const commissionPercentage = parseFloat(promoterGroup.commissionPercentage.toString());
                const commissionAmount = (expectedTotal * commissionPercentage) / 100;
                promoterInfo = {
                    promoterId: promoterGroup.promoterId,
                    commissionPercentage,
                    commissionAmount
                };
                
                logger.info('PAYMENT_PROMOTER_FOUND', {
                    paymentId,
                    promoterId: promoterGroup.promoterId,
                    promoterCode,
                    commissionPercentage,
                    commissionAmount
                });
            } else {
                logger.warn('PAYMENT_PROMOTER_NOT_FOUND', { paymentId, promoterCode });
            }
        }
        
        // 6. Crear log de pago (idempotencia)
        const log = await createPaymentLog(queryRunner, {
            mpPaymentId: paymentId,
            externalReference: paymentData.external_reference || '',
            userId,
            ticketTypeId,
            organizerId: actualOrganizerId,
            unitPrice: Number((expectedTotal / quantity).toFixed(2)),
            quantity,
            totalAmount: expectedTotal,
            commissionPercent: commission.percent,
            commissionAmount: commission.amount,
            organizerPlanName: commission.planName
        });
        
        if (!log) {
            // Already processed (idempotency). Find existing log and tickets.
            await queryRunner.rollbackTransaction();
            
            const existingLog = await queryRunner.manager.findOne(PaymentLog, {
                where: { mpPaymentId: paymentId },
                select: ['id', 'status', 'userId', 'ticketTypeId', 'createdAt']
            });
            
            if (existingLog && existingLog.status === PaymentStatus.COMPLETED) {
                // Find tickets created around the same time as the log
                const fiveMinutesBefore = new Date(existingLog.createdAt.getTime() - 5 * 60 * 1000);
                const fiveMinutesAfter = new Date(existingLog.createdAt.getTime() + 5 * 60 * 1000);
                
                const existingTickets = await queryRunner.manager.find(Ticket, {
                    where: {
                        userId: existingLog.userId,
                        ticketTypeId: existingLog.ticketTypeId,
                        createdAt: Between(fiveMinutesBefore, fiveMinutesAfter)
                    },
                    relations: ['ticketType', 'ticketType.event']
                });
                
                return { 
                    success: true, 
                    tickets: existingTickets,
                    logId: existingLog.id,
                    error: undefined
                };
            }
            
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

        if (coupon) {
            const couponUpdate = await queryRunner.manager
                .createQueryBuilder()
                .update(Coupon)
                .set({ usedCount: () => `"usedCount" + 1` })
                .where('id = :id', { id: coupon.id })
                .andWhere('("maxUses" = 0 OR "usedCount" < "maxUses")')
                .execute();

            if (!couponUpdate.affected) {
                // Rollback stock and mark payment failed
                await queryRunner.manager
                    .createQueryBuilder()
                    .update(TicketType)
                    .set({ soldCount: () => `GREATEST("soldCount" - ${quantity}, 0)` })
                    .where('id = :id', { id: ticketTypeId })
                    .execute();
                await updatePaymentLogStatus(queryRunner, log.id, PaymentStatus.FAILED);
                await queryRunner.rollbackTransaction();
                return { success: false, error: 'Coupon exhausted', logId: log.id };
            }
        }
        
        // 8. Crear tickets con información del promotor
        const tickets = await createTicketsForPurchase(
            ticketType, 
            user, 
            quantity,
            promoterInfo ? {
                soldByPromoterId: promoterInfo.promoterId,
                promoterCommissionPercentage: promoterInfo.commissionPercentage,
                promoterCommissionAmount: promoterInfo.commissionAmount,
                promoterCode
            } : undefined
        );
        const paidUnitPrice = Number((expectedTotal / quantity).toFixed(2));
        tickets.forEach(ticket => {
            ticket.purchasePrice = paidUnitPrice;
        });
        await queryRunner.manager.save(Ticket, tickets);
        
        // 9. Marcar como completado
        await updatePaymentLogStatus(queryRunner, log.id, PaymentStatus.COMPLETED);
        
        await queryRunner.commitTransaction();
        
        logger.info('PAYMENT_PROCESSED_SUCCESS', {
            paymentId,
            logId: log.id,
            ticketsCreated: tickets.length,
            userId,
            organizerId: actualOrganizerId,
            promoterId: promoterInfo?.promoterId,
            promoterCommission: promoterInfo?.commissionAmount
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

            if (user.isGuestAccount) {
                createAccountClaimToken(user)
                    .then(claim => sendAccountClaimEmail(
                        user.email,
                        `${user.firstname || ''} ${user.lastname || ''}`.trim(),
                        claim.claimUrl
                    ))
                    .catch(err => {
                        logger.error('PAYMENT_CLAIM_EMAIL_ERROR', { paymentId, userId: user.id, error: err?.message });
                    });
            }
        }
        
        return { 
            success: true, 
            tickets, 
            logId: log.id,
            promoterId: promoterInfo?.promoterId,
            promoterCommission: promoterInfo?.commissionAmount
        };
        
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
