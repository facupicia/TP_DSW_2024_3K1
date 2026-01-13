import { MercadoPagoConfig, Payment } from 'mercadopago';
import AppDataSource from "../db";
import { PaymentLog, PaymentStatus } from "./payment.entity";
import { User } from "../user/user.entity";
import { Event } from "../event/event.entity";
import { Ticket } from "../ticket/ticket.entity";
import { TicketType } from "../ticketType/ticketType.entity";
import { createTicketsForPurchase } from "../services/ticket.service";
import enviarCorreoConQR from "../lib/mailer";
import { logger } from "../lib/logger";
import { getActiveSubscription } from "../subscription/subscription.service";

const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN || '' });
const paymentClient = new Payment(client);

export const processPaymentTransaction = async (paymentId: string) => {
    try {
        // Retry logic para manejar delay de propagación de estado en MP
        let payment: any = null;
        let attempts = 0;
        const maxAttempts = 3;
        const delayMs = 2000; // 2 segundos entre reintentos

        while (attempts < maxAttempts) {
            payment = await paymentClient.get({ id: paymentId });

            console.log(`MP_PAYMENT_RESPONSE (attempt ${attempts + 1}):`, JSON.stringify({
                id: payment.id,
                status: payment.status,
                status_detail: payment.status_detail,
                external_reference: payment.external_reference
            }, null, 2));

            if (payment.status === 'approved') {
                break; // Pago aprobado, salir del loop
            }

            attempts++;
            if (attempts < maxAttempts) {
                console.log(`Payment not approved yet, retrying in ${delayMs}ms...`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }

        if (payment.status !== 'approved') {
            logger.info("PAYMENT_NOT_APPROVED", { id: paymentId, status: payment.status, attempts });
            return;
        }

        // --- LÓGICA DE EXTRACCIÓN ROBUSTA ---
        let userId = 0;
        let ticketTypeId = 0;
        let amount = 0;
        // eventId lo sacaremos del TicketType

        // 1. Prioridad: External Reference (Conciliación Financiera)
        if (payment.external_reference) {
            const parts = String(payment.external_reference).split('|');
            if (parts.length === 3) {
                userId = Number(parts[0]);
                ticketTypeId = Number(parts[1]); // AHORA ES TICKET_TYPE_ID
                amount = Number(parts[2]);
            }
        }

        // 2. Fallback: Metadata (Si external_reference falló o no vino)
        if (!userId || !ticketTypeId) {
            const meta = payment.metadata || {};
            const additional = payment.additional_info || {};
            const item = Array.isArray(additional.items) ? additional.items[0] : undefined;

            userId = Number(meta.user_id);
            ticketTypeId = Number(meta.ticket_type_id || item?.id);
            amount = Number(meta.amount_tickets || item?.quantity || 1);
        }

        if (!userId || !ticketTypeId || !amount || amount <= 0) {
            logger.error("WEBHOOK_DATA_MISSING", { paymentId, userId, ticketTypeId, amount });
            return;
        }
        // -------------------------------------

        const queryRunner = AppDataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            // Buscamos primero el ticketType para saber el eventId y validar
            const ticketType = await queryRunner.manager.findOne(TicketType, {
                where: { id: ticketTypeId },
                relations: ["event"]
            });

            if (!ticketType) {
                logger.error("TICKET_TYPE_NOT_FOUND", { ticketTypeId });
                // No podemos registrar log asociado a evento si no tenemos el ticketType... 
                // Pero intentamos registrar con eventId 0 o algo para auditoria?
                // Mejor abortar o registrar log de error.
                throw new Error(`TicketType not found: ${ticketTypeId}`);
            }

            const eventId = ticketType.event.id;
            const organizerId = ticketType.event.user_id;

            // ============ GET ORGANIZER'S SUBSCRIPTION FOR COMMISSION ============
            let commissionPercent = 8.00; // Default to FREE plan commission
            let organizerPlanName = 'FREE';

            try {
                const organizerSubscription = await getActiveSubscription(organizerId);
                commissionPercent = Number(organizerSubscription.plan.commissionPercent);
                organizerPlanName = organizerSubscription.plan.name;
            } catch (subError) {
                logger.warn("SUBSCRIPTION_FETCH_ERROR", { organizerId, error: (subError as any)?.message });
                // Continue with default FREE commission
            }

            const totalAmount = Number(ticketType.price) * amount;
            const commissionAmount = (totalAmount * commissionPercent) / 100;
            // =====================================================================

            // Log de idempotencia (Evita procesar el mismo pago dos veces)
            const log = queryRunner.manager.create(PaymentLog, {
                mpPaymentId: String(paymentId),
                externalReference: String(payment.external_reference || ''),
                userId,
                ticketTypeId,
                unitPrice: Number(ticketType.price),
                quantity: amount,
                totalAmount,
                commissionPercent,
                commissionAmount,
                organizerPlanName,
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

            // OPTIMIZACIÓN: Actualización atómica de stock sin bloqueo pesimista
            // Incrementamos soldCount solo si no supera la capacidad del TicketType
            const updateResult = await queryRunner.manager
                .createQueryBuilder()
                .update(TicketType)
                .set({ soldCount: () => `"soldCount" + ${amount}` })
                .where("id = :id", { id: ticketTypeId })
                .andWhere("(\"soldCount\" + :amount) <= capacity", { amount })
                .execute();

            if (updateResult.affected === 0) {
                // Si no se actualizó ninguna fila, es porque no hay stock o el ticketType no existe
                logger.warn("WEBHOOK_NO_STOCK_ATOMIC", { ticketTypeId, requested: amount });
                // Marcamos el pago como fallido en nuestro log
                await queryRunner.manager.update(PaymentLog, log.id, { status: PaymentStatus.FAILED });
                await queryRunner.commitTransaction();
                return;
            }

            // Crear Tickets
            // Necesitamos pasarle el ticketType actualizado? createTicketsForPurchase usa ticketType para precio y ID.
            // El objeto ticketType que tenemos 'ticketType' tiene los datos (aunque soldCount viejo, pero precio y ID sirven).
            const tickets = await createTicketsForPurchase(ticketType, user, amount);
            await queryRunner.manager.save(Ticket, tickets);

            // Actualizar estado del log a COMPLETADO
            await queryRunner.manager.update(PaymentLog, log.id, { status: PaymentStatus.COMPLETED });

            await queryRunner.commitTransaction();
            logger.info("TICKETS_CREATED", { paymentId, amount });

            // Enviar Email (Fuera de la transacción para no bloquear)
            if (user.email) {
                try {
                    const event = ticketType.event;
                    const dateObj = new Date(event.date);
                    const formattedDate = !isNaN(dateObj.getTime())
                        ? dateObj.toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
                        : String(event.date);

                    await enviarCorreoConQR(user.email, tickets.map(t => ({
                        qrCode: t.qrCode!,
                        ticketId: t.id,
                        eventTitle: event.title,
                        eventDate: `${formattedDate} ${event.time}`,
                        eventLocation: event.direccion,
                        buyerName: `${user.firstname} ${user.lastname}`,
                        ticketType: ticketType.name
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