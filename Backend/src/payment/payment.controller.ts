import { Response } from "express";
import { MercadoPagoConfig, Preference } from 'mercadopago';
import AppDataSource from "../db";
import { Event } from "../event/event.entity";
import { Ticket } from "../ticket/ticket.entity";
import { CustomRequest } from "../middlewares/authToken";
import { User } from "../user/user.entity";
import { TicketStatus } from "../ticket/ticket.entity";
import { generarQRUrl } from "../utils/qr";
import enviarCorreoConQR from "../lib/mailer";
import { randomUUID } from "crypto";
import dotenv from "dotenv";
import { PaymentLog } from "./payment.entity";

dotenv.config();

export const createPreference = async (req: CustomRequest, res: Response) => {
    // 1. INICIALIZAR CLIENTE AQUÍ ADENTRO (Más seguro)
    // Asegúrate de que tu .env tenga la clave: MP_ACCESS_TOKEN
    const accessToken = process.env.MP_ACCESS_TOKEN || '';
    if (!accessToken) {
        console.error("CONFIG_ERROR: MP_ACCESS_TOKEN no configurado");
        return res.status(500).json({ code: 'CONFIG_MISSING_MP_TOKEN', message: 'Payment gateway not configured' });
    }
    const client = new MercadoPagoConfig({ accessToken });

    const queryRunner = AppDataSource.createQueryRunner();
    // Conectamos más adelante, solo si las validaciones básicas pasan

    try {
        // DEBUG: MIRA ESTO EN TU TERMINAL CUANDO HAGAS CLICK EN PAGAR
        console.log("---- INICIANDO PREFERENCIA MERCADO PAGO ----");
        console.log("Token detectado:", process.env.MP_ACCESS_TOKEN ? "SÍ (Oculto)" : "NO DETECTADO (Revisar .env)");

        const { ticketQuantity, eventId } = req.body;
        const userId = req.user?.id;

        // Validaciones
        if (!userId) return res.status(401).json({ message: "No autorizado." });
        if (!eventId) return res.status(400).json({ message: "Falta eventId." });

        const quantity = parseInt(ticketQuantity);
        if (isNaN(quantity) || quantity <= 0) return res.status(400).json({ message: "Cantidad inválida." });

        // Conexión a DB y búsqueda de datos
        await queryRunner.connect();
        const user = await queryRunner.manager.findOne(User, { where: { id: userId } });
        const event = await queryRunner.manager.findOne(Event, { where: { id: parseInt(eventId) } });

        if (!user || !event) return res.status(404).json({ message: "Usuario o Evento no encontrado." });

        // Validación de Stock
        const ticketsSold = await queryRunner.manager.count(Ticket, { where: { event: { id: event.id } } });
        const availableStock = event.capacity - ticketsSold;

        if (availableStock < quantity) {
            return res.status(409).json({ message: `Sin stock. Quedan: ${availableStock}` });
        }

        // 2. VALIDAR DATOS DE EVENTO/PRECIO
        const unitPrice = Number(event.price);
        if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
            return res.status(400).json({ code: 'INVALID_PRICE', message: 'Precio del evento inválido' });
        }

        // 3. CREAR PREFERENCIA CON REINTENTOS
        const preference = new Preference(client);

        console.log(`Creando preferencia para User: ${user.email}, Event: ${event.id}, Price: ${event.price}`);


        const clientUrl = (process.env.CLIENT_URL || 'http://localhost:4200').replace(/\/+$/, '');
        const back_urls = {
            success: `${clientUrl}/checkout/success`,
            failure: `${clientUrl}/checkout/failure`,
            pending: `${clientUrl}/checkout/pending`,
        };
        const useAutoReturn = clientUrl.startsWith('https://'); // MP exige https para auto_return estable

        console.log("BACK_URLS:", back_urls, "AUTO_RETURN:", useAutoReturn ? 'approved' : 'disabled');

        const notificationUrl = process.env.MP_NOTIFICATION_URL;
        if (!notificationUrl) {
            console.warn("WEBHOOK_WARNING: MP_NOTIFICATION_URL no está configurado. No se recibirán notificaciones asíncronas de Mercado Pago.");
        }

        const isSandbox = !clientUrl.startsWith('https://');
        const testPayerEmail = process.env.MP_TEST_PAYER_EMAIL;
        const payerEmail = isSandbox && testPayerEmail ? testPayerEmail : user.email;
        if (isSandbox && !testPayerEmail) {
            console.warn("SANDBOX_WARNING: MP_TEST_PAYER_EMAIL no configurado. Usando email real del usuario; puede fallar con tarjetas de prueba.");
        }

        const body: any = {
            items: [
                {
                    id: event.id.toString(),
                    title: event.title.substring(0, 255),
                    quantity: quantity,
                    unit_price: unitPrice,
                    currency_id: 'ARS',
                }
            ],
            payer: {
                email: payerEmail,
                name: user.firstname || 'Usuario',
                surname: user.lastname || 'Genérico'
            },
            back_urls,
            metadata: {
                user_id: Number(userId),
                event_id: Number(event.id),
                amount_tickets: Number(quantity)
            }
        };
        if (useAutoReturn) {
            body.auto_return = 'approved';
        }
        if (notificationUrl) {
            body.notification_url = notificationUrl;
        }
        // Guardamos datos críticos también en external_reference para futura recuperación en el webhook
        body.external_reference = `${userId}|${event.id}|${quantity}`;

        let result: any;
        const maxAttempts = 3;
        let attempt = 0;
        let lastError: any = null;
        while (attempt < maxAttempts) {
            try {
                result = await preference.create({ body });
                break;
            } catch (err: any) {
                lastError = err;
                attempt++;
                console.error("Error al crear preferencia (intento " + attempt + "):", err?.message || err);
                if (attempt < maxAttempts) {
                    const delay = 250 * Math.pow(2, attempt - 1);
                    await new Promise(r => setTimeout(r, delay));
                }
            }
        }

        if (!result) {
            return res.status(502).json({
                code: 'PAYMENT_GATEWAY_UNAVAILABLE',
                message: 'No se pudo crear la preferencia en la pasarela de pagos',
                details: lastError?.message || lastError || 'unknown'
            });
        }

        console.log("Preferencia creada con éxito. ID:", result.id);

        return res.status(200).json({
            id: result.id,
            init_point: (result as any).sandbox_init_point || result.init_point,
        });

    } catch (error: any) {
        console.error("ERROR CRÍTICO AL CREAR PREFERENCIA:", error);
        if (error.cause) console.error("CAUSA:", error.cause);
        // Devolver el mensaje de error real para debug
        return res.status(500).json({
            code: 'PREFERENCE_CREATE_ERROR',
            message: "Error al generar la preferencia de pago.",
            error: error.message || error,
            details: error.cause || 'No cause'
        });
    } finally {
        await queryRunner.release();
    }
};

export const paymentWebhook = async (req: CustomRequest, res: Response) => {
    try {
        console.log("MP_WEBHOOK_HIT", {
            method: req.method,
            query: req.query,
            body: req.body,
            headers: {
                'x-signature': req.header('x-signature'),
                'x-request-id': req.header('x-request-id'),
            }
        });

        // Mercado Pago envía múltiples temas: merchant_order y payment.
        // Solo procesamos el tema 'payment' y con id de pago.
        const type = (req.body?.type || req.query?.type || req.query?.topic) as string | undefined;
        const paymentId = (req.body?.data?.id || req.query?.id) as string | undefined;
        if (type === 'payment' && paymentId) {
            const resp = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
                headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` }
            });
            const payment = await resp.json();
            console.log("MP_PAYMENT_DETAIL", paymentId, payment?.status, payment?.status_detail);

            if (payment?.status === 'approved') {
                const meta = payment?.metadata || {};
                const additional = payment?.additional_info || {};
                const item = Array.isArray(additional?.items) ? additional.items[0] : undefined;

                // Recuperamos datos de compra. Fallback a external_reference si metadata está incompleto.
                let userId = Number(meta.user_id);
                let eventId = Number(meta.event_id || item?.id);
                let amount = Number(meta.amount_tickets || item?.quantity || 1);
                if ((!userId || !eventId || !amount) && payment?.external_reference) {
                    const parts = String(payment.external_reference).split('|');
                    userId = Number(parts[0]);
                    eventId = Number(parts[1]);
                    amount = Number(parts[2]);
                }

                if (!userId || !eventId || !amount || amount <= 0) {
                    console.error("WEBHOOK_METADATA_INVALID", { userId, eventId, amount });
                    return res.status(200).json({ received: true, tickets_created: 0, reason: 'invalid_metadata' });
                }

                const queryRunner = AppDataSource.createQueryRunner();
                await queryRunner.connect();
                await queryRunner.startTransaction();
                try {
                    // Idempotencia: registramos el pago. Si ya existe mpPaymentId, abortamos para evitar duplicados.
                    const log = queryRunner.manager.create(PaymentLog, {
                        mpPaymentId: String(paymentId),
                        externalReference: String(payment?.external_reference || ''),
                        userId,
                        eventId,
                        amount
                    });
                    try {
                        await queryRunner.manager.save(PaymentLog, log);
                    } catch (e: any) {
                        if ((e?.message || '').includes('duplicate') || e?.code === '23505') {
                            await queryRunner.rollbackTransaction();
                            return res.status(200).json({ received: true, tickets_created: 0, reason: 'already_processed' });
                        }
                        throw e;
                    }

                    const user = await queryRunner.manager.findOne(User, { where: { id: userId } });
                    const event = await queryRunner.manager.findOne(Event, { where: { id: eventId } });
                    if (!user || !event) {
                        console.error("WEBHOOK_USER_OR_EVENT_NOT_FOUND", { userId, eventId });
                        await queryRunner.rollbackTransaction();
                        return res.status(200).json({ received: true, tickets_created: 0, reason: 'user_or_event_not_found' });
                    }

                    const ticketsSold = await queryRunner.manager.count(Ticket, { where: { event: { id: event.id } } });
                    const availableStock = event.capacity - ticketsSold;
                    if (availableStock < amount) {
                        console.error("WEBHOOK_NO_STOCK", { availableStock, amount });
                        await queryRunner.rollbackTransaction();
                        return res.status(200).json({ received: true, tickets_created: 0, reason: 'no_stock' });
                    }

                    // Actualizamos capacity descontando la cantidad comprada
                    event.capacity -= amount;
                    await queryRunner.manager.save(event);

                    const tickets = await Promise.all(
                        Array.from({ length: amount }, async () => {
                            const codigo_unico = randomUUID();
                            const qrCode = await generarQRUrl(codigo_unico);
                            return queryRunner.manager.create(Ticket, {
                                event,
                                user,
                                eventId: event.id,
                                userId: user.id,
                                codigo_unico,
                                qrCode,
                                titleEvent: event.title,
                                purchasePrice: event.price,
                                status: TicketStatus.VALID
                            });
                        })
                    );
                    await queryRunner.manager.save(Ticket, tickets);

                    if (user.email) {
                        try {
                            await enviarCorreoConQR(user.email, tickets.map(t => ({ qrCode: t.qrCode!, ticketId: t.id })));
                        } catch { /* ignore mail errors */ }
                    }

                    await queryRunner.commitTransaction();
                    return res.status(200).json({ received: true, tickets_created: amount });
                } catch (err: any) {
                    console.error("WEBHOOK_TICKET_CREATE_ERROR", err?.message || err);
                    await queryRunner.rollbackTransaction();
                    return res.status(200).json({ received: true, tickets_created: 0, reason: 'internal_error' });
                } finally {
                    await queryRunner.release();
                }
            }
        }

        return res.status(200).json({ received: true });
    } catch (err: any) {
        console.error("MP_WEBHOOK_ERROR", err?.message || err);
        return res.status(500).json({ code: 'WEBHOOK_ERROR', message: 'Error procesando webhook' });
    }
};
