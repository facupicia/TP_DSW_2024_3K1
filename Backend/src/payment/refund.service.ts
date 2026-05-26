import crypto from 'crypto';
import { In, Between } from 'typeorm';
import AppDataSource from '../db';
import { PaymentLog, PaymentStatus } from './payment.entity';
import { Ticket, TicketStatus } from '../ticket/ticket.entity';
import { TicketType } from '../ticketType/ticketType.entity';
import { ExtraItem, ExtraItemStatus } from '../extra/extraItem.entity';
import { EventProduct } from '../extra/eventProduct.entity';
import { User } from '../user/user.entity';
import { logger } from '../common/services/logger';
import { decryptFromString } from '../common/services/encryption';
import { getMPConfig } from './mp.config';

/**
 * Refund Service
 * 
 * Maneja reembolsos de pagos tanto para la plataforma como para marketplace.
 */

export interface RefundResult {
    success: boolean;
    refundId?: string;
    amountRefunded?: number;
    message: string;
    error?: string;
    warning?: string;
}

/**
 * Procesa un reembolso completo o parcial usando la API de MercadoPago
 */
async function getAccessTokenForRefund(organizerId?: number | null): Promise<string | null> {
    if (organizerId) {
        const userRepo = AppDataSource.getRepository(User);
        const user = await userRepo
            .createQueryBuilder('user')
            .select(['user.id', 'user.mpAccessToken'])
            .where('user.id = :id', { id: organizerId })
            .getOne();
        if (user?.mpAccessToken) {
            const decrypted = decryptFromString(user.mpAccessToken);
            if (decrypted) return decrypted;
        }
    }
    const config = getMPConfig();
    return config.accessToken || null;
}

export async function processRefund(
    paymentId: string,
    options: {
        amount?: number;
        reason?: string;
        requestedBy: number;
        requesterRoles?: string[];
    }
): Promise<RefundResult> {
    logger.info('REFUND_START', {
        paymentId,
        hasAmount: options.amount !== undefined,
        requestedBy: options.requestedBy,
        requesterRoles: options.requesterRoles
    });

    // 1. Validate payment locally (no transaction lock to avoid blocking DB during MP API call)
    const paymentLogRepo = AppDataSource.getRepository(PaymentLog);
    const paymentLog = await paymentLogRepo.findOne({
        where: { mpPaymentId: paymentId }
    });

    if (!paymentLog) {
        return {
            success: false,
            message: 'Payment not found in system'
        };
    }

    const isAdmin = options.requesterRoles?.includes('admin') || false;
    if (!isAdmin && paymentLog.organizerId !== options.requestedBy) {
        return {
            success: false,
            message: 'No tienes permiso para reembolsar este pago'
        };
    }

    if (paymentLog.status === PaymentStatus.REFUNDED) {
        return {
            success: false,
            message: 'Payment already refunded'
        };
    }

    if (paymentLog.status !== PaymentStatus.COMPLETED) {
        return {
            success: false,
            message: 'Only completed payments can be refunded'
        };
    }

    const totalAmount = Number(paymentLog.totalAmount);
    const requestedAmount = options.amount === undefined ? totalAmount : Number(options.amount);

    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0 || requestedAmount > totalAmount) {
        return {
            success: false,
            message: 'Invalid refund amount'
        };
    }

    if (Math.abs(requestedAmount - totalAmount) > 0.01) {
        return {
            success: false,
            message: 'Partial refunds are disabled until ticket-level refund tracking is available'
        };
    }

    // 2. Find tickets and extras to cancel (needed for DB update later)
    const ticketRepo = AppDataSource.getRepository(Ticket);
    const extraItemRepo = AppDataSource.getRepository(ExtraItem);

    let ticketsToCancel = await ticketRepo
        .createQueryBuilder("ticket")
        .select(["ticket.id", "ticket.ticketTypeId"])
        .where('"paymentLogId" = :paymentLogId', { paymentLogId: paymentLog.id })
        .andWhere('status = :active', { active: TicketStatus.ACTIVE })
        .getMany();

    let extrasToCancel = await extraItemRepo
        .createQueryBuilder("extraItem")
        .select(["extraItem.id", "extraItem.eventProductId", "extraItem.quantity"])
        .where('"paymentLogId" = :paymentLogId', { paymentLogId: paymentLog.id })
        .andWhere('status = :active', { active: ExtraItemStatus.ACTIVE })
        .getMany();

    if (ticketsToCancel.length === 0 && extrasToCancel.length === 0) {
        const paymentTime = paymentLog.createdAt;
        const timeWindowStart = new Date(paymentTime.getTime() - 5 * 60 * 1000);
        const timeWindowEnd = new Date(paymentTime.getTime() + 5 * 60 * 1000);

        ticketsToCancel = await ticketRepo
            .createQueryBuilder("ticket")
            .select(["ticket.id", "ticket.ticketTypeId"])
            .where('"userId" = :userId', { userId: paymentLog.userId })
            .andWhere('status = :active', { active: TicketStatus.ACTIVE })
            .andWhere('"createdAt" BETWEEN :start AND :end', { start: timeWindowStart, end: timeWindowEnd })
            .orderBy('"createdAt"', "DESC")
            .take(paymentLog.quantity)
            .getMany();

        extrasToCancel = await extraItemRepo
            .createQueryBuilder("extraItem")
            .select(["extraItem.id", "extraItem.eventProductId", "extraItem.quantity"])
            .where('"userId" = :userId', { userId: paymentLog.userId })
            .andWhere('status = :active', { active: ExtraItemStatus.ACTIVE })
            .andWhere('"createdAt" BETWEEN :start AND :end', { start: timeWindowStart, end: timeWindowEnd })
            .orderBy('"createdAt"', "DESC")
            .getMany();

        if (ticketsToCancel.length === 0 && extrasToCancel.length === 0) {
            ticketsToCancel = await ticketRepo
                .createQueryBuilder("ticket")
                .select(["ticket.id", "ticket.ticketTypeId"])
                .where('"userId" = :userId', { userId: paymentLog.userId })
                .andWhere('status = :active', { active: TicketStatus.ACTIVE })
                .orderBy('"createdAt"', "DESC")
                .take(paymentLog.quantity)
                .getMany();

            extrasToCancel = await extraItemRepo
                .createQueryBuilder("extraItem")
                .select(["extraItem.id", "extraItem.eventProductId", "extraItem.quantity"])
                .where('"userId" = :userId', { userId: paymentLog.userId })
                .andWhere('status = :active', { active: ExtraItemStatus.ACTIVE })
                .orderBy('"createdAt"', "DESC")
                .getMany();
        }
    }

    // 3. Get access token early to fail fast if not available
    const accessToken = await getAccessTokenForRefund(paymentLog.organizerId);
    if (!accessToken) {
        logger.error('REFUND_NO_ACCESS_TOKEN', { paymentId });
        return {
            success: false,
            message: 'Refund cannot be initiated: no access token configured.'
        };
    }

    const refundData: any = {};
    if (options.amount !== undefined) {
        refundData.amount = requestedAmount;
    }

    const idempotencyKey = crypto.randomUUID();

    // 4. Update DB state FIRST, before calling MercadoPago.
    // This guarantees internal consistency. If MP fails afterward,
    // we log the inconsistency for manual reconciliation.
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        await queryRunner.manager.update(
            PaymentLog,
            { id: paymentLog.id },
            {
                status: PaymentStatus.REFUNDED,
                refundedAt: new Date(),
                refundedBy: options.requestedBy,
                refundReason: options.reason,
                refundAmount: requestedAmount
            }
        );

        if (ticketsToCancel.length > 0) {
            await queryRunner.manager.getRepository(Ticket).update(
                { id: In(ticketsToCancel.map(ticket => ticket.id)) },
                { status: TicketStatus.CANCELLED }
            );
        }

        if (extrasToCancel.length > 0) {
            await queryRunner.manager.getRepository(ExtraItem).update(
                { id: In(extrasToCancel.map(extra => extra.id)) },
                { status: ExtraItemStatus.CANCELLED }
            );
        }

        // Restore stock per ticket type
        const cancelledByType: Record<number, number> = {};
        for (const t of ticketsToCancel) {
            cancelledByType[t.ticketTypeId] = (cancelledByType[t.ticketTypeId] || 0) + 1;
        }
        for (const [ticketTypeId, count] of Object.entries(cancelledByType)) {
            await queryRunner.manager.getRepository(TicketType)
                .createQueryBuilder()
                .update()
                .set({ soldCount: () => `GREATEST("soldCount" - ${count}, 0)` })
                .where('id = :id', { id: Number(ticketTypeId) })
                .execute();
        }

        // Restore stock per event product
        const cancelledByExtra: Record<number, number> = {};
        for (const e of extrasToCancel) {
            cancelledByExtra[e.eventProductId] = (cancelledByExtra[e.eventProductId] || 0) + e.quantity;
        }
        for (const [eventProductId, count] of Object.entries(cancelledByExtra)) {
            await queryRunner.manager.getRepository(EventProduct)
                .createQueryBuilder()
                .update()
                .set({ soldCount: () => `GREATEST("soldCount" - ${count}, 0)` })
                .where('id = :id', { id: Number(eventProductId) })
                .execute();
        }

        await queryRunner.commitTransaction();
    } catch (error: any) {
        if (queryRunner.isTransactionActive) {
            await queryRunner.rollbackTransaction();
        }
        logger.error('REFUND_DB_ERROR', {
            paymentId,
            error: error.message
        });
        return {
            success: false,
            message: 'Local refund processing failed. No changes were made in MercadoPago.',
            error: error.message
        };
    } finally {
        await queryRunner.release();
    }

    // 5. Call MercadoPago refund API AFTER DB commit.
    let mpResponse: Response;
    try {
        mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}/refunds`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'X-Idempotency-Key': idempotencyKey
            },
            body: JSON.stringify(refundData),
            signal: AbortSignal.timeout(15000)
        });
    } catch (networkError: any) {
        logger.error('REFUND_MP_NETWORK_ERROR', { paymentId, error: networkError.message });
        logger.warn('REFUND_INCONSISTENCY', {
            paymentId,
            message: 'DB was updated to REFUNDED but MercadoPago API call failed. Manual reconciliation required.'
        });
        return {
            success: true,
            warning: 'Local refund recorded but MercadoPago API unreachable. Contact support if the money was not returned.',
            message: 'Refund processed locally but MercadoPago confirmation failed.'
        };
    }

    if (!mpResponse.ok) {
        const errorText = await mpResponse.text();
        let errorData: any = { message: errorText };
        try { errorData = JSON.parse(errorText); } catch { /* ignore parse error */ }
        logger.error('REFUND_MP_API_ERROR', { paymentId, error: errorData });

        const errorMessage = errorData.message || errorText || String(mpResponse.status);
        if (errorMessage.toLowerCase().includes('already refunded') || errorMessage.toLowerCase().includes('ya fue reembolsado')) {
            // MP says already refunded, which aligns with our local state
            return {
                success: true,
                message: 'Payment already refunded in MercadoPago'
            };
        }
        if (errorMessage.toLowerCase().includes('cannot be refunded')) {
            logger.warn('REFUND_INCONSISTENCY', {
                paymentId,
                message: 'DB was updated to REFUNDED but MercadoPago rejects the refund. Manual reconciliation required.'
            });
            return {
                success: true,
                warning: 'Local refund recorded but MercadoPago rejected the refund. Contact support.',
                message: 'Refund processed locally but MercadoPago rejected it.'
            };
        }

        logger.warn('REFUND_INCONSISTENCY', {
            paymentId,
            message: 'DB was updated to REFUNDED but MercadoPago returned an error. Manual reconciliation required.'
        });
        return {
            success: true,
            warning: `Local refund recorded but MP returned an error: ${errorMessage}. Contact support.`,
            message: 'Refund processed locally but MercadoPago confirmation failed.'
        };
    }

    const refundResult = await mpResponse.json() as any;
    const refundId = String(refundResult.id);

    logger.info('REFUND_SUCCESS', {
        paymentId,
        refundId,
        amount: requestedAmount,
        cancelledTickets: ticketsToCancel.length
    });

    return {
        success: true,
        refundId,
        amountRefunded: requestedAmount,
        message: 'Refund processed successfully'
    };
}

/**
 * Obtiene el estado de reembolso de un pago
 */
export async function getRefundStatus(paymentId: string, requestedBy?: number, requesterRoles: string[] = []): Promise<{
    canRefund: boolean;
    alreadyRefunded: boolean;
    refundAmount?: number;
    maxRefundAmount?: number;
    message: string;
}> {
    try {
        const paymentLogRepo = AppDataSource.getRepository(PaymentLog);
        const paymentLog = await paymentLogRepo.findOne({
            where: { mpPaymentId: paymentId }
        });
        
        if (!paymentLog) {
            return {
                canRefund: false,
                alreadyRefunded: false,
                message: 'Payment not found'
            };
        }

        const isAdmin = requesterRoles.includes('admin');
        if (!isAdmin && paymentLog.organizerId !== requestedBy) {
            return {
                canRefund: false,
                alreadyRefunded: false,
                message: 'No tienes permiso para consultar este reembolso'
            };
        }
        
        if (paymentLog.status === PaymentStatus.REFUNDED) {
            return {
                canRefund: false,
                alreadyRefunded: true,
                refundAmount: paymentLog.refundAmount,
                message: 'Payment already refunded'
            };
        }
        
        if (paymentLog.status !== PaymentStatus.COMPLETED) {
            return {
                canRefund: false,
                alreadyRefunded: false,
                message: 'Payment not completed'
            };
        }
        
        return {
            canRefund: true,
            alreadyRefunded: false,
            maxRefundAmount: Number(paymentLog.totalAmount),
            message: 'Payment can be refunded'
        };
        
    } catch (error: any) {
        logger.error('REFUND_STATUS_ERROR', { paymentId, error: error.message });
        return {
            canRefund: false,
            alreadyRefunded: false,
            message: 'Error checking refund status'
        };
    }
}
