import { Request, Response } from "express";
import { logger } from "../common/services/logger";
import { CustomRequest } from "../common/middleware/authToken";
import * as ticketService from "./ticket.service";
import { getPagination } from "../common/services/pagination";

class HttpError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

function handleHttpError(error: any, res: Response) {
    if (error instanceof HttpError) {
        return res.status(error.status).json({ code: error.code, message: error.message });
    }
    logger.error("TICKET_CONTROLLER_ERROR", { error: error?.message });
    const isDev = process.env.NODE_ENV === 'development';
    return res.status(500).json({ message: "Error interno del servidor", ...(isDev ? { error: error?.message } : {}) });
}

export const createTicket = async (req: CustomRequest, res: Response) => {
    const { cantidad, ticketTypeId } = req.body;
    const userId = req.user?.id;

    if (!userId) return res.status(401).json({ message: "No autorizado. Token inválido o expirado." });
    if (!ticketTypeId) return res.status(400).json({ message: "ID del tipo de ticket no proporcionado." });

    const cantidadTickets = parseInt(cantidad);
    if (isNaN(cantidadTickets) || cantidadTickets <= 0) {
        return res.status(400).json({ message: "Cantidad inválida." });
    }

    try {
        const result = await ticketService.purchase(userId, ticketTypeId, cantidadTickets, req.params.id);
        return res.status(201).json({ message: `${result.quantity} ticket(s) creado(s) exitosamente` });
    } catch (error: any) {
        return handleHttpError(error, res);
    }
};

export const getTickets = async (req: CustomRequest, res: Response) => {
    try {
        const requesterId = req.user?.id;
        const requesterRoles = req.user?.roles || [];
        if (!requesterId) return res.status(401).json({ message: "No autorizado" });

        const requestedUserId = parseInt(req.params.id);
        const isAdmin = requesterRoles.includes('admin');
        const userID = isAdmin && !isNaN(requestedUserId) ? requestedUserId : requesterId;
        const { skip, take } = getPagination(req.query, 50, 100);

        const result = await ticketService.findByUser(userID, { skip, take });
        return res.status(200).json({ data: result.tickets, total: result.total });
    } catch (error: any) {
        return res.status(500).json({ message: "Error interno del servidor", error: error.message });
    }
};

export const getLastPurchaseTickets = async (req: CustomRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ code: 'AUTH_REQUIRED', message: 'No autorizado' });

        const result = await ticketService.findLastPurchase(userId);
        return res.status(200).json(result);
    } catch (error: any) {
        logger.error("ERROR REAL:", error);
        return res.status(500).json({ message: "Error interno del servidor" });
    }
};

export const cancelTicket = async (req: CustomRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        const ticketId = Number(req.params.id);

        if (!userId) return res.status(401).json({ message: "No autorizado" });
        if (!Number.isSafeInteger(ticketId) || ticketId <= 0) {
            return res.status(400).json({ message: "ID de ticket inválido" });
        }

        const result = await ticketService.cancel(userId, ticketId);
        if (result.success) return res.status(200).json({ message: result.message, ticketId });

        const statusMap: Record<string, number> = {
            PAID_TICKET_REFUND_REQUIRED: 409
        };
        return res.status(statusMap[result.code || ""] || 409).json({ message: result.message, code: result.code });
    } catch (error: any) {
        return res.status(500).json({ message: "Error interno del servidor", error: error.message });
    }
};

export const inviteGuests = async (req: CustomRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        const isAdmin = (req.user?.roles || []).includes("admin");
        if (!userId) return res.status(401).json({ message: "No autorizado" });

        const { ticketTypeId, emails } = req.body;
        const quantity = req.body.quantity ?? 1;

        const result = await ticketService.inviteGuests(userId, ticketTypeId, emails, quantity, isAdmin);
        return res.status(201).json(result);
    } catch (error: any) {
        return handleHttpError(error, res);
    }
};
