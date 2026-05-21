import { MercadoPagoConfig, Payment, Preference } from 'mercadopago';
import { Between } from 'typeorm';
import { randomUUID } from 'crypto';
import AppDataSource from '../db';
import { PaymentLog, PaymentStatus } from './payment.entity';
import { User } from '../user/user.entity';
import { TicketType } from '../ticketType/ticketType.entity';
import { Ticket } from '../ticket/ticket.entity';
import { EventProduct } from '../extra/eventProduct.entity';
import { ExtraItem, ExtraItemStatus } from '../extra/extraItem.entity';
import { PromoterGroup } from '../promoter/promoter.entity';
import { Coupon } from '../coupon/coupon.entity';
import { getActiveSubscription } from '../subscription/subscription.service';
import { createTicketsForPurchase, sendTicketEmail } from '../ticket/ticket.service';
import { generarQRUrl } from '../common/utils/qr';
import { logger } from '../common/services/logger';
import { getMPConfig } from './mp.config';
import { decryptFromString } from '../common/services/encryption';
import { createAccountClaimToken } from '../user/accountClaim.service';
import { sendAccountClaimEmail, enviarCorreoConExtras } from '../common/services/mailer';

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
    organizerId: number;
    items: Array<{ type: 'ticket' | 'extra'; referenceId: number; quantity: number }>;
    promoterCode?: string;
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
    extras?: ExtraItem[];
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
    } catch (error: any) {
        logger.warn('PAYMENT_FETCH_ONCE_FAILED', {
            paymentId,
            error: error?.message || 'Unknown error'
        });
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
    
    // Solo un reintento rápido para evitar exceder el timeout de MP (~5s)
    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    payment = await fetchPaymentWithRetry(paymentId, client);
    
    logger.info('PAYMENT_APPROVAL_WAIT', {
        paymentId,
        status: payment?.status
    });
    
    return payment?.status === 'approved' ? payment : null;
}

// ============================================================================
// DATA EXTRACTION
// ============================================================================

/**
 * Extrae información del pago desde metadata o external_reference (legacy fallback)
 */
export function extractPaymentInfo(payment: PaymentData): ExtractedPaymentInfo | null {
    const toPositiveInt = (value: unknown): number => {
        const n = Number(value);
        return Number.isSafeInteger(n) && n > 0 ? n : 0;
    };

    const meta = payment.metadata || {};
    let userId = 0;
    let organizerId = 0;
    let items: Array<{ type: 'ticket' | 'extra'; referenceId: number; quantity: number }> = [];
    let promoterCode: string | undefined;
    let couponId = toPositiveInt(meta.coupon_id);

    // Prioridad 1: metadata.items (nuevo formato polimórfico)
    if (meta.items) {
        try {
            const parsed = typeof meta.items === 'string' ? JSON.parse(meta.items) : meta.items;
            if (Array.isArray(parsed) && parsed.length > 0) {
                items = parsed
                    .map((it: any) => ({
                        type: (it.type === 'extra' ? 'extra' : 'ticket') as 'ticket' | 'extra',
                        referenceId: toPositiveInt(it.referenceId || it.ticketTypeId || it.ticket_type_id || it.eventProductId || it.event_product_id),
                        quantity: toPositiveInt(it.quantity || it.amount_tickets)
                    }))
                    .filter((it: any) => it.referenceId > 0 && it.quantity > 0);
            }
        } catch {
            // ignore parse error
        }
        userId = toPositiveInt(meta.user_id);
        organizerId = toPositiveInt(meta.organizer_id);
    }

    // Prioridad 2: external_reference (formato legacy: userId|ticketTypeId|quantity|organizerId|promoterCode)
    if (items.length === 0 && payment.external_reference) {
        const ref = String(payment.external_reference);
        const parts = ref.split('|');

        if (parts.length >= 4) {
            userId = toPositiveInt(parts[0]);
            const legacyTicketTypeId = toPositiveInt(parts[1]);
            const legacyQuantity = toPositiveInt(parts[2]);
            organizerId = toPositiveInt(parts[3]);
            if (legacyTicketTypeId > 0 && legacyQuantity > 0) {
                items = [{ type: 'ticket', referenceId: legacyTicketTypeId, quantity: legacyQuantity }];
            }
            if (parts.length >= 5) {
                promoterCode = String(parts[4] || "").trim().slice(0, 50) || undefined;
            }
        }
    }

    if (items.length === 0 || !userId || !organizerId) {
        logger.error('PAYMENT_EXTRACTION_FAILED', {
            hasExternalRef: !!payment.external_reference,
            metadataKeys: Object.keys(payment.metadata || {}),
            extracted: { userId, itemCount: items.length, organizerId, hasPromoterCode: !!promoterCode }
        });
        return null;
    }

    return { userId, organizerId, items, promoterCode, couponId: couponId || undefined };
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
        organizerId: number;
        items: Array<{ type: 'ticket' | 'extra'; referenceId: number; quantity: number; unitPrice: number }>;
        quantity: number;
        totalAmount: number;
        baseAmount?: number;
        discountAmount?: number;
        serviceFeePercent?: number;
        serviceFeeAmount?: number;
        buyerTotalAmount?: number;
        commissionPercent: number;
        commissionAmount: number;
        organizerPlanName: string;
    }
): Promise<PaymentLog | null> {
    const logRepo = queryRunner.manager.getRepository(PaymentLog);

    const log = logRepo.create({
        ...data,
        baseAmount: data.baseAmount ?? data.totalAmount,
        discountAmount: data.discountAmount ?? 0,
        serviceFeePercent: data.serviceFeePercent ?? 0,
        serviceFeeAmount: data.serviceFeeAmount ?? 0,
        buyerTotalAmount: data.buyerTotalAmount ?? data.totalAmount,
        status: PaymentStatus.PROCESSING
    });

    try {
        await logRepo.save(log);
        return log;
    } catch (error: any) {
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
            itemCount: info.items.length,
            organizerId: info.organizerId,
            promoterCode: info.promoterCode
        });

        const { userId, items, organizerId, promoterCode, couponId } = info;
        const totalQuantity = items.reduce((sum, it) => sum + it.quantity, 0);

        const userRepo = queryRunner.manager.getRepository(User);
        const user = await userRepo.findOne({ where: { id: userId } });
        if (!user) {
            throw new Error('User not found: ' + userId);
        }

        const ticketItems = items.filter(it => it.type === 'ticket');
        const extraItems = items.filter(it => it.type === 'extra');

        const ticketTypeRepo = queryRunner.manager.getRepository(TicketType);
        const ticketTypes: TicketType[] = [];
        for (const item of ticketItems) {
            const tt = await ticketTypeRepo.findOne({
                where: { id: item.referenceId },
                relations: ['event']
            });
            if (!tt) {
                throw new Error('TicketType not found: ' + item.referenceId);
            }
            ticketTypes.push(tt);
        }

        const eventProductRepo = queryRunner.manager.getRepository(EventProduct);
        const extras: EventProduct[] = [];
        for (const item of extraItems) {
            const ep = await eventProductRepo.findOne({
                where: { id: item.referenceId },
                relations: ['event', 'product']
            });
            if (!ep) {
                throw new Error('EventProduct not found: ' + item.referenceId);
            }
            extras.push(ep);
        }

        let ticketBaseTotal = 0;
        const logItems: Array<{ type: 'ticket' | 'extra'; referenceId: number; quantity: number; unitPrice: number }> = [];
        for (const item of ticketItems) {
            const tt = ticketTypes.find(t => t.id === item.referenceId)!;
            ticketBaseTotal += Number(tt.price) * item.quantity;
            logItems.push({
                type: 'ticket',
                referenceId: item.referenceId,
                quantity: item.quantity,
                unitPrice: Number(tt.price)
            });
        }

        let extraBaseTotal = 0;
        for (const item of extraItems) {
            const ep = extras.find(e => e.id === item.referenceId)!;
            extraBaseTotal += Number(ep.eventPrice) * item.quantity;
            logItems.push({
                type: 'extra',
                referenceId: item.referenceId,
                quantity: item.quantity,
                unitPrice: Number(ep.eventPrice)
            });
        }

        const baseTotal = ticketBaseTotal + extraBaseTotal;

        let expectedTotal = baseTotal;
        let discountAmount = 0;
        let coupon: Coupon | null = null;
        const eventId = ticketTypes.length > 0 ? ticketTypes[0].event.id : (extras.length > 0 ? extras[0].event.id : 0);

        if (couponId && eventId) {
            coupon = await queryRunner.manager.findOne(Coupon, {
                where: { id: couponId, eventId, isActive: true }
            });

            if (coupon && coupon.expiresAt && new Date() > coupon.expiresAt) {
                logger.warn('PAYMENT_COUPON_EXPIRED_BUT_PAID', { paymentId, couponId });
                coupon = null;
            }
            if (coupon && coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) {
                logger.warn('PAYMENT_COUPON_EXHAUSTED_BUT_PAID', { paymentId, couponId });
                coupon = null;
            }

            if (coupon) {
                discountAmount = Math.min(ticketBaseTotal, Math.round((ticketBaseTotal * coupon.discountPercent) / 100));
                expectedTotal = Math.max(ticketBaseTotal - discountAmount, 0) + extraBaseTotal;
            }
        }

        const paidAmount = Number(paymentData.transaction_amount);
        if (!Number.isFinite(paidAmount) || paidAmount < 0) {
            throw new Error('Invalid payment amount');
        }

        const metadata = paymentData.metadata || {};
        const serviceFeePercent = Number(metadata.service_fee_percent || 0);
        const serviceFeeAmount = Number(metadata.service_fee_amount || 0);
        const metadataBuyerTotal = Number(metadata.buyer_total_amount || 0);
        const expectedBuyerTotal = Number.isFinite(metadataBuyerTotal) && metadataBuyerTotal > 0
            ? metadataBuyerTotal
            : expectedTotal + serviceFeeAmount;

        const tolerance = 0.01;
        if (Math.abs(paidAmount - expectedBuyerTotal) > tolerance) {
            logger.error('PAYMENT_AMOUNT_MISMATCH', {
                paymentId,
                expected: expectedBuyerTotal,
                expectedBaseTotal: expectedTotal,
                paid: paidAmount,
                serviceFeeAmount,
                tolerance
            });
            throw new Error('Payment amount mismatch');
        }

        const actualOrganizerId = organizerId || (ticketTypes.length > 0 ? ticketTypes[0].event.user_id : (extras.length > 0 ? extras[0].event.user_id : 0));
        const commission = await getCommissionInfo(actualOrganizerId);
        commission.amount = (expectedTotal * commission.percent) / 100;

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

        const log = await createPaymentLog(queryRunner, {
            mpPaymentId: paymentId,
            externalReference: paymentData.external_reference || '',
            userId,
            organizerId: actualOrganizerId,
            items: logItems,
            quantity: totalQuantity,
            totalAmount: expectedTotal,
            baseAmount: baseTotal,
            discountAmount,
            serviceFeePercent: Number.isFinite(serviceFeePercent) ? serviceFeePercent : 0,
            serviceFeeAmount: Number.isFinite(serviceFeeAmount) ? serviceFeeAmount : 0,
            buyerTotalAmount: expectedBuyerTotal,
            commissionPercent: commission.percent,
            commissionAmount: commission.amount,
            organizerPlanName: commission.planName
        });

        if (!log) {
            await queryRunner.rollbackTransaction();

            const existingLog = await AppDataSource.getRepository(PaymentLog).findOne({
                where: { mpPaymentId: paymentId },
                select: ['id', 'status', 'userId', 'createdAt']
            });

            if (existingLog && existingLog.status === PaymentStatus.COMPLETED) {
                let existingTickets = await AppDataSource.getRepository(Ticket).find({
                    where: { paymentLogId: existingLog.id },
                    relations: ['ticketType', 'ticketType.event']
                });

                let existingExtras = await AppDataSource.getRepository(ExtraItem).find({
                    where: { paymentLogId: existingLog.id },
                    relations: ['eventProduct', 'eventProduct.event']
                });

                if (existingTickets.length === 0 && existingExtras.length === 0) {
                    const fiveMinutesBefore = new Date(existingLog.createdAt.getTime() - 5 * 60 * 1000);
                    const fiveMinutesAfter = new Date(existingLog.createdAt.getTime() + 5 * 60 * 1000);

                    existingTickets = await AppDataSource.getRepository(Ticket).find({
                        where: {
                            userId: existingLog.userId,
                            createdAt: Between(fiveMinutesBefore, fiveMinutesAfter)
                        },
                        relations: ['ticketType', 'ticketType.event']
                    });

                    existingExtras = await AppDataSource.getRepository(ExtraItem).find({
                        where: {
                            userId: existingLog.userId,
                            createdAt: Between(fiveMinutesBefore, fiveMinutesAfter)
                        },
                        relations: ['eventProduct', 'eventProduct.event']
                    });
                }

                return {
                    success: true,
                    tickets: existingTickets.length > 0 ? existingTickets : undefined,
                    extras: existingExtras.length > 0 ? existingExtras : undefined,
                    logId: existingLog.id,
                    error: undefined
                };
            }

            return { success: false, error: 'Payment already processed' };
        }

        for (const item of ticketItems) {
            const stockUpdated = await updateStockAtomic(queryRunner, item.referenceId, item.quantity);
            if (!stockUpdated) {
                logger.warn('PAYMENT_NO_STOCK', { ticketTypeId: item.referenceId, requested: item.quantity });
                await updatePaymentLogStatus(queryRunner, log.id, PaymentStatus.FAILED);
                await queryRunner.commitTransaction();
                return { success: false, error: 'No stock available', logId: log.id };
            }
        }

        for (const item of extraItems) {
            const ep = extras.find(e => e.id === item.referenceId)!;
            if (ep.hasStock) {
                const extraStockUpdate = await queryRunner.manager
                    .createQueryBuilder()
                    .update(EventProduct)
                    .set({ soldCount: () => '"soldCount" + ' + item.quantity })
                    .where('id = :id', { id: ep.id })
                    .andWhere('("stock" - "soldCount") >= :qty', { qty: item.quantity })
                    .execute();

                if (!extraStockUpdate.affected) {
                    logger.warn('PAYMENT_NO_EXTRA_STOCK', { eventProductId: ep.id, requested: item.quantity });
                    await updatePaymentLogStatus(queryRunner, log.id, PaymentStatus.FAILED);
                    await queryRunner.commitTransaction();
                    return { success: false, error: 'No extra stock available', logId: log.id };
                }
            }
        }

        if (coupon) {
            const couponUpdate = await queryRunner.manager
                .createQueryBuilder()
                .update(Coupon)
                .set({ usedCount: () => '"usedCount" + 1' })
                .where('id = :id', { id: coupon.id })
                .andWhere('("maxUses" = 0 OR "usedCount" < "maxUses")')
                .execute();

            if (!couponUpdate.affected) {
                for (const item of ticketItems) {
                    await queryRunner.manager
                        .createQueryBuilder()
                        .update(TicketType)
                        .set({ soldCount: () => 'GREATEST("soldCount" - ' + item.quantity + ', 0)' })
                        .where('id = :id', { id: item.referenceId })
                        .execute();
                }
                for (const item of extraItems) {
                    const ep = extras.find(e => e.id === item.referenceId)!;
                    if (ep.hasStock) {
                        await queryRunner.manager
                            .createQueryBuilder()
                            .update(EventProduct)
                            .set({ soldCount: () => 'GREATEST("soldCount" - ' + item.quantity + ', 0)' })
                            .where('id = :id', { id: ep.id })
                            .execute();
                    }
                }
                await updatePaymentLogStatus(queryRunner, log.id, PaymentStatus.FAILED);
                await queryRunner.commitTransaction();
                return { success: false, error: 'Coupon exhausted', logId: log.id };
            }
        }

        const allTickets: Ticket[] = [];
        for (const item of ticketItems) {
            const tt = ticketTypes.find(t => t.id === item.referenceId)!;
            const itemExpectedTotal = Number(tt.price) * item.quantity;
            const paidUnitPrice = item.quantity > 0 ? Number((itemExpectedTotal / item.quantity).toFixed(2)) : 0;

            const tickets = await createTicketsForPurchase(
                tt,
                user,
                item.quantity,
                promoterInfo ? {
                    soldByPromoterId: promoterInfo.promoterId,
                    promoterCommissionPercentage: promoterInfo.commissionPercentage,
                    promoterCommissionAmount: promoterInfo.commissionAmount,
                    promoterCode
                } : undefined
            );
            tickets.forEach(ticket => {
                ticket.purchasePrice = paidUnitPrice;
                ticket.paymentLogId = log.id;
            });
            await queryRunner.manager.save(Ticket, tickets);
            allTickets.push(...tickets);
        }

        const allExtras: ExtraItem[] = [];
        for (const item of extraItems) {
            const ep = extras.find(e => e.id === item.referenceId)!;
            const loteTotal = Number(ep.eventPrice) * item.quantity;
            const loteUnitPrice = item.quantity > 0 ? Number((loteTotal / item.quantity).toFixed(2)) : 0;

            const codigoUnico = randomUUID();
            const qrCode = await generarQRUrl(codigoUnico);
            const extraItem = ExtraItem.create({
                codigo_unico: codigoUnico,
                qrCode,
                eventProductId: ep.id,
                userId: user.id,
                paymentLogId: log.id,
                quantity: item.quantity,
                status: ExtraItemStatus.ACTIVE,
                purchasePrice: loteUnitPrice
            });
            await queryRunner.manager.save(ExtraItem, extraItem);
            allExtras.push(extraItem);
        }

        await updatePaymentLogStatus(queryRunner, log.id, PaymentStatus.COMPLETED);

        await queryRunner.commitTransaction();

        logger.info('PAYMENT_PROCESSED_SUCCESS', {
            paymentId,
            logId: log.id,
            ticketsCreated: allTickets.length,
            extrasCreated: allExtras.length,
            userId,
            organizerId: actualOrganizerId,
            promoterId: promoterInfo?.promoterId,
            promoterCommission: promoterInfo?.commissionAmount
        });

        if (user.email) {
            sendTicketEmail(
                user.email,
                allTickets,
                ticketTypes[0],
                ticketTypes[0].event,
                user
            ).catch(err => {
                logger.error('PAYMENT_EMAIL_ERROR', { paymentId, error: err?.message });
            });

            if (allExtras.length > 0) {
                const eventForExtras = allExtras[0].eventProduct?.event || (ticketTypes.length > 0 ? ticketTypes[0].event : null);
                if (eventForExtras) {
                    enviarCorreoConExtras(
                        user.email,
                        allExtras.map(e => ({
                            qrCode: e.qrCode!,
                            productName: e.eventProduct.product.name,
                            quantity: e.quantity,
                            eventTitle: eventForExtras.title,
                            eventDate: `${eventForExtras.date} ${eventForExtras.time}`,
                            eventLocation: eventForExtras.direccion || '',
                            buyerName: `${user.firstname || ''} ${user.lastname || ''}`.trim()
                        }))
                    ).catch(err => {
                        logger.error('PAYMENT_EXTRA_EMAIL_ERROR', { paymentId, error: err?.message });
                    });
                }
            }

            if (user.isGuestAccount) {
                createAccountClaimToken(user)
                    .then(claim => sendAccountClaimEmail(
                        user.email,
                        (user.firstname || '') + ' ' + (user.lastname || '').trim(),
                        claim.claimUrl
                    ))
                    .catch(err => {
                        logger.error('PAYMENT_CLAIM_EMAIL_ERROR', { paymentId, userId: user.id, error: err?.message });
                    });
            }
        }

        return {
            success: true,
            tickets: allTickets.length > 0 ? allTickets : undefined,
            extras: allExtras.length > 0 ? allExtras : undefined,
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
