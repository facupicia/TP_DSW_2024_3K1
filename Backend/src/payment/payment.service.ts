import { MercadoPagoConfig, Payment } from 'mercadopago';
import AppDataSource from "../db";
import { PaymentLog } from "./payment.entity";
import { User } from "../user/user.entity";
import { Event } from "../event/event.entity";
import { Ticket } from "../ticket/ticket.entity";
import { createTicketsForPurchase } from "../services/ticket.service";
import enviarCorreoConQR from "../lib/mailer";
import { logger } from "../lib/logger";

// Inicializar cliente de MP fuera de la función para reusar
const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN || '' });
const paymentClient = new Payment(client);

export const processPaymentTransaction = async (paymentId: string) => {
    try {
        // 1. Consultar estado real a la API de Mercado Pago
        const payment = await paymentClient.get({ id: paymentId });
        
        if (payment.status !== 'approved') {
            logger.info("PAYMENT_NOT_APPROVED", { id: paymentId, status: payment.status });
            return; 
        }

        // 2. Extraer Metadata (Lógica robusta para recuperar datos)
        const meta = payment.metadata || {};
        const additional = payment.additional_info || {};
        const item = Array.isArray(additional.items) ? additional.items[0] : undefined;

        let userId = Number(meta.user_id);
        let eventId = Number(meta.event_id || item?.id);
        let amount = Number(meta.amount_tickets || item?.quantity || 1);

        // Fallback: Si falla metadata, intentar leer external_reference
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

        // 3. INICIO DE TRANSACCIÓN
        const queryRunner = AppDataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            // A. Idempotencia: Verificar si ya procesamos este ID
            const existingLog = await queryRunner.manager.findOne(PaymentLog, { where: { mpPaymentId: String(paymentId) } });
            
            if (existingLog) {
                logger.info("PAYMENT_ALREADY_PROCESSED", { id: paymentId });
                await queryRunner.rollbackTransaction();
                return;
            }

            // B. Guardar Log inicial
            const log = queryRunner.manager.create(PaymentLog, {
                mpPaymentId: String(paymentId),
                externalReference: String(payment.external_reference || ''),
                userId,
                eventId,
                amount
            });
            await queryRunner.manager.save(log);

            // C. Buscar Usuario
            const user = await queryRunner.manager.findOne(User, { where: { id: userId } });
            if (!user) throw new Error(`User not found: ${userId}`);

            // D. Buscar Evento con BLOQUEO (Pessimistic Lock) para evitar sobreventa
            // Esto asegura que nadie más toque el stock mientras leemos/escribimos
            const event = await queryRunner.manager
                .createQueryBuilder(Event, "e")
                .setLock("pessimistic_write") 
                .where("e.id = :id", { id: eventId })
                .getOne();

            if (!event) throw new Error(`Event not found: ${eventId}`);

            // E. Validar Stock
            const ticketsSold = await queryRunner.manager.count(Ticket, { where: { event: { id: event.id } } });
            const availableStock = event.capacity - ticketsSold; // Ojo: Si capacity es el total, esto está bien.

            if (availableStock < amount) {
                logger.warn("WEBHOOK_NO_STOCK", { eventId, availableStock, requested: amount });
                // Importante: No lanzamos error para no reintentar infinitamente, simplemente abortamos la venta
                // Opcional: Podrías reembolsar aquí automáticamente.
                await queryRunner.rollbackTransaction();
                return;
            }

            // F. Actualizar Capacidad (Opcional, si usas capacity como stock restante)
            // Si usas capacity como "aforo total", no restes aquí. 
            // Según tu código anterior: event.capacity -= amount; 
            // Asumo que quieres restar el stock disponible:
            event.capacity -= amount; 
            await queryRunner.manager.save(event);

            // G. Generar Tickets
            const tickets = await createTicketsForPurchase(event, user, amount);
            await queryRunner.manager.save(Ticket, tickets);

            // H. Confirmar Transacción (Todo salió bien en la DB)
            await queryRunner.commitTransaction();
            logger.info("TICKETS_CREATED_SUCCESS", { paymentId, amount, ticketIds: tickets.map(t => t.id) });

            // 4. TAREAS FUERA DE TRANSACCIÓN (Emails)
            // Si falla el email, no queremos revertir la compra porque el usuario ya pagó.
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
        // Aquí podrías guardar en una tabla de "FailedWebhooks" para revisión manual
    }
};