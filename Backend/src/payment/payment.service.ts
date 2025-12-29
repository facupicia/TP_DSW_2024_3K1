import { MercadoPagoConfig, Payment } from 'mercadopago';
import AppDataSource from "../db";
import { PaymentLog, PaymentStatus } from "./payment.entity"; 
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

        // --- LÓGICA DE EXTRACCIÓN ROBUSTA ---
        let userId = 0;
        let eventId = 0;
        let amount = 0;

        // 1. Prioridad: External Reference (Conciliación Financiera)
        if (payment.external_reference) {
            const parts = String(payment.external_reference).split('|');
            if (parts.length === 3) {
                userId = Number(parts[0]);
                eventId = Number(parts[1]);
                amount = Number(parts[2]);
            }
        }

        // 2. Fallback: Metadata (Si external_reference falló o no vino)
        if (!userId || !eventId) {
            const meta = payment.metadata || {};
            const additional = payment.additional_info || {};
            const item = Array.isArray(additional.items) ? additional.items[0] : undefined;

            userId = Number(meta.user_id);
            eventId = Number(meta.event_id || item?.id);
            amount = Number(meta.amount_tickets || item?.quantity || 1);
        }

        if (!userId || !eventId || !amount || amount <= 0) {
            logger.error("WEBHOOK_DATA_MISSING", { paymentId, userId, eventId, amount });
            return;
        }
        // -------------------------------------

        const queryRunner = AppDataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            // Log de idempotencia (Evita procesar el mismo pago dos veces)
            const log = queryRunner.manager.create(PaymentLog, {
                mpPaymentId: String(paymentId),
                externalReference: String(payment.external_reference || ''),
                userId,
                eventId,
                amount,
                status: PaymentStatus.PROCESSING
            });
            
            try {
                await queryRunner.manager.save(log);
            } catch (e: any) {
                // Si ya existe (código de error de unicidad en BD), ignoramos
                if (e?.code === '23505' || e?.message?.includes('unique')) {
                    logger.info("PAYMENT_ALREADY_PROCESSED", { id: paymentId });
                    await queryRunner.rollbackTransaction();
                    return;
                }
                throw e;
            }

            const user = await queryRunner.manager.findOne(User, { where: { id: userId } });
            if (!user) throw new Error(`User not found: ${userId}`);

            const event = await queryRunner.manager
                .createQueryBuilder(Event, "e")
                .setLock("pessimistic_write") // Bloqueo para evitar sobreventa concurrente
                .where("e.id = :id", { id: eventId })
                .getOne();

            if (!event) throw new Error(`Event not found: ${eventId}`);

            // Validación de Stock en tiempo real
            const ticketsSold = await queryRunner.manager.count(Ticket, { where: { event: { id: event.id } } });
            const availableStock = event.capacity - ticketsSold;

            if (availableStock < amount) {
                logger.warn("WEBHOOK_NO_STOCK", { eventId, availableStock, requested: amount });
                // Marcamos el pago como fallido en nuestro log
                await queryRunner.manager.update(PaymentLog, log.id, { status: PaymentStatus.FAILED });
                await queryRunner.commitTransaction();
                return;
            }

            // Crear Tickets
            const tickets = await createTicketsForPurchase(event, user, amount);
            await queryRunner.manager.save(Ticket, tickets);

            // Actualizar estado del log a COMPLETADO
            await queryRunner.manager.update(PaymentLog, log.id, { status: PaymentStatus.COMPLETED });

            await queryRunner.commitTransaction();
            logger.info("TICKETS_CREATED", { paymentId, amount });

            // Enviar Email (Fuera de la transacción para no bloquear)
            if (user.email) {
                try {
                    const dateObj = new Date(event.date);
                    const formattedDate = !isNaN(dateObj.getTime())
                        ? dateObj.toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
                        : String(event.date);

                    await enviarCorreoConQR(user.email, tickets.map(t => ({
                        qrCode: t.qrCode!,
                        ticketId: t.id,
                        eventTitle: event.title,
                        eventDate: `${formattedDate} ${event.time}`,
                        eventLocation: event.location,
                        buyerName: `${user.firstname} ${user.lastname}`
                    })));
                } catch (mailError) {
                    logger.error("MAIL_ERROR", { paymentId });
                }
            }

        } catch (err: any) {
            await queryRunner.rollbackTransaction();
            throw err;
        } finally {
            await queryRunner.release();
        }

    } catch (error: any) {
        logger.error("PROCESS_PAYMENT_FATAL", { paymentId, error: error?.message });
    }
};