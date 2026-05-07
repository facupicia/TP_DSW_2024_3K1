import { MercadoPagoConfig, Payment } from 'mercadopago';
import { In } from 'typeorm';
import AppDataSource from '../db';
import { PaymentLog, PaymentStatus } from './payment.entity';
import { Ticket, TicketStatus } from '../ticket/ticket.entity';
import { TicketType } from '../ticketType/ticketType.entity';
import { logger } from '../common/services/logger';
import { getPlatformMPClient, getOrganizerMPClient } from './payment.core';

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

    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        // 1. Buscar el pago en nuestra base de datos con bloqueo pesimista
        const paymentLog = await queryRunner.manager
            .createQueryBuilder(PaymentLog, 'log')
            .setLock('pessimistic_write')
            .where('log.mpPaymentId = :mpPaymentId', { mpPaymentId: paymentId })
            .getOne();

        if (!paymentLog) {
            await queryRunner.rollbackTransaction();
            return {
                success: false,
                message: 'Payment not found in system'
            };
        }

        const isAdmin = options.requesterRoles?.includes('admin') || false;
        if (!isAdmin && paymentLog.organizerId !== options.requestedBy) {
            await queryRunner.rollbackTransaction();
            return {
                success: false,
                message: 'No tienes permiso para reembolsar este pago'
            };
        }

        if (paymentLog.status === PaymentStatus.REFUNDED) {
            await queryRunner.rollbackTransaction();
            return {
                success: false,
                message: 'Payment already refunded'
            };
        }

        if (paymentLog.status !== PaymentStatus.COMPLETED) {
            await queryRunner.rollbackTransaction();
            return {
                success: false,
                message: 'Only completed payments can be refunded'
            };
        }

        const totalAmount = Number(paymentLog.totalAmount);
        const requestedAmount = options.amount === undefined ? totalAmount : Number(options.amount);

        if (!Number.isFinite(requestedAmount) || requestedAmount <= 0 || requestedAmount > totalAmount) {
            await queryRunner.rollbackTransaction();
            return {
                success: false,
                message: 'Invalid refund amount'
            };
        }

        if (Math.abs(requestedAmount - totalAmount) > 0.01) {
            await queryRunner.rollbackTransaction();
            return {
                success: false,
                message: 'Partial refunds are disabled until ticket-level refund tracking is available'
            };
        }

        // 2. Hacer el reembolso en MP dentro de la transacción
        const accessToken = await getAccessTokenForRefund(paymentLog.organizerId);
        if (!accessToken) {
            await queryRunner.rollbackTransaction();
            return {
                success: false,
                message: 'No access token available for refund'
            };
        }

        const refundData: any = {};
        if (options.amount !== undefined) {
            refundData.amount = requestedAmount;
        }

        const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}/refunds`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(refundData),
            signal: AbortSignal.timeout(15000)
        });

        if (!mpResponse.ok) {
            const errorText = await mpResponse.text();
            let errorData: any = { message: errorText };
            try { errorData = JSON.parse(errorText); } catch { /* ignore parse error */ }
            throw new Error(errorData.message || `MP API error: ${mpResponse.status}`);
        }

        const refundResult = await mpResponse.json();

        // 3. Actualizar estado en nuestra BD
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

        // 4. Invalidar tickets: buscar los tickets ACTIVE más recientes del usuario para este ticketType
        const ticketRepo = queryRunner.manager.getRepository(Ticket);

        const ticketsToCancel = await ticketRepo
            .createQueryBuilder("ticket")
            .select(["ticket.id"])
            .where('"userId" = :userId', { userId: paymentLog.userId })
            .andWhere('"ticketTypeId" = :ticketTypeId', { ticketTypeId: paymentLog.ticketTypeId })
            .andWhere('status = :active', { active: TicketStatus.ACTIVE })
            .orderBy('"createdAt"', "DESC")
            .take(paymentLog.quantity)
            .getMany();

        if (ticketsToCancel.length > 0) {
            await ticketRepo.update(
                { id: In(ticketsToCancel.map(ticket => ticket.id)) },
                { status: TicketStatus.CANCELLED }
            );
        }

        // 5. Restaurar stock
        const ticketTypeRepo = queryRunner.manager.getRepository(TicketType);
        const cancelledCount = ticketsToCancel.length;
        await ticketTypeRepo
            .createQueryBuilder()
            .update()
            .set({ soldCount: () => `GREATEST("soldCount" - ${cancelledCount}, 0)` })
            .where('id = :id', { id: paymentLog.ticketTypeId })
            .execute();

        await queryRunner.commitTransaction();

        logger.info('REFUND_SUCCESS', {
            paymentId,
            refundId: refundResult.id,
            amount: requestedAmount,
            cancelledTickets: cancelledCount
        });

        return {
            success: true,
            refundId: String(refundResult.id),
            amountRefunded: requestedAmount,
            message: 'Refund processed successfully'
        };

    } catch (error: any) {
        if (queryRunner.isTransactionActive) {
            await queryRunner.rollbackTransaction();
        }

        logger.error('REFUND_ERROR', {
            paymentId,
            error: error.message,
            code: error.code
        });

        if (error.message?.includes('already refunded')) {
            return {
                success: false,
                message: 'Payment already refunded in MercadoPago'
            };
        }

        if (error.message?.includes('cannot be refunded')) {
            return {
                success: false,
                message: 'This payment cannot be refunded'
            };
        }

        return {
            success: false,
            message: 'Error processing refund',
            error: error.message
        };
    } finally {
        await queryRunner.release();
    }
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
