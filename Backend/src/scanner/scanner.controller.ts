import { Response } from "express";
import { logger } from "../common/services/logger";
import { Ticket, TicketStatus } from "../ticket/ticket.entity";
import { TicketTypeStatus } from "../ticketType/ticketType.entity";
import { CustomRequest } from "../common/middleware/authToken";
import AppDataSource from "../db";
import { canValidateEvent } from "./scanner-permissions";
import { User } from "../user/user.entity";
import { findRolesByNames, getRoleNames } from "../user/role.entity";
import { ScannerOrganizerAssignment } from "./scanner-organizer-assignment.entity";

import { sanitizeTicketCode, getEventDateTime } from "../common/utils/ticket";

export class ScannerController {
    private static getOrganizerId(req: CustomRequest, res: Response) {
        const requesterId = req.user?.id;
        if (!requesterId) {
            res.status(401).json({ code: "AUTH_REQUIRED", message: "No autorizado" });
            return null;
        }

        return requesterId;
    }

    static async getOrganizerScanners(req: CustomRequest, res: Response) {
        try {
            const organizerId = ScannerController.getOrganizerId(req, res);
            if (!organizerId) return;

            const assignments = await AppDataSource.getRepository(ScannerOrganizerAssignment)
                .createQueryBuilder("assignment")
                .leftJoinAndSelect("assignment.scanner", "scanner")
                .where("assignment.organizerId = :organizerId", { organizerId })
                .andWhere("assignment.isActive = true")
                .orderBy("assignment.createdAt", "DESC")
                .getMany();

            return res.json({
                data: assignments.map(assignment => ({
                    id: assignment.id,
                    organizerId: assignment.organizerId,
                    scannerId: assignment.scannerId,
                    isActive: assignment.isActive,
                    createdAt: assignment.createdAt,
                    scanner: {
                        id: assignment.scanner.id,
                        firstname: assignment.scanner.firstname,
                        lastname: assignment.scanner.lastname,
                        email: assignment.scanner.email,
                        imgPerfil: assignment.scanner.imgPerfil
                    }
                })),
                total: assignments.length
            });
        } catch (error) {
            logger.error("Error listando scanners:", error);
            return res.status(500).json({ message: "Error interno del servidor" });
        }
    }

    static async assignScannerToOrganizer(req: CustomRequest, res: Response) {
        try {
            const organizerId = ScannerController.getOrganizerId(req, res);
            if (!organizerId) return;

            const { email, userId } = req.body as { email?: string; userId?: number };
            const userRepo = AppDataSource.getRepository(User);
            const scanner = userId
                ? await userRepo.findOne({ where: { id: userId, active: true }, relations: ["roles"] })
                : await userRepo.createQueryBuilder("user")
                    .leftJoinAndSelect("user.roles", "role")
                    .where("LOWER(user.email) = LOWER(:email)", { email: String(email).trim() })
                    .andWhere("user.active = true")
                    .getOne();

            if (!scanner) {
                return res.status(404).json({ code: "USER_NOT_FOUND", message: "Usuario no encontrado o inactivo" });
            }

            const roleNames = getRoleNames(scanner);
            const canOpenScanner = roleNames.some(role => ["scanner", "organizer", "admin"].includes(role));
            if (!canOpenScanner) {
                const [scannerRole] = await findRolesByNames(["scanner"]);
                scanner.roles = [...(scanner.roles || []), scannerRole];
                await userRepo.save(scanner);
            }

            const assignmentRepo = AppDataSource.getRepository(ScannerOrganizerAssignment);
            const existingAssignment = await assignmentRepo.findOne({
                where: { organizerId, scannerId: scanner.id }
            });

            if (existingAssignment) {
                if (!existingAssignment.isActive) {
                    existingAssignment.isActive = true;
                    existingAssignment.assignedById = req.user?.id || null;
                    await assignmentRepo.save(existingAssignment);
                }

                return res.status(200).json({
                    message: "Scanner asignado al organizador",
                    assignment: {
                        id: existingAssignment.id,
                        organizerId: existingAssignment.organizerId,
                        scannerId: existingAssignment.scannerId
                    }
                });
            }

            const assignment = assignmentRepo.create({
                organizerId,
                scannerId: scanner.id,
                assignedById: req.user?.id || null,
                isActive: true
            });
            await assignmentRepo.save(assignment);

            return res.status(201).json({
                message: "Scanner asignado al organizador",
                assignment: {
                    id: assignment.id,
                    organizerId: assignment.organizerId,
                    scannerId: assignment.scannerId,
                    scanner: {
                        id: scanner.id,
                        firstname: scanner.firstname,
                        lastname: scanner.lastname,
                        email: scanner.email,
                        imgPerfil: scanner.imgPerfil
                    }
                }
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
            const organizerId = ScannerController.getOrganizerId(req, res);
            if (!organizerId) return;
            const assignmentId = parseInt(req.params.assignmentId, 10);

            const assignment = await AppDataSource.getRepository(ScannerOrganizerAssignment).findOne({
                where: { id: assignmentId, organizerId }
            });

            if (!assignment) {
                return res.status(404).json({ code: "ASSIGNMENT_NOT_FOUND", message: "Asignación no encontrada" });
            }

            assignment.isActive = false;
            await assignment.save();

            return res.json({ message: "Scanner desasignado del organizador" });
        } catch (error) {
            logger.error("Error quitando scanner:", error);
            return res.status(500).json({ message: "Error interno del servidor" });
        }
    }

    static async validateTicket(req: CustomRequest, res: Response) {
        try {
            const { code } = req.body;
            const scannerId = req.user?.id;
            if (!scannerId) {
                return res.status(401).json({ code: "AUTH_NO_USER", message: "Authentication required" });
            }

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
                    "ticketType.status",
                    "ticketType.name",
                    "event.id",
                    "event.title",
                    "event.date",
                    "event.time",
                    "event.active",
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

            // Verify ticket type and event are still active
            if (ticket.ticketType.status !== TicketTypeStatus.ACTIVE) {
                return res.status(409).json({ message: "El tipo de entrada no está activo" });
            }
            if (!ticket.ticketType.event.active) {
                return res.status(409).json({ message: "El evento no está activo" });
            }

            // --- 2. MEJORA: Validación de Evento (Opcional pero recomendada) ---
            // Verifica que el evento no haya terminado hace días.
            const event = ticket.ticketType.event;
            const eventDate = getEventDateTime(event);
            const now = new Date();
            const hoursDiff = (now.getTime() - eventDate.getTime()) / (1000 * 60 * 60);

            if (hoursDiff > 24) {
                return res.status(409).json({
                    message: `Este ticket es de un evento pasado: ${event.title} (${event.date})`
                });
            }
            if (hoursDiff < -3) {
                return res.status(409).json({
                    message: `El evento aún no comenzó. No se puede validar hasta 3 horas antes del inicio.`
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
            logger.error("Error validando ticket:", error);
            return res.status(500).json({ message: "Error interno del servidor" });
        }
    }

    // El método getHistory está perfecto como está
    static async getHistory(req: CustomRequest, res: Response) {
        try {
            const scannerId = req.user?.id;
            if (!scannerId) {
                return res.status(401).json({ code: "AUTH_NO_USER", message: "Authentication required" });
            }

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
            logger.error(error);
            return res.status(500).json({ message: "Internal server error" });
        }
    }
}
