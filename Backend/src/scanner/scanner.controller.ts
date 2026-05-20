import { Response } from "express";
import { CustomRequest } from "../common/middleware/authToken";
import { logger } from "../common/services/logger";
import { validateTicket as validateTicketService } from "../ticket/ticket-validation.service";
import * as scannerService from "./scanner.service";

export class ScannerController {
    static async getOrganizerScanners(req: CustomRequest, res: Response) {
        try {
            const organizerId = req.user?.id;
            if (!organizerId) {
                return res.status(401).json({ code: "AUTH_REQUIRED", message: "No autorizado" });
            }

            const assignments = await scannerService.listAssignments(organizerId);
            return res.json({ data: assignments, total: assignments.length });
        } catch (error) {
            logger.error("Error listando scanners:", error);
            return res.status(500).json({ message: "Error interno del servidor" });
        }
    }

    static async assignScannerToOrganizer(req: CustomRequest, res: Response) {
        try {
            const organizerId = req.user?.id;
            if (!organizerId) {
                return res.status(401).json({ code: "AUTH_REQUIRED", message: "No autorizado" });
            }

            const { email, userId } = req.body as { email?: string; userId?: number };
            const result = await scannerService.assignScanner(organizerId, { email, userId }, organizerId);

            if (!result.success) {
                return res.status(404).json({ code: "USER_NOT_FOUND", message: result.message });
            }

            const statusCode = result.scanner ? 201 : 200;
            return res.status(statusCode).json({
                message: "Scanner asignado al organizador",
                assignment: result.assignment,
                ...(result.scanner && { scanner: result.scanner })
            });
        } catch (error: any) {
            logger.error("Error asignando scanner:", error);
            if (error.code === "23505") {
                return res.status(409).json({ code: "ALREADY_ASSIGNED", message: "El usuario ya está asignado como scanner" });
            }
            return res.status(500).json({ message: error.message || "Error interno del servidor" });
        }
    }

    static async removeScannerFromOrganizer(req: CustomRequest, res: Response) {
        try {
            const organizerId = req.user?.id;
            if (!organizerId) {
                return res.status(401).json({ code: "AUTH_REQUIRED", message: "No autorizado" });
            }

            const assignmentId = parseInt(req.params.assignmentId, 10);
            const result = await scannerService.removeScanner(organizerId, assignmentId);

            if (!result.success) {
                return res.status(404).json({ code: "ASSIGNMENT_NOT_FOUND", message: result.message });
            }

            return res.json({ message: result.message });
        } catch (error) {
            logger.error("Error quitando scanner:", error);
            return res.status(500).json({ message: "Error interno del servidor" });
        }
    }

    static async validateTicket(req: CustomRequest, res: Response) {
        try {
            const scannerId = req.user?.id;
            const roles = req.user?.roles || [];
            if (!scannerId) {
                return res.status(401).json({ code: "AUTH_NO_USER", message: "Authentication required" });
            }

            const { code } = req.body;
            if (!code) {
                return res.status(400).json({ message: "Code is required" });
            }

            const result = await validateTicketService(code, scannerId, roles);

            if (!result.success) {
                const statusMap: Record<string, number> = {
                    INVALID_CODE: 400,
                    NOT_FOUND: 404,
                    FORBIDDEN: 403,
                    ALREADY_USED: 409,
                    CANCELLED: 409,
                    INACTIVE_TICKET_TYPE: 409,
                    INACTIVE_EVENT: 409,
                    EVENT_PAST: 409,
                    EVENT_NOT_STARTED: 409,
                    RACE_CONDITION: 409
                };
                const status = statusMap[result.code || ""] || 400;
                const payload: Record<string, any> = { message: result.message };
                if (result.usedAt) payload.ticket = { usedAt: result.usedAt };
                return res.status(status).json(payload);
            }

            return res.json({
                message: "Ticket válido - Acceso Permitido",
                ticket: result.ticket
            });
        } catch (error) {
            logger.error("Error validando ticket:", error);
            return res.status(500).json({ message: "Error interno del servidor" });
        }
    }

    static async getHistory(req: CustomRequest, res: Response) {
        try {
            const scannerId = req.user?.id;
            if (!scannerId) {
                return res.status(401).json({ code: "AUTH_NO_USER", message: "Authentication required" });
            }

            const history = await scannerService.getHistory(scannerId);
            return res.json(history);
        } catch (error) {
            logger.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    }
}
