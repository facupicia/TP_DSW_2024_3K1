import { Response } from "express";
import { MercadoPagoConfig, Preference } from 'mercadopago';
import AppDataSource from "../db";
import { TicketType, TicketTypeStatus } from "../ticketType/ticketType.entity";
import { Ticket } from "../ticket/ticket.entity";
import { CustomRequest } from "../middlewares/authToken";
import { User } from "../user/user.entity";
import dotenv from "dotenv";
import { processPaymentTransaction } from "./payment.service";
import { refreshOrganizerToken } from "./mp-oauth.controller";
import { getActiveSubscription } from "../subscription/subscription.service";
import { logger } from "../lib/logger";

dotenv.config();

/* ==============================================================================
   MARKETPLACE PAYMENT CONTROLLER
   
   Modelo de negocio:
   - El pago se crea con el TOKEN DEL ORGANIZADOR (obtenido via OAuth)
   - Se usa marketplace_fee para la comisión de la plataforma
   - El % de comisión depende del plan del organizador (FREE=8%, PRO=3%)
   
   IMPORTANTE: Para que marketplace_fee funcione, el organizador DEBE haber
   autorizado la aplicación via OAuth (mpUserId y mpAccessToken guardados).
============================================================================== */

export const createPreference = async (req: CustomRequest, res: Response) => {
    const queryRunner = AppDataSource.createQueryRunner();

    try {
        const { ticketQuantity, ticketTypeId } = req.body;
        const userId = req.user?.id;

        if (!userId) return res.status(401).json({ message: "No autorizado." });
        if (!ticketTypeId) return res.status(400).json({ message: "Falta ticketTypeId." });

        const quantity = parseInt(ticketQuantity);
        if (isNaN(quantity) || quantity <= 0) return res.status(400).json({ message: "Cantidad inválida." });

        await queryRunner.connect();
        const user = await queryRunner.manager.findOne(User, { where: { id: userId } });
        const ticketType = await queryRunner.manager.findOne(TicketType, {
            where: { id: parseInt(ticketTypeId) },
            relations: ["event", "event.user"]
        });

        if (!user || !ticketType) return res.status(404).json({ message: "Usuario o Tipo de Ticket no encontrado." });

        if (ticketType.status !== TicketTypeStatus.ACTIVE) return res.status(400).json({ message: "Este tipo de ticket no está disponible." });

        const availableStock = ticketType.capacity - ticketType.soldCount;

        if (availableStock < quantity) {
            return res.status(409).json({ message: `Sin stock. Quedan: ${availableStock}` });
        }

        // Validar que el evento no haya comenzado
        const event = ticketType.event;
        const eventDateTime = new Date(`${event.date}T${event.time}`);
        if (new Date() > eventDateTime) {
            return res.status(400).json({
                code: 'EVENT_STARTED',
                message: 'Las ventas han cerrado. El evento ya comenzó.'
            });
        }

        // Validar edad mínima si aplica
        if (event.minAge && event.minAge > 0) {
            const birthDate = new Date(user.birth);
            const today = new Date();
            let age = today.getFullYear() - birthDate.getFullYear();
            const monthDiff = today.getMonth() - birthDate.getMonth();
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                age--;
            }

            if (age < event.minAge) {
                return res.status(403).json({
                    code: 'AGE_RESTRICTED',
                    message: `Debes tener al menos ${event.minAge} años para comprar entradas a este evento.`
                });
            }
        }

        /* ==================== MARKETPLACE LOGIC ==================== */

        // 1. Obtener datos del organizador
        const organizerId = event.user_id;

        // 2. Obtener access token del organizador (refrescar si es necesario)
        const organizerAccessToken = await refreshOrganizerToken(organizerId);

        if (!organizerAccessToken) {
            logger.error('MARKETPLACE_NO_ORGANIZER_TOKEN', { organizerId, eventId: event.id });
            return res.status(400).json({
                code: 'ORGANIZER_MP_NOT_LINKED',
                message: 'El organizador de este evento no tiene asociada su cuenta de Mercado Pago. No es posible procesar el pago.'
            });
        }

        // 3. Obtener plan del organizador para calcular comisión
        let commissionPercent = 8.00; // Default FREE plan
        let organizerPlanName = 'FREE';
        try {
            const subscription = await getActiveSubscription(organizerId);
            commissionPercent = Number(subscription.plan.commissionPercent);
            organizerPlanName = subscription.plan.name;
        } catch (e) {
            logger.warn('MARKETPLACE_SUBSCRIPTION_ERROR', { organizerId, error: (e as any)?.message });
            // Continuar con comisión default
        }

        // 4. Calcular montos
        const unitPrice = Number(ticketType.price);
        const totalAmount = unitPrice * quantity;

        // Calcular marketplace_fee (comisión de la plataforma)
        // Usar Math.ceil y mínimo 1 peso si hay comisión
        let marketplaceFee = Math.ceil((totalAmount * commissionPercent) / 100);
        if (totalAmount > 0 && commissionPercent > 0 && marketplaceFee < 1) {
            marketplaceFee = 1; // Mínimo 1 peso de comisión
        }

        logger.info('MARKETPLACE_PREFERENCE', {
            organizerId,
            plan: organizerPlanName,
            commissionPercent,
            totalAmount,
            marketplaceFee
        });

        // 5. Crear cliente MP con token del ORGANIZADOR
        const organizerClient = new MercadoPagoConfig({ accessToken: organizerAccessToken });
        const preference = new Preference(organizerClient);

        /* ============================================================= */

        // Sanitización de URLs
        const sanitizeUrl = (u: string) => String(u || '').trim().replace(/\/+$/, '');
        const clientUrlRaw = (process.env.CLIENT_URLS || process.env.CLIENT_URL || 'http://localhost:4200');
        const clientUrl = sanitizeUrl(clientUrlRaw.split(',')[0]);
        const notificationUrl = sanitizeUrl(process.env.MP_NOTIFICATION_URL || '');

        // --- CONCILIACIÓN FINANCIERA ---
        // Formato: USER_ID | TICKET_TYPE_ID | QUANTITY | ORGANIZER_ID
        const externalRef = `${userId}|${ticketType.id}|${quantity}|${organizerId}`;

        const body: any = {
            items: [{
                id: ticketType.id.toString(),
                title: `${ticketType.event.title} - ${ticketType.name}`.substring(0, 255),
                quantity: quantity,
                unit_price: unitPrice,
                currency_id: 'ARS',
            }],
            payer: {
                email: user.email,
                name: user.firstname,
                surname: user.lastname
            },
            back_urls: {
                success: `${clientUrl}/checkout/success`,
                failure: `${clientUrl}/checkout/failure`,
                pending: `${clientUrl}/checkout/pending`,
            },
            // auto_return requiere que back_urls sean HTTPS
            auto_return: clientUrl.startsWith('https') ? 'approved' : undefined,
            notification_url: notificationUrl || undefined,

            external_reference: externalRef,

            // === MARKETPLACE CONFIG ===
            // marketplace_fee: comisión que recibe la plataforma
            // NOTA: Esto solo funciona si el organizador autorizó la app via OAuth
            marketplace_fee: marketplaceFee,

            metadata: {
                user_id: Number(userId),
                ticket_type_id: Number(ticketType.id),
                event_id: Number(ticketType.event.id),
                amount_tickets: Number(quantity),
                // Audit marketplace
                organizer_id: organizerId,
                organizer_plan: organizerPlanName,
                commission_percent: commissionPercent,
                marketplace_fee: marketplaceFee
            }
        };

        const result = await preference.create({ body });

        return res.status(200).json({
            id: result.id,
            init_point: result.init_point,
        });

    } catch (error: any) {
        logger.error("ERROR_CREATING_PREFERENCE", { error: error?.message });
        console.error("ERROR CREATING PREFERENCE:", error);
        return res.status(500).json({ message: "Error al generar pago" });
    } finally {
        await queryRunner.release();
    }
};

export const paymentWebhook = async (req: CustomRequest, res: Response) => {
    const topic = req.query.topic || req.query.type;
    const id = req.query.id || req.query['data.id'];
    const bodyId = req.body?.data?.id || req.body?.id;
    const paymentId = id || bodyId;

    // Log completo para debugging
    console.log(`WEBHOOK RECEIVED:`, JSON.stringify({
        topic,
        paymentId,
        query: req.query,
        body: req.body
    }, null, 2));

    // Respondemos SIEMPRE 200 OK para que MP no reintente infinitamente
    res.status(200).send("OK");

    if (paymentId && (topic === 'payment' || req.body?.type === 'payment')) {
        processPaymentTransaction(String(paymentId))
            .catch(err => console.error("Error en background processing:", err));
    }
};