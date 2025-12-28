import { Response } from "express";
import { MercadoPagoConfig, Preference } from 'mercadopago';
import AppDataSource from "../db";
import { Event } from "../event/event.entity";
import { Ticket } from "../ticket/ticket.entity";
import { CustomRequest } from "../middlewares/authToken";
import { User } from "../user/user.entity";
import dotenv from "dotenv";
import { processPaymentTransaction } from "./payment.service"; // Importamos el nuevo servicio

dotenv.config();

export const createPreference = async (req: CustomRequest, res: Response) => {
    // --- MANTENEMOS TU LÓGICA DE CREATE PREFERENCE IGUAL ---
    const accessToken = process.env.MP_ACCESS_TOKEN || '';
    if (!accessToken) {
        return res.status(500).json({ code: 'CONFIG_MISSING_MP_TOKEN', message: 'Payment gateway not configured' });
    }
    const client = new MercadoPagoConfig({ accessToken });
    const queryRunner = AppDataSource.createQueryRunner();

    try {
        const { ticketQuantity, eventId } = req.body;
        const userId = req.user?.id;

        if (!userId) return res.status(401).json({ message: "No autorizado." });
        if (!eventId) return res.status(400).json({ message: "Falta eventId." });

        const quantity = parseInt(ticketQuantity);
        if (isNaN(quantity) || quantity <= 0) return res.status(400).json({ message: "Cantidad inválida." });

        await queryRunner.connect();
        const user = await queryRunner.manager.findOne(User, { where: { id: userId } });
        const event = await queryRunner.manager.findOne(Event, { where: { id: parseInt(eventId) } });

        if (!user || !event) return res.status(404).json({ message: "Usuario o Evento no encontrado." });

        const ticketsSold = await queryRunner.manager.count(Ticket, { where: { event: { id: event.id } } });
        const availableStock = event.capacity - ticketsSold;

        if (availableStock < quantity) {
            return res.status(409).json({ message: `Sin stock. Quedan: ${availableStock}` });
        }

        const unitPrice = Number(event.price);

        const preference = new Preference(client);
        const sanitizeUrl = (u: string) =>
            String(u || '')
                .trim()
                .replace(/^['"`]\s*/, '')
                .replace(/\s*['"`]$/, '')
                .replace(/\/+$/, '');
        const clientUrlRaw = (process.env.CLIENT_URLS || process.env.CLIENT_URL || 'http://localhost:4200');
        const clientUrl = sanitizeUrl(clientUrlRaw.split(',')[0]);
        const notificationUrl = sanitizeUrl(process.env.MP_NOTIFICATION_URL || ''); // Asegúrate de tener esto en Render

        const body: any = {
            items: [{
                id: event.id.toString(),
                title: event.title.substring(0, 255),
                quantity: quantity,
                unit_price: unitPrice,
                currency_id: 'ARS',
            }],
            payer: {
                email: user.email, // En producción usa el email real
                name: user.firstname,
                surname: user.lastname
            },
            back_urls: {
                success: `${clientUrl}/checkout/success`,
                failure: `${clientUrl}/checkout/failure`,
                pending: `${clientUrl}/checkout/pending`,
            },
            ...(clientUrl.startsWith('https://') ? { auto_return: 'approved' } : {}),
            ...(notificationUrl ? { notification_url: notificationUrl } : {}),
            metadata: {
                user_id: Number(userId),
                event_id: Number(event.id),
                amount_tickets: Number(quantity)
            },
            external_reference: `${userId}|${event.id}|${quantity}`
        };

        const result = await preference.create({ body });
        return res.status(200).json({
            id: result.id,
            init_point: (result as any).sandbox_init_point || result.init_point,
        });

    } catch (error: any) {
        console.error("ERROR CREATING PREFERENCE:", error);
        return res.status(500).json({ message: "Error al generar pago" });
    } finally {
        await queryRunner.release();
    }
};

// --- WEBHOOK REFACTORIZADO ---
export const paymentWebhook = async (req: CustomRequest, res: Response) => {
    // 1. Extraer datos (soporta Query Params y Body, por si acaso)
    const topic = req.query.topic || req.query.type;
    const id = req.query.id || req.query['data.id'];

    // También miramos el body por si viene como JSON plano
    const bodyId = req.body?.data?.id || req.body?.id;
    const paymentId = id || bodyId;

    console.log(`WEBHOOK RECIBIDO: Topic=${topic}, ID=${paymentId}`);

    // 2. RESPUESTA INMEDIATA (Clave para que MP no reintente)
    // Respondemos 200 OK pase lo que pase.
    res.status(200).send("OK");

    // 3. PROCESAMIENTO ASÍNCRONO
    // Solo si es un pago, disparamos el servicio
    if (paymentId && (topic === 'payment' || req.body?.type === 'payment')) {
        // "Fuego y olvido": No usamos await aquí para no bloquear la respuesta si usas serverless,
        // pero en Render (servidor persistente) es seguro dejarlo correr en background.
        processPaymentTransaction(String(paymentId))
            .catch(err => console.error("Error procesando pago en background:", err));
    }
};
