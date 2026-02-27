import { MercadoPagoConfig, Payment } from 'mercadopago';
import AppDataSource from '../db';
import { PaymentLog, PaymentStatus } from './payment.entity';
import { Ticket, TicketStatus } from '../ticket/ticket.entity';
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
    }
): Promise<RefundResult> {
    logger.info('REFUND_START', { paymentId, options });
    
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    
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
        
        // 2. Verificar que no esté ya reembolsado
        if (paymentLog.status === PaymentStatus.REFUNDED) {
            return {
                success: false,
                message: 'Payment already refunded'
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
        if (options.amount) {
            refundData.amount = options.amount;
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
        
        // 5. Actualizar estado en nuestra BD
        await paymentLogRepo.update(
            { id: paymentLog.id },
            {
                status: PaymentStatus.REFUNDED,
                refundedAt: new Date(),
                refundedBy: options.requestedBy,
                refundReason: options.reason,
                refundAmount: options.amount || paymentLog.totalAmount
            }
        );
        
        // 6. Invalidar tickets - buscar por userId y ticketTypeId
        const ticketRepo = queryRunner.manager.getRepository(Ticket);
        
        // Buscar tickets activos de este usuario para este tipo de ticket
        // que fueron creados aproximadamente al mismo tiempo que el pago
        const paymentTime = paymentLog.createdAt;
        const fiveMinutesBefore = new Date(paymentTime.getTime() - 5 * 60 * 1000);
        const fiveMinutesAfter = new Date(paymentTime.getTime() + 5 * 60 * 1000);
        
        await ticketRepo
            .createQueryBuilder()
            .update(Ticket)
            .set({ 
                status: TicketStatus.CANCELLED
            })
            .where('"userId" = :userId', { userId: paymentLog.userId })
            .andWhere('"ticketTypeId" = :ticketTypeId', { ticketTypeId: paymentLog.ticketTypeId })
            .andWhere('"createdAt" BETWEEN :start AND :end', { 
                start: fiveMinutesBefore, 
                end: fiveMinutesAfter 
            })
            .andWhere('status != :cancelled', { cancelled: TicketStatus.CANCELLED })
            .execute();
        
        // 7. Restaurar stock
        const ticketTypeRepo = queryRunner.manager.getRepository(require('../ticketType/ticketType.entity').TicketType);
        await ticketTypeRepo
            .createQueryBuilder()
            .update()
            .set({ soldCount: () => `GREATEST("soldCount" - ${paymentLog.quantity}, 0)` })
            .where('id = :id', { id: paymentLog.ticketTypeId })
            .execute();
        
        await queryRunner.commitTransaction();
        
        logger.info('REFUND_SUCCESS', {
            paymentId,
            refundId: refundResult.id,
            amount: options.amount || paymentLog.totalAmount
        });
        
        return {
            success: true,
            refundId: String(refundResult.id),
            amountRefunded: options.amount || paymentLog.totalAmount,
            message: 'Refund processed successfully'
        };
        
    } catch (error: any) {
        await queryRunner.rollbackTransaction();
        
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
export async function getRefundStatus(paymentId: string): Promise<{
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
