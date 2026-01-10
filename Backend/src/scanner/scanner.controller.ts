import { Request, Response } from "express";
import { Ticket, TicketStatus } from "../ticket/ticket.entity";
import { CustomRequest } from "../middlewares/authToken";
import { LessThan, MoreThan } from "typeorm"; // Asumiendo TypeORM

export class ScannerController {

    static async validateTicket(req: CustomRequest, res: Response) {
        try {
            const { code } = req.body;
            // @ts-ignore
            const scannerId = req.user.id;

            if (!code) {
                return res.status(400).json({ message: "Code is required" });
            }

            // 1. MEJORA: Limpieza robusta de URL (quita barras finales y espacios)
            let cleanCode = code.trim().replace(/\/+$/, ''); // Quita slashes del final
            if (cleanCode.includes('/') || cleanCode.includes('http')) {
                const parts = cleanCode.split('/');
                cleanCode = parts[parts.length - 1];
            }

            const ticket = await Ticket.findOne({
                where: { codigo_unico: cleanCode },
                relations: ["user", "ticketType", "ticketType.event"]
            });

            // --- Validaciones de Existencia ---
            if (!ticket) {
                return res.status(404).json({ message: "Ticket inexistente" });
            }

            // --- Validaciones de Estado ---
            if (ticket.status === TicketStatus.USED) {
                return res.status(409).json({
                    message: "Entrada YA utilizada",
                    ticket: { ...ticket, usedAt: ticket.usedAt } // Retornamos cuándo se usó
                });
            }

            if (ticket.status === TicketStatus.CANCELLED) {
                return res.status(409).json({ message: "Entrada anulada/cancelada" });
            }

            // --- 2. MEJORA: Validación de Evento (Opcional pero recomendada) ---
            // Verifica que el evento no haya terminado hace días.
            // Esto asume que tienes una propiedad 'date' en tu entidad Event.
            const event = ticket.ticketType.event;
            const eventDate = new Date(event.date); // Asegúrate que sea objeto Date
            const now = new Date();
            // Ejemplo: Si el evento fue hace más de 24hs, no dejar pasar
            const hoursDiff = (now.getTime() - eventDate.getTime()) / (1000 * 60 * 60);

            if (hoursDiff > 24) {
                return res.status(409).json({
                    message: `Este ticket es de un evento pasado: ${event.title} (${event.date})`
                });
            }

            // --- Éxito ---
            ticket.status = TicketStatus.USED;
            ticket.usedAt = new Date();
            ticket.scannedById = scannerId;
            await ticket.save();

            return res.json({
                message: "Ticket válido - Acceso Permitido",
                ticket
            });

        } catch (error) {
            console.error("Error validando ticket:", error);
            return res.status(500).json({ message: "Error interno del servidor" });
        }
    }

    // El método getHistory está perfecto como está
    static async getHistory(req: CustomRequest, res: Response) {
        try {
            // @ts-ignore
            const scannerId = req.user.id;

            const tickets = await Ticket.find({
                where: { scannedById: scannerId },
                relations: ["ticketType", "ticketType.event", "user"],
                order: { usedAt: "DESC" },
                take: 20 // Bajar a 20 o 30 para que cargue más rápido en móviles
            });

            return res.json(tickets);
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    }
}