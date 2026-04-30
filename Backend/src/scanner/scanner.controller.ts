import { Request, Response } from "express";
import { Ticket, TicketStatus } from "../ticket/ticket.entity";
import { CustomRequest } from "../common/middleware/authToken";
import { PromoterEventAssignment } from "../promoter/promoter.entity";
import AppDataSource from "../db";

function sanitizeTicketCode(code: unknown): string {
    if (typeof code !== "string") return "";
    let cleanCode = code.trim().replace(/\/+$/, "");
    if (cleanCode.includes("/") || cleanCode.includes("http")) {
        const parts = cleanCode.split("/");
        cleanCode = parts[parts.length - 1];
    }
    return cleanCode.trim();
}

function getEventDateTime(event: { date: any; time?: string | null }) {
    const date = String(event.date).split("T")[0];
    const time = event.time || "00:00";
    return new Date(`${date}T${time}`);
}

async function canValidateEvent(userId: number, roles: string[], eventId: number, eventOwnerId: number) {
    if (roles.includes("admin") || eventOwnerId === userId) return true;
    if (!roles.includes("scanner")) return false;

    const assignedCount = await AppDataSource.getRepository(PromoterEventAssignment)
        .createQueryBuilder("assignment")
        .innerJoin("assignment.promoterGroup", "promoterGroup")
        .where("assignment.eventId = :eventId", { eventId })
        .andWhere("assignment.isActive = true")
        .andWhere("promoterGroup.isActive = true")
        .andWhere("promoterGroup.promoterId = :userId", { userId })
        .getCount();

    return assignedCount > 0;
}

export class ScannerController {

    static async validateTicket(req: CustomRequest, res: Response) {
        try {
            const { code } = req.body;
            // @ts-ignore
            const scannerId = req.user.id;

            if (!code) {
                return res.status(400).json({ message: "Code is required" });
            }

            const cleanCode = sanitizeTicketCode(code);
            if (!cleanCode) {
                return res.status(400).json({ message: "Code is required" });
            }

            const ticket = await AppDataSource.getRepository(Ticket)
                .createQueryBuilder("ticket")
                .leftJoinAndSelect("ticket.user", "user")
                .leftJoinAndSelect("ticket.ticketType", "ticketType")
                .leftJoinAndSelect("ticketType.event", "event")
                .select([
                    "ticket.id",
                    "ticket.codigo_unico",
                    "ticket.status",
                    "ticket.usedAt",
                    "ticket.scannedById",
                    "user.id",
                    "user.firstname",
                    "user.lastname",
                    "ticketType.id",
                    "ticketType.name",
                    "event.id",
                    "event.title",
                    "event.date",
                    "event.time",
                    "event.user_id"
                ])
                .where("ticket.codigo_unico = :code", { code: cleanCode })
                .getOne();

            // --- Validaciones de Existencia ---
            if (!ticket) {
                return res.status(404).json({ message: "Ticket inexistente" });
            }

            const userRoles = req.user?.roles || [];
            const isAuthorized = await canValidateEvent(
                scannerId,
                userRoles,
                ticket.ticketType.event.id,
                ticket.ticketType.event.user_id
            );

            if (!isAuthorized) {
                return res.status(403).json({ message: "No tienes permiso para validar tickets de este evento" });
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
            const eventDate = getEventDateTime(event);
            const now = new Date();
            // Ejemplo: Si el evento fue hace más de 24hs, no dejar pasar
            const hoursDiff = (now.getTime() - eventDate.getTime()) / (1000 * 60 * 60);

            if (hoursDiff > 24) {
                return res.status(409).json({
                    message: `Este ticket es de un evento pasado: ${event.title} (${event.date})`
                });
            }

            // --- Éxito ---
            const usedAt = new Date();
            const updateResult = await Ticket.update(
                { id: ticket.id, status: TicketStatus.ACTIVE },
                { status: TicketStatus.USED, usedAt, scannedById: scannerId }
            );

            if (!updateResult.affected) {
                return res.status(409).json({ message: "Entrada YA utilizada" });
            }

            ticket.status = TicketStatus.USED;
            ticket.usedAt = usedAt;
            ticket.scannedById = scannerId;

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

            const tickets = await AppDataSource.getRepository(Ticket)
                .createQueryBuilder("ticket")
                .leftJoinAndSelect("ticket.ticketType", "ticketType")
                .leftJoinAndSelect("ticketType.event", "event")
                .leftJoinAndSelect("ticket.user", "user")
                .select([
                    "ticket.id",
                    "ticket.codigo_unico",
                    "ticket.status",
                    "ticket.usedAt",
                    "ticket.scannedById",
                    "ticketType.id",
                    "ticketType.name",
                    "event.id",
                    "event.title",
                    "event.date",
                    "user.id",
                    "user.firstname",
                    "user.lastname"
                ])
                .where("ticket.scannedById = :scannerId", { scannerId })
                .orderBy("ticket.usedAt", "DESC")
                .take(20)
                .getMany();

            return res.json(tickets);
        } catch (error) {
            console.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    }
}
