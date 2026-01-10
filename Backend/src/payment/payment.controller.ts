import { Response } from "express";
import { MercadoPagoConfig, Preference } from 'mercadopago';
import AppDataSource from "../db";
import { TicketType } from "../ticketType/ticketType.entity";
import { Ticket } from "../ticket/ticket.entity";
import { CustomRequest } from "../middlewares/authToken";
import { User } from "../user/user.entity";
import dotenv from "dotenv";
import { processPaymentTransaction } from "./payment.service";

dotenv.config();

export const createPreference = async (req: CustomRequest, res: Response) => {
    const accessToken = process.env.MP_ACCESS_TOKEN || '';
    if (!accessToken) {
        return res.status(500).json({ code: 'CONFIG_MISSING_MP_TOKEN', message: 'Payment gateway not configured' });
    }
    const client = new MercadoPagoConfig({ accessToken });
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
            relations: ["event"]
        });

        if (!user || !ticketType) return res.status(404).json({ message: "Usuario o Tipo de Ticket no encontrado." });

        if (!ticketType.active) return res.status(400).json({ message: "Este tipo de ticket no está disponible." });

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

        const unitPrice = Number(ticketType.price);
        const preference = new Preference(client);

        // Sanitización de URLs
        const sanitizeUrl = (u: string) => String(u || '').trim().replace(/\/+$/, '');
        const clientUrlRaw = (process.env.CLIENT_URLS || process.env.CLIENT_URL || 'http://localhost:4200');
        const clientUrl = sanitizeUrl(clientUrlRaw.split(',')[0]);
        const notificationUrl = sanitizeUrl(process.env.MP_NOTIFICATION_URL || '');

        // --- CONCILIACIÓN FINANCIERA ---
        // Creamos la etiqueta única. Formato: USER_ID | TICKET_TYPE_ID | QUANTITY
        const externalRef = `${userId}|${ticketType.id}|${quantity}`;

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
            auto_return: clientUrl.startsWith('https') ? 'approved' : undefined,
            notification_url: notificationUrl,

            // ESTO ES LO QUE TE PIDE MERCADO PAGO PARA EL 100/100
            external_reference: externalRef,

            metadata: {
                user_id: Number(userId),
                ticket_type_id: Number(ticketType.id),
                event_id: Number(ticketType.event.id), // Log event id for reference
                amount_tickets: Number(quantity)
            }
        };

        const result = await preference.create({ body });

        return res.status(200).json({
            id: result.id,
            init_point: result.sandbox_init_point, // Enlace inteligente (Sandbox o Prod según credenciales)
        });

    } catch (error: any) {
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

    console.log(`WEBHOOK: Topic=${topic}, ID=${paymentId}`);

    // Respondemos SIEMPRE 200 OK para que MP no reintente infinitamente
    res.status(200).send("OK");

    if (paymentId && (topic === 'payment' || req.body?.type === 'payment')) {
        processPaymentTransaction(String(paymentId))
            .catch(err => console.error("Error en background processing:", err));
    }
};