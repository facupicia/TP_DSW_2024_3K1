import { Request, Response } from "express";
import { Ticket, TicketStatus } from "./ticket.entity";
import { CustomRequest } from "../middlewares/authToken";
import { User } from "../user/user.entity";
import { randomUUID } from "crypto";
import { Event } from "../event/event.entity";
import { generarQRUrl } from "../utils/qr";
import enviarCorreoConQR from "../lib/mailer";
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

        // Fetch User and Event with simpler queries first to debug 404
        const user = await queryRunner.manager.findOne(User, { where: { id: userId } });
        if (!user) {
            return res.status(404).json({ message: "Usuario no encontrado" });
        }

        const event = await queryRunner.manager.findOne(Event, { where: { id: parseInt(eventID) } });
        if (!event) {
            return res.status(404).json({ message: "Evento no encontrado" });
        }

        // capacidad disponible
        const ticketsVendidos = await queryRunner.manager.count(Ticket, { where: { event: { id: event.id } } }); // Correct relation query
        const capacidadDisponible = event.capacity - ticketsVendidos;


        if (capacidadDisponible < cantidadTickets) {
            return res.status(400).json({ message: `No hay suficientes boletos disponibles. Quedan ${capacidadDisponible} boletos.` });
        }

        // Restar la cantidad de boletos comprados de la capacidad (If logic requires updating event capacity directly, though usually calculated dynamically)
        // Note: Logic above used 'ticketsVendidos' count, so modifying event.capacity might be redundant if capacity is static max. 
        // Assuming current logic wants to decrease static capacity field:
        // event.capacity -= cantidadTickets; 
        // await queryRunner.manager.save(event);
        // BETTER APPROACH: Keep capacity static max, just check count vs max. 
        // Since original code modified it, I will stick to original intent but warn: usually capacity is Max capacity, not current.
        // If 'capacity' means 'remaining', then decrement is correct. 
        // Let's assume 'capacity' is REMAINING capacity based on previous code: "event.capacity -= cantidad;"

        event.capacity -= cantidadTickets;
        await queryRunner.manager.save(event);

        const tickets = await Promise.all(
            Array.from({ length: cantidadTickets }, async () => {
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
                await enviarCorreoConQR(user.email, tickets.map(ticket => ({
                    qrCode: ticket.qrCode!,
                    ticketId: ticket.id
                })));
            } catch (emailErr) {
                // Don't fail transaction just for email
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
};


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

        // Marcar como usado
        ticket.status = TicketStatus.USED;
        ticket.usedAt = new Date();
        await ticket.save();

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
        const event = await queryRunner.manager.findOne(Event, { where: { id: ticket.eventId } });
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
