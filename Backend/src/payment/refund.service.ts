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
export async function processRefund(
    paymentId: string,
    options: {
        amount?: number; // Si no se especifica, es reembolso total
        reason?: string;
        requestedBy: number; // User ID que solicita el reembolso
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
    
    try {
        // 1. Buscar el pago en nuestra base de datos
        const paymentLogRepo = queryRunner.manager.getRepository(PaymentLog);
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
        
        // 2. Verificar que no esté ya reembolsado
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
        
        // 3. Determinar si usamos token de plataforma u organizador
        let mpClient: MercadoPagoConfig;
        
        if (paymentLog.organizerId) {
            const organizerClient = await getOrganizerMPClient(paymentLog.organizerId);
            if (organizerClient) {
                mpClient = organizerClient;
            } else {
                mpClient = getPlatformMPClient();
            }
        } else {
            mpClient = getPlatformMPClient();
        }
        
        // 4. Hacer el reembolso en MP usando la API REST directamente
        // El SDK de MercadoPago no tiene método refund, usamos fetch
        const refundData: any = {};
        if (options.amount !== undefined) {
            refundData.amount = requestedAmount;
        }
        
        const accessToken = (mpClient as any).accessToken;
        const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}/refunds`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(refundData)
        });
        
        if (!mpResponse.ok) {
            const errorData = await mpResponse.json();
            throw new Error(errorData.message || `MP API error: ${mpResponse.status}`);
        }
        
        const refundResult = await mpResponse.json();

        await queryRunner.startTransaction();
        
        // 5. Actualizar estado en nuestra BD
        await paymentLogRepo.update(
            { id: paymentLog.id },
            {
                status: PaymentStatus.REFUNDED,
                refundedAt: new Date(),
                refundedBy: options.requestedBy,
                refundReason: options.reason,
                refundAmount: requestedAmount
            }
        );
        
        // 6. Invalidar tickets - buscar por userId y ticketTypeId
        const ticketRepo = queryRunner.manager.getRepository(Ticket);
        
        // Buscar tickets activos de este usuario para este tipo de ticket
        // que fueron creados aproximadamente al mismo tiempo que el pago
        const paymentTime = paymentLog.createdAt;
        const fiveMinutesBefore = new Date(paymentTime.getTime() - 5 * 60 * 1000);
        const fiveMinutesAfter = new Date(paymentTime.getTime() + 5 * 60 * 1000);
        
        const ticketsToCancel = await ticketRepo
            .createQueryBuilder("ticket")
            .select(["ticket.id"])
            .where('"userId" = :userId', { userId: paymentLog.userId })
            .andWhere('"ticketTypeId" = :ticketTypeId', { ticketTypeId: paymentLog.ticketTypeId })
            .andWhere('"createdAt" BETWEEN :start AND :end', { 
                start: fiveMinutesBefore, 
                end: fiveMinutesAfter 
            })
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
        
        // 7. Restaurar stock
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
        
        // Manejar errores específicos de MP
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
