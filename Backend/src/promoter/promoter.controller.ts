import { Request, Response } from "express";
import { CustomRequest } from "../common/middleware/authToken";
import { User } from "../user/user.entity";
import { Role, getRoleNames } from "../user/role.entity";
import { Event } from "../event/event.entity";
import { Ticket } from "../ticket/ticket.entity";
import { PromoterGroup, PromoterEventAssignment } from "./promoter.entity";
import { Roles } from "../schemas/schema.user";
import AppDataSource from "../db";
import { randomUUID } from "crypto";
import { env } from "../config/env";

/**
 * Add a new promoter to the organizer's group
 * POST /api/promoter
 * Only organizers and admins can add promoters
 * The promoter must already be registered in the platform
 */
export const addPromoter = async (req: CustomRequest, res: Response) => {
    try {
        const organizerId = req.user?.id;
        const userRoles = req.user?.roles || [];

        if (!organizerId) {
            return res.status(401).json({ code: "AUTH_REQUIRED", message: "No autorizado" });
        }

        // Only organizers and admins can add promoters (check using roles array)
        const hasRequiredRole = userRoles.includes('organizer') || userRoles.includes('admin');
        if (!hasRequiredRole) {
            return res.status(403).json({ code: "FORBIDDEN", message: "Solo organizadores pueden agregar promotores" });
        }

        const { email, commissionPercentage, notes } = req.body;

        // Validate required fields
        if (!email) {
            return res.status(400).json({ code: "MISSING_EMAIL", message: "El email es requerido" });
        }

        // Validate commission percentage
        const commission = commissionPercentage !== undefined ? parseFloat(commissionPercentage) : 10;
        if (isNaN(commission) || commission < 0 || commission > 100) {
            return res.status(400).json({ code: "INVALID_COMMISSION", message: "El porcentaje de comisión debe estar entre 0 y 100" });
        }

        // Start transaction
        const queryRunner = AppDataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            // Find user by email - must already exist
            const promoter = await queryRunner.manager.findOne(User, { where: { email }, relations: ['roles'] });

            if (!promoter) {
                await queryRunner.rollbackTransaction();
                return res.status(404).json({ 
                    code: "USER_NOT_FOUND", 
                    message: "El usuario no está registrado en la plataforma. Debe crear una cuenta primero." 
                });
            }

            // Check if user is already a promoter for this organizer
            const existingAssignment = await queryRunner.manager.findOne(PromoterGroup, {
                where: { organizerId, promoterId: promoter.id }
            });

            if (existingAssignment) {
                await queryRunner.rollbackTransaction();
                return res.status(409).json({ code: "ALREADY_PROMOTER", message: "Este usuario ya es promotor de este organizador" });
            }

            // Check if user is already an rrpp for another organizer
            const promoterRoleNames = getRoleNames(promoter);
            if (promoterRoleNames.length === 0) promoterRoleNames.push('user');
            if (promoterRoleNames.includes("rrpp")) {
                const otherAssignment = await queryRunner.manager.findOne(PromoterGroup, {
                    where: { promoterId: promoter.id }
                });
                if (otherAssignment && otherAssignment.organizerId !== organizerId) {
                    await queryRunner.rollbackTransaction();
                    return res.status(409).json({
                        code: "PROMOTER_HAS_ORGANIZER",
                        message: "Este usuario ya es promotor de otro organizador"
                    });
                }
            }

            // Add rrpp role if not already has it (keep existing roles)
            if (!promoterRoleNames.includes("rrpp") && !promoterRoleNames.includes("admin")) {
                const roleRepo = queryRunner.manager.getRepository(Role);
                let rrppRole = await roleRepo.findOne({ where: { name: 'rrpp' } });
                if (!rrppRole) {
                    rrppRole = roleRepo.create({ name: 'rrpp' });
                    await roleRepo.save(rrppRole);
                }
                promoter.roles = [...promoter.roles, rrppRole];
                await queryRunner.manager.save(User, promoter);
            }

            // Generate unique promoter code
            const finalPromoterCode = `PROMO-${randomUUID().substring(0, 8).toUpperCase()}`;

            // Check if promoter code is unique
            const existingCode = await queryRunner.manager.findOne(PromoterGroup, {
                where: { promoterCode: finalPromoterCode }
            });
            if (existingCode) {
                await queryRunner.rollbackTransaction();
                return res.status(409).json({ code: "CODE_EXISTS", message: "El código de promotor ya existe" });
            }

            // Create promoter group entry
            const promoterGroup = new PromoterGroup();
            promoterGroup.organizerId = organizerId;
            promoterGroup.promoterId = promoter.id;
            promoterGroup.commissionPercentage = commission;
            promoterGroup.promoterCode = finalPromoterCode;
            promoterGroup.notes = notes || null;
            promoterGroup.isActive = true;

            await queryRunner.manager.save(PromoterGroup, promoterGroup);
            await queryRunner.commitTransaction();

            return res.status(201).json({
                message: "Promotor agregado exitosamente.",
                promoter: {
                    id: promoter.id,
                    email: promoter.email,
                    firstname: promoter.firstname,
                    lastname: promoter.lastname,
                    commissionPercentage: commission,
                    promoterCode: finalPromoterCode
                }
            });

        } catch (error: any) {
            await queryRunner.rollbackTransaction();
            throw error;
        } finally {
            await queryRunner.release();
        }

    } catch (error: any) {
        console.error("Error adding promoter:", error);
        
        // Handle specific database errors
        if (error.code === '23505') { // PostgreSQL unique violation
            if (error.detail?.includes('promoterCode')) {
                return res.status(409).json({ 
                    code: "CODE_EXISTS", 
                    message: "El código de promotor ya existe. Intenta nuevamente." 
                });
            }
            if (error.detail?.includes('organizerId') && error.detail?.includes('promoterId')) {
                return res.status(409).json({ 
                    code: "ALREADY_PROMOTER", 
                    message: "Este usuario ya es promotor de este organizador" 
                });
            }
            return res.status(409).json({ 
                code: "DUPLICATE_ENTRY", 
                message: "Registro duplicado. Es posible que el promotor ya exista." 
            });
        }
        
        if (error.message?.includes('violates unique constraint') || error.message?.includes('duplicate key')) {
            return res.status(409).json({ 
                code: "DUPLICATE_KEY", 
                message: "Error de clave duplicada. Contacta al administrador." 
            });
        }
        
        return res.status(500).json({ code: "INTERNAL_ERROR", message: error.message || "Error interno del servidor" });
    }
};

/**
 * Get all promoters for the current organizer
 * GET /api/promoter
 */
export const getMyPromoters = async (req: CustomRequest, res: Response) => {
    try {
        const organizerId = req.user?.id;
        const userRoles = req.user?.roles || [];

        if (!organizerId) {
            return res.status(401).json({ code: "AUTH_REQUIRED", message: "No autorizado" });
        }

        // Only organizers and admins can view their promoters
        const hasRequiredRole = userRoles.includes('organizer') || userRoles.includes('admin');
        if (!hasRequiredRole) {
            return res.status(403).json({ code: "FORBIDDEN", message: "Acceso denegado" });
        }

        const { skip, take } = (await import("../common/services/pagination")).getPagination(req.query, 50, 100);
        const [promoters, total] = await PromoterGroup.findAndCount({
            where: { organizerId },
            relations: { promoter: true },
            order: { createdAt: "DESC" },
            skip,
            take
        });

        const formattedPromoters = promoters.map(pg => ({
            id: pg.id,
            promoterId: pg.promoterId,
            email: pg.promoter?.email,
            firstname: pg.promoter?.firstname,
            lastname: pg.promoter?.lastname,
            imgPerfil: pg.promoter?.imgPerfil,
            commissionPercentage: pg.commissionPercentage,
            promoterCode: pg.promoterCode,
            isActive: pg.isActive,
            notes: pg.notes,
            createdAt: pg.createdAt
        }));

        return res.status(200).json({ data: formattedPromoters, total });

    } catch (error: any) {
        console.error("Error fetching promoters:", error);
        return res.status(500).json({ code: "INTERNAL_ERROR", message: error.message || "Error interno del servidor" });
    }
};

/**
 * Get a specific promoter by ID
 * GET /api/promoter/:id
 */
export const getPromoterById = async (req: CustomRequest, res: Response) => {
    try {
        const organizerId = req.user?.id;
        const userRoles = req.user?.roles || [];
        const promoterGroupId = parseInt(req.params.id);

        if (!organizerId) {
            return res.status(401).json({ code: "AUTH_REQUIRED", message: "No autorizado" });
        }

        if (isNaN(promoterGroupId)) {
            return res.status(400).json({ code: "INVALID_ID", message: "ID inválido" });
        }

        const promoterGroup = await PromoterGroup.findOne({
            where: { id: promoterGroupId },
            relations: { promoter: true }
        });

        if (!promoterGroup) {
            return res.status(404).json({ code: "NOT_FOUND", message: "Promotor no encontrado" });
        }

        // Only the owner organizer or admin can view
        const isAdmin = userRoles.includes('admin');
        if (promoterGroup.organizerId !== organizerId && !isAdmin) {
            return res.status(403).json({ code: "FORBIDDEN", message: "No tienes permiso para ver este promotor" });
        }

        // Get assigned events
        const eventAssignments = await PromoterEventAssignment.find({
            where: { promoterGroupId: promoterGroup.id },
            relations: { event: true }
        });

        return res.status(200).json({
            id: promoterGroup.id,
            promoterId: promoterGroup.promoterId,
            email: promoterGroup.promoter?.email,
            firstname: promoterGroup.promoter?.firstname,
            lastname: promoterGroup.promoter?.lastname,
            imgPerfil: promoterGroup.promoter?.imgPerfil,
            phone: promoterGroup.promoter?.phone,
            commissionPercentage: promoterGroup.commissionPercentage,
            promoterCode: promoterGroup.promoterCode,
            isActive: promoterGroup.isActive,
            notes: promoterGroup.notes,
            createdAt: promoterGroup.createdAt,
            assignedEvents: eventAssignments.map(ea => ({
                id: ea.eventId,
                title: ea.event?.title,
                customCommissionPercentage: ea.customCommissionPercentage,
                isActive: ea.isActive
            }))
        });

    } catch (error: any) {
        console.error("Error fetching promoter:", error);
        return res.status(500).json({ code: "INTERNAL_ERROR", message: error.message || "Error interno del servidor" });
    }
};

/**
 * Update a promoter's information
 * PUT /api/promoter/:id
 */
export const updatePromoter = async (req: CustomRequest, res: Response) => {
    try {
        const organizerId = req.user?.id;
        const userRoles = req.user?.roles || [];
        const promoterGroupId = parseInt(req.params.id);

        if (!organizerId) {
            return res.status(401).json({ code: "AUTH_REQUIRED", message: "No autorizado" });
        }

        if (isNaN(promoterGroupId)) {
            return res.status(400).json({ code: "INVALID_ID", message: "ID inválido" });
        }

        const promoterGroup = await PromoterGroup.findOne({
            where: { id: promoterGroupId },
            relations: { promoter: true }
        });

        if (!promoterGroup) {
            return res.status(404).json({ code: "NOT_FOUND", message: "Promotor no encontrado" });
        }

        // Only the owner organizer or admin can update
        const isAdmin = userRoles.includes('admin');
        if (promoterGroup.organizerId !== organizerId && !isAdmin) {
            return res.status(403).json({ code: "FORBIDDEN", message: "No tienes permiso para actualizar este promotor" });
        }

        const { commissionPercentage, isActive, notes, promoterCode } = req.body;

        // Validate commission percentage
        if (commissionPercentage !== undefined) {
            const commission = parseFloat(commissionPercentage);
            if (isNaN(commission) || commission < 0 || commission > 100) {
                return res.status(400).json({ code: "INVALID_COMMISSION", message: "El porcentaje de comisión debe estar entre 0 y 100" });
            }
            promoterGroup.commissionPercentage = commission;
        }

        // Check if new promoter code is unique
        if (promoterCode && promoterCode !== promoterGroup.promoterCode) {
            const existingCode = await PromoterGroup.findOne({
                where: { promoterCode }
            });
            if (existingCode) {
                return res.status(409).json({ code: "CODE_EXISTS", message: "El código de promotor ya existe" });
            }
            promoterGroup.promoterCode = promoterCode;
        }

        if (isActive !== undefined) promoterGroup.isActive = isActive;
        if (notes !== undefined) promoterGroup.notes = notes;

        await promoterGroup.save();

        return res.status(200).json({
            message: "Promotor actualizado exitosamente",
            promoter: {
                id: promoterGroup.id,
                promoterId: promoterGroup.promoterId,
                commissionPercentage: promoterGroup.commissionPercentage,
                promoterCode: promoterGroup.promoterCode,
                isActive: promoterGroup.isActive,
                notes: promoterGroup.notes
            }
        });

    } catch (error: any) {
        console.error("Error updating promoter:", error);
        return res.status(500).json({ code: "INTERNAL_ERROR", message: error.message || "Error interno del servidor" });
    }
};

/**
 * Remove a promoter from the organizer's group
 * DELETE /api/promoter/:id
 */
export const removePromoter = async (req: CustomRequest, res: Response) => {
    try {
        const organizerId = req.user?.id;
        const userRoles = req.user?.roles || [];
        const promoterGroupId = parseInt(req.params.id);

        if (!organizerId) {
            return res.status(401).json({ code: "AUTH_REQUIRED", message: "No autorizado" });
        }

        if (isNaN(promoterGroupId)) {
            return res.status(400).json({ code: "INVALID_ID", message: "ID inválido" });
        }

        const promoterGroup = await PromoterGroup.findOne({
            where: { id: promoterGroupId },
            relations: { promoter: true }
        });

        if (!promoterGroup) {
            return res.status(404).json({ code: "NOT_FOUND", message: "Promotor no encontrado" });
        }

        // Only the owner organizer or admin can delete
        const isAdmin = userRoles.includes('admin');
        if (promoterGroup.organizerId !== organizerId && !isAdmin) {
            return res.status(403).json({ code: "FORBIDDEN", message: "No tienes permiso para eliminar este promotor" });
        }

        // Soft delete - mark as inactive instead of removing
        promoterGroup.isActive = false;
        await promoterGroup.save();

        return res.status(200).json({ message: "Promotor eliminado exitosamente" });

    } catch (error: any) {
        console.error("Error removing promoter:", error);
        return res.status(500).json({ code: "INTERNAL_ERROR", message: error.message || "Error interno del servidor" });
    }
};

/**
 * Assign a promoter to an event
 * POST /api/promoter/:id/events
 */
export const assignPromoterToEvent = async (req: CustomRequest, res: Response) => {
    try {
        const organizerId = req.user?.id;
        const userRoles = req.user?.roles || [];
        const promoterGroupId = parseInt(req.params.id);

        if (!organizerId) {
            return res.status(401).json({ code: "AUTH_REQUIRED", message: "No autorizado" });
        }

        if (isNaN(promoterGroupId)) {
            return res.status(400).json({ code: "INVALID_ID", message: "ID de promotor inválido" });
        }

        const { eventId, customCommissionPercentage } = req.body;

        if (!eventId) {
            return res.status(400).json({ code: "MISSING_EVENT", message: "ID de evento requerido" });
        }

        const promoterGroup = await PromoterGroup.findOne({
            where: { id: promoterGroupId }
        });

        if (!promoterGroup) {
            return res.status(404).json({ code: "NOT_FOUND", message: "Promotor no encontrado" });
        }

        // Only the owner organizer or admin can assign
        const isAdmin = userRoles.includes('admin');
        if (promoterGroup.organizerId !== organizerId && !isAdmin) {
            return res.status(403).json({ code: "FORBIDDEN", message: "No tienes permiso para asignar este promotor" });
        }

        // Verify the event belongs to the organizer
        const event = await Event.findOne({ where: { id: parseInt(eventId) } });
        if (!event) {
            return res.status(404).json({ code: "EVENT_NOT_FOUND", message: "Evento no encontrado" });
        }

        if (event.user_id !== organizerId && !isAdmin) {
            return res.status(403).json({ code: "FORBIDDEN", message: "No tienes permiso para este evento" });
        }

        // Check if already assigned
        const existingAssignment = await PromoterEventAssignment.findOne({
            where: { promoterGroupId, eventId: parseInt(eventId) }
        });

        if (existingAssignment) {
            return res.status(409).json({ code: "ALREADY_ASSIGNED", message: "El promotor ya está asignado a este evento" });
        }

        // Create assignment
        const assignment = new PromoterEventAssignment();
        assignment.promoterGroupId = promoterGroupId;
        assignment.eventId = parseInt(eventId);
        
        if (customCommissionPercentage !== undefined) {
            const commission = parseFloat(customCommissionPercentage);
            if (isNaN(commission) || commission < 0 || commission > 100) {
                return res.status(400).json({ code: "INVALID_COMMISSION", message: "Comisión inválida" });
            }
            assignment.customCommissionPercentage = commission;
        }

        await assignment.save();

        return res.status(201).json({
            message: "Promotor asignado al evento exitosamente",
            assignment: {
                id: assignment.id,
                eventId: assignment.eventId,
                customCommissionPercentage: assignment.customCommissionPercentage
            }
        });

    } catch (error: any) {
        console.error("Error assigning promoter to event:", error);
        return res.status(500).json({ code: "INTERNAL_ERROR", message: error.message || "Error interno del servidor" });
    }
};

/**
 * Remove a promoter from an event
 * DELETE /api/promoter/:id/events/:eventId
 */
export const removePromoterFromEvent = async (req: CustomRequest, res: Response) => {
    try {
        const organizerId = req.user?.id;
        const userRoles = req.user?.roles || [];
        const promoterGroupId = parseInt(req.params.id);
        const eventId = parseInt(req.params.eventId);

        if (!organizerId) {
            return res.status(401).json({ code: "AUTH_REQUIRED", message: "No autorizado" });
        }

        if (isNaN(promoterGroupId) || isNaN(eventId)) {
            return res.status(400).json({ code: "INVALID_ID", message: "ID inválido" });
        }

        const promoterGroup = await PromoterGroup.findOne({
            where: { id: promoterGroupId }
        });

        if (!promoterGroup) {
            return res.status(404).json({ code: "NOT_FOUND", message: "Promotor no encontrado" });
        }

        // Only the owner organizer or admin can remove
        const isAdmin = userRoles.includes('admin');
        if (promoterGroup.organizerId !== organizerId && !isAdmin) {
            return res.status(403).json({ code: "FORBIDDEN", message: "No tienes permiso" });
        }

        const assignment = await PromoterEventAssignment.findOne({
            where: { promoterGroupId, eventId }
        });

        if (!assignment) {
            return res.status(404).json({ code: "NOT_FOUND", message: "Asignación no encontrada" });
        }

        assignment.isActive = false;
        await assignment.save();

        return res.status(200).json({ message: "Promotor removido del evento exitosamente" });

    } catch (error: any) {
        console.error("Error removing promoter from event:", error);
        return res.status(500).json({ code: "INTERNAL_ERROR", message: error.message || "Error interno del servidor" });
    }
};

/**
 * Get promoter profile (for logged in promoter)
 * GET /api/promoter/profile
 */
export const getPromoterProfile = async (req: CustomRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        const userRoles = req.user?.roles || [];

        if (!userId) {
            return res.status(401).json({ code: "AUTH_REQUIRED", message: "No autorizado" });
        }

        // Only rrpp role can access this endpoint (exact role check)
        if (!userRoles.includes("rrpp")) {
            return res.status(403).json({ code: "FORBIDDEN", message: "Solo promotores pueden acceder" });
        }

        const promoterGroup = await PromoterGroup.findOne({
            where: { promoterId: userId, isActive: true },
            relations: { organizer: true }
        });

        if (!promoterGroup) {
            return res.status(404).json({ code: "NOT_FOUND", message: "No estás asignado a ningún organizador" });
        }

        // Get assigned events
        const eventAssignments = await PromoterEventAssignment.find({
            where: { promoterGroupId: promoterGroup.id, isActive: true },
            relations: { event: true }
        });

        return res.status(200).json({
            id: promoterGroup.id,
            commissionPercentage: promoterGroup.commissionPercentage,
            promoterCode: promoterGroup.promoterCode,
            organizer: {
                id: promoterGroup.organizer?.id,
                firstname: promoterGroup.organizer?.firstname,
                lastname: promoterGroup.organizer?.lastname,
                email: promoterGroup.organizer?.email
            },
            assignedEvents: eventAssignments.map(ea => ({
                id: ea.eventId,
                title: ea.event?.title,
                date: ea.event?.date,
                customCommissionPercentage: ea.customCommissionPercentage
            }))
        });

    } catch (error: any) {
        console.error("Error fetching promoter profile:", error);
        return res.status(500).json({ code: "INTERNAL_ERROR", message: error.message || "Error interno del servidor" });
    }
};

/**
 * Get my assigned events with shareable links (for logged in promoter)
 * GET /api/promoter/my-events
 */
export const getMyAssignedEvents = async (req: CustomRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        const userRoles = req.user?.roles || [];

        if (!userId) {
            return res.status(401).json({ code: "AUTH_REQUIRED", message: "No autorizado" });
        }

        // Only rrpp role can access this endpoint (exact role check)
        if (!userRoles.includes("rrpp")) {
            return res.status(403).json({ code: "FORBIDDEN", message: "Solo promotores pueden acceder" });
        }

        const promoterGroup = await PromoterGroup.findOne({
            where: { promoterId: userId, isActive: true },
            relations: { organizer: true }
        });

        if (!promoterGroup) {
            return res.status(404).json({ code: "NOT_FOUND", message: "No estás asignado a ningún organizador" });
        }

        // Get assigned events with full event details
        const eventAssignments = await PromoterEventAssignment.find({
            where: { promoterGroupId: promoterGroup.id, isActive: true },
            relations: ['event', 'event.category']
        });

        // Build frontend URL from environment or default
        const frontendUrl = env.CLIENT_URL || "https://event-life.netlify.app";

        const assignedEvents = eventAssignments.map(ea => ({
            id: ea.eventId,
            title: ea.event?.title,
            description: ea.event?.description,
            date: ea.event?.date,
            location: ea.event?.ciudad || ea.event?.direccion 
                ? `${ea.event.ciudad || ''}${ea.event.ciudad && ea.event.direccion ? ', ' : ''}${ea.event.direccion || ''}`
                : undefined,
            imgUrl: ea.event?.image,
            category: ea.event?.category?.name,
            customCommissionPercentage: ea.customCommissionPercentage,
            // Generate shareable link with promoter code
            shareableLink: `${frontendUrl}/event/${ea.eventId}?promo=${promoterGroup.promoterCode}`,
            isActive: ea.isActive
        }));

        return res.status(200).json({
            promoterCode: promoterGroup.promoterCode,
            commissionPercentage: promoterGroup.commissionPercentage,
            organizer: {
                id: promoterGroup.organizer?.id,
                firstname: promoterGroup.organizer?.firstname,
                lastname: promoterGroup.organizer?.lastname,
                email: promoterGroup.organizer?.email
            },
            events: assignedEvents
        });

    } catch (error: any) {
        console.error("Error fetching assigned events:", error);
        return res.status(500).json({ code: "INTERNAL_ERROR", message: error.message || "Error interno del servidor" });
    }
};

/**
 * Check if organizer has events
 * GET /api/promoter/has-events
 */
export const checkOrganizerHasEvents = async (req: CustomRequest, res: Response) => {
    try {
        const organizerId = req.user?.id;
        const userRoles = req.user?.roles || [];

        if (!organizerId) {
            return res.status(401).json({ code: "AUTH_REQUIRED", message: "No autorizado" });
        }

        const hasRequiredRole = userRoles.includes('organizer') || userRoles.includes('admin');
        if (!hasRequiredRole) {
            return res.status(403).json({ code: "FORBIDDEN", message: "Acceso denegado" });
        }

        const eventCount = await Event.count({
            where: { user_id: organizerId }
        });

        return res.status(200).json({
            hasEvents: eventCount > 0,
            eventCount
        });

    } catch (error: any) {
        console.error("Error checking events:", error);
        return res.status(500).json({ code: "INTERNAL_ERROR", message: error.message || "Error interno del servidor" });
    }
};
