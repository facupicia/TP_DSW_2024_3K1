import { MercadoPagoConfig, Payment } from 'mercadopago';
import AppDataSource from "../db";
import { PaymentLog, PaymentStatus } from "./payment.entity"; // <--- 1. IMPORTAR PaymentStatus
import { User } from "../user/user.entity";
import { Event } from "../event/event.entity";
import { Ticket } from "../ticket/ticket.entity";
import { createTicketsForPurchase } from "../services/ticket.service";
import enviarCorreoConQR from "../lib/mailer";
import { logger } from "../lib/logger";

const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN || '' });
const paymentClient = new Payment(client);

export const processPaymentTransaction = async (paymentId: string) => {
    try {
        const payment = await paymentClient.get({ id: paymentId });
        
        if (payment.status !== 'approved') {
            logger.info("PAYMENT_NOT_APPROVED", { id: paymentId, status: payment.status });
            return; 
        }

        const meta = payment.metadata || {};
        const additional = payment.additional_info || {};
        const item = Array.isArray(additional.items) ? additional.items[0] : undefined;

        let userId = Number(meta.user_id);
        let eventId = Number(meta.event_id || item?.id);
        let amount = Number(meta.amount_tickets || item?.quantity || 1);

        if ((!userId || !eventId || !amount) && payment.external_reference) {
            const parts = String(payment.external_reference).split('|');
            userId = Number(parts[0]);
            eventId = Number(parts[1]);
            amount = Number(parts[2]);
        }

        if (!userId || !eventId || !amount || amount <= 0) {
            logger.error("WEBHOOK_INVALID_METADATA", { paymentId, userId, eventId, amount });
            return;
        }

        const queryRunner = AppDataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            const existingLog = await queryRunner.manager.findOne(PaymentLog, { where: { mpPaymentId: String(paymentId) } });
            
            if (existingLog) {
                logger.info("PAYMENT_ALREADY_PROCESSED", { id: paymentId });
                await queryRunner.rollbackTransaction();
                return;
            }

            // B. Guardar Log inicial (SE GUARDA COMO PROCESSING POR DEFECTO)
            const log = queryRunner.manager.create(PaymentLog, {
                mpPaymentId: String(paymentId),
                externalReference: String(payment.external_reference || ''),
                userId,
                eventId,
                amount
            });
            await queryRunner.manager.save(log);

            const user = await queryRunner.manager.findOne(User, { where: { id: userId } });
            if (!user) throw new Error(`User not found: ${userId}`);

            const event = await queryRunner.manager
                .createQueryBuilder(Event, "e")
                .setLock("pessimistic_write") 
                .where("e.id = :id", { id: eventId })
                .getOne();

            if (!event) throw new Error(`Event not found: ${eventId}`);

            const ticketsSold = await queryRunner.manager.count(Ticket, { where: { event: { id: event.id } } });
            const availableStock = event.capacity - ticketsSold; 

            if (availableStock < amount) {
                logger.warn("WEBHOOK_NO_STOCK", { eventId, availableStock, requested: amount });
                // Aquí deberías marcar el log como FAILED si quisieras llevar registro de fallos de stock
                log.status = PaymentStatus.FAILED; 
                await queryRunner.manager.save(log);
                
                await queryRunner.commitTransaction(); // Commit para guardar el log de fallo
                return;
            }

            event.capacity -= amount; 
            await queryRunner.manager.save(event);

            const tickets = await createTicketsForPurchase(event, user, amount);
            await queryRunner.manager.save(Ticket, tickets);

            // ========================================================
            // CORRECCIÓN AQUÍ: ACTUALIZAR EL ESTADO A COMPLETED
            // ========================================================
            log.status = PaymentStatus.COMPLETED;
            await queryRunner.manager.save(log);

            await queryRunner.commitTransaction();
            logger.info("TICKETS_CREATED_SUCCESS", { paymentId, amount, ticketIds: tickets.map(t => t.id) });

            if (user.email) {
                try {
                    await enviarCorreoConQR(user.email, tickets.map(t => ({ qrCode: t.qrCode!, ticketId: t.id })));
                } catch (mailError) {
                    logger.error("MAIL_SEND_ERROR", { paymentId, error: mailError });
                }
            }

        } catch (err: any) {
            await queryRunner.rollbackTransaction();
            throw err;
        } finally {
            await queryRunner.release();
        }

    } catch (error: any) {
        logger.error("PROCESS_PAYMENT_ERROR", { paymentId, error: error?.message || error });
    }
};