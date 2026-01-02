import { Request, Response } from "express";
import { Ticket, TicketStatus } from "./ticket.entity";
import { CustomRequest } from "../middlewares/authToken";
import { User } from "../user/user.entity";
import { randomUUID } from "crypto";
import { Event } from "../event/event.entity";
import { PaymentStatus } from "../payment/payment.entity";
import { generarQRUrl } from "../utils/qr";
import enviarCorreoConQR from "../lib/mailer";
import { createTicketsForPurchase } from "../services/ticket.service";
import { PaymentLog } from "../payment/payment.entity";
import AppDataSource from "../db"; // Asegúrate de importar tu AppDataSource correctamente
import { log } from "console";

export const createTicket = async (req: CustomRequest, res: Response) => {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        const { cantidad } = req.body;
        const { id: eventID } = req.params;
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({ message: "No autorizado. Token inválido o expirado." });
        }

        if (!eventID) {
            return res.status(400).json({ message: "ID del evento no proporcionado." });
        }

        const cantidadTickets = parseInt(cantidad);
        if (isNaN(cantidadTickets) || cantidadTickets <= 0) {
            return res.status(400).json({ message: "Cantidad inválida." });
        }

        // 1. Buscar Usuario
        const user = await queryRunner.manager.findOne(User, { where: { id: userId } });
        if (!user) {
            return res.status(404).json({ message: "Usuario no encontrado" });
        }

        // 2. Buscar Evento (con bloqueo pesimista para evitar sobreventa)
        const event = await queryRunner.manager.createQueryBuilder(Event, "e")
            .setLock("pessimistic_write")
            .where("e.id = :id", { id: parseInt(eventID) })
            .getOne();

        if (!event) {
            return res.status(404).json({ message: "Evento no encontrado" });
        }

        // 3. Verificar Stock
        const ticketsVendidos = await queryRunner.manager.count(Ticket, { where: { event: { id: event.id } } });
        const capacidadDisponible = event.capacity - ticketsVendidos;

        if (capacidadDisponible < cantidadTickets) {
            return res.status(400).json({ message: `No hay suficientes boletos disponibles. Quedan ${capacidadDisponible} boletos.` });
        }

        // 4. Actualizar Capacidad (restando stock)
        event.capacity -= cantidadTickets;
        await queryRunner.manager.save(event);

        // 5. Crear Tickets
        const tickets = await createTicketsForPurchase(event, user, cantidadTickets);
        await queryRunner.manager.save(Ticket, tickets);

        // 6. Enviar Correo con el NUEVO formato (Eventbrite style)
        if (user.email) {
            // Formatear la fecha para que se vea bonita (opcional)
            const dateObj = new Date(event.date);
            const formattedDate = !isNaN(dateObj.getTime())
                ? dateObj.toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
                : String(event.date);

            try {
                await enviarCorreoConQR(user.email, tickets.map(ticket => ({
                    qrCode: ticket.qrCode!,
                    ticketId: ticket.id,
                    // --- DATOS PARA EL FORMATO PDF ---
                    eventTitle: event.title,
                    eventDate: `${formattedDate} ${event.time}`, // Ej: "Lunes, 25 de Diciembre... 20:00"
                    eventLocation: event.location,
                    buyerName: `${user.firstname} ${user.lastname}`
                })));
            } catch (emailErr) {
                console.error("Error enviando email (no bloqueante):", emailErr);
                // No fallamos la transacción solo por el email
            }
        }

        await queryRunner.commitTransaction();

        return res.status(201).json({ message: `${cantidadTickets} ticket(s) creado(s) exitosamente` });

    } catch (error: any) {
        await queryRunner.rollbackTransaction();
        return res.status(500).json({ message: 'Error interno del servidor', error: error.message });
    } finally {
        await queryRunner.release();
    }
}

export const getTickets = async (req: CustomRequest, res: Response) => {

    try {
        const { id: userID } = req.params;
        const tickets = await Ticket.find({
            where: { userId: parseInt(userID) },
            relations: { event: true },
            select: {
                event: {
                    id: true,
                    title: true,
                    date: true,
                    time: true,
                    location: true,
                    image: true
                }
            }
        });
        return res.status(200).json(tickets);
    } catch (error: any) {
        return res.status(500).json({ message: 'Error interno del servidor', error: error.message });
    }
}

export const getLastPurchaseTickets = async (req: CustomRequest, res: Response) => {
    try {
        console.log("▶ getLastPurchaseTickets");

        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({
                code: 'AUTH_REQUIRED',
                message: 'No autorizado'
            });
        }

        if (!AppDataSource.isInitialized) {
            await AppDataSource.initialize();
        }

        const logRepo = AppDataSource.getRepository(PaymentLog);
        const ticketRepo = AppDataSource.getRepository(Ticket);

        // 🔎 Último pago del usuario
        const lastLog = await logRepo.findOne({
            where: { userId },
            order: { createdAt: 'DESC' as any }
        });

        if (!lastLog) {
            return res.status(200).json({
                tickets: [],
                status: 'no_logs'
            });
        }

        // ⏳ Pago todavía en proceso
        if (lastLog.status !== PaymentStatus.COMPLETED) {
            return res.status(200).json({
                tickets: [],
                status: 'processing'
            });
        }

        // 🎟️ Tickets listos
        const tickets = await ticketRepo.find({
            where: {
                userId,
                eventId: lastLog.eventId
            },
            order: { createdAt: 'DESC' as any },
            relations: { event: true }
        });

        return res.status(200).json({
            tickets,
            status: 'approved'
        });

    } catch (error: any) {
        console.error("🔴 ERROR REAL:", error);
        return res.status(500).json({
            message: 'Error interno del servidor'
        });
    }
};


export const validateTicket = async (req: Request, res: Response) => {
    try {
        const { code } = req.body; // Can be ticket ID or unique code

        // Buscar ticket por codigo unico o ID
        const ticket = await Ticket.findOne({
            where: [{ codigo_unico: code }, { id: parseInt(code) || -1 }]
        });

        if (!ticket) {
            return res.status(404).json({ message: "Ticket no encontrado", valid: false });
        }

        if (ticket.status === TicketStatus.USED) {
            return res.status(400).json({
                message: "Ticket ya fue utilizado",
                valid: false,
                usedAt: ticket.usedAt
            });
        }

        if (ticket.status === TicketStatus.CANCELLED) {
            return res.status(400).json({ message: "Ticket cancelado", valid: false });
        }

        // Marcar como usado de forma atómica
        const result = await Ticket.createQueryBuilder()
            .update(Ticket)
            .set({ status: TicketStatus.USED, usedAt: new Date() })
            .where("id = :id AND status = :status", { id: ticket.id, status: TicketStatus.VALID })
            .execute();
        if (!result.affected || result.affected === 0) {
            return res.status(400).json({ message: "Ticket ya fue utilizado o inválido", valid: false });
        }

        return res.json({
            message: "Ticket válido. Acceso permitido.",
            valid: true,
            ticket: {
                id: ticket.id,
                event: ticket.titleEvent,
                user: ticket.userId
            }
        });

    } catch (error) {
        if (error instanceof Error) {
            return res.status(500).json({ message: error.message });
        }
    }
};

export const cancelTicket = async (req: CustomRequest, res: Response) => {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
        const { id } = req.params;
        const userId = req.user?.id;
        if (!userId) {
            await queryRunner.rollbackTransaction();
            return res.status(401).json({ message: "No autorizado" });
        }
        const ticket = await queryRunner.manager.findOne(Ticket, {
            where: { id: parseInt(id), userId }
        });
        if (!ticket) {
            await queryRunner.rollbackTransaction();
            return res.status(404).json({ message: "Ticket no encontrado" });
        }
        if (ticket.status === TicketStatus.USED) {
            await queryRunner.rollbackTransaction();
            return res.status(400).json({ message: "Ticket ya utilizado" });
        }
        if (ticket.status === TicketStatus.CANCELLED) {
            await queryRunner.rollbackTransaction();
            return res.status(400).json({ message: "Ticket ya cancelado" });
        }
        const event = await queryRunner.manager.createQueryBuilder(Event, "e")
            .setLock("pessimistic_write")
            .where("e.id = :id", { id: ticket.eventId })
            .getOne();
        if (!event) {
            await queryRunner.rollbackTransaction();
            return res.status(404).json({ message: "Evento no encontrado" });
        }
        ticket.status = TicketStatus.CANCELLED;
        await queryRunner.manager.save(Ticket, ticket);
        event.capacity += 1;
        await queryRunner.manager.save(Event, event);
        await queryRunner.commitTransaction();
        return res.status(200).json({ message: "Ticket cancelado", ticketId: ticket.id });
    } catch (error: any) {
        await queryRunner.rollbackTransaction();
        return res.status(500).json({ message: 'Error interno del servidor', error: error.message });
    } finally {
        await queryRunner.release();
    }
}
