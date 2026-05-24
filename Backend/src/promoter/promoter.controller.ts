import { Request, Response } from "express";
import { logger } from "../common/services/logger";
import { CustomRequest } from "../common/middleware/authToken";
import { getPagination } from "../common/services/pagination";
import {
    addPromoter as addPromoterSvc,
    listPromoters,
    getPromoterById as getPromoterByIdSvc,
    updatePromoter as updatePromoterSvc,
    removePromoter as removePromoterSvc,
    assignToEvent,
    removeFromEvent,
    getPromoterProfile as getPromoterProfileSvc,
    getMyAssignedEvents as getMyAssignedEventsSvc,
    checkOrganizerHasEvents as checkOrganizerHasEventsSvc
} from "./promoter.service";

function handleServiceError(error: any, res: Response) {
    const status = error.status || 500;
    const code = error.code || "INTERNAL_ERROR";
    if (status >= 500) {
        logger.error("Promoter service error:", error);
    }
    return res.status(status).json({ code, message: error.message || "Error interno del servidor" });
}

function checkOrganizerAuth(req: CustomRequest): { organizerId: number; isAdmin: boolean } | null {
    const organizerId = req.user?.id;
    const userRoles = req.user?.roles || [];
    if (!organizerId) return null;
    const isAdmin = userRoles.includes('admin');
    const hasRequiredRole = userRoles.includes('organizer') || isAdmin;
    if (!hasRequiredRole) return null;
    return { organizerId, isAdmin };
}

function checkPromoterAuth(req: CustomRequest): number | null {
    const userId = req.user?.id;
    const userRoles = req.user?.roles || [];
    if (!userId || !userRoles.includes('rrpp')) return null;
    return userId;
}

// ============================================================================
// ADD PROMOTER
// ============================================================================
export const addPromoter = async (req: CustomRequest, res: Response) => {
    const auth = checkOrganizerAuth(req);
    if (!auth) return res.status(401).json({ code: "AUTH_REQUIRED", message: "No autorizado" });

    const { email, commissionPercentage, notes } = req.body;
    if (!email) {
        return res.status(400).json({ code: "MISSING_EMAIL", message: "El email es requerido" });
    }

    try {
        const result = await addPromoterSvc(auth.organizerId, email, commissionPercentage, notes);
        return res.status(201).json({ message: "Promotor agregado exitosamente.", promoter: result.promoter });
    } catch (error: any) {
        if (error.code === '23505') {
            if (error.detail?.includes('promoterCode')) {
                return res.status(409).json({ code: "CODE_EXISTS", message: "El código de promotor ya existe. Intenta nuevamente." });
            }
            if (error.detail?.includes('organizerId') && error.detail?.includes('promoterId')) {
                return res.status(409).json({ code: "ALREADY_PROMOTER", message: "Este usuario ya es promotor de este organizador" });
            }
            return res.status(409).json({ code: "DUPLICATE_ENTRY", message: "Registro duplicado. Es posible que el promotor ya exista." });
        }
        if (error.message?.includes('violates unique constraint') || error.message?.includes('duplicate key')) {
            return res.status(409).json({ code: "DUPLICATE_KEY", message: "Error de clave duplicada. Contacta al administrador." });
        }
        return handleServiceError(error, res);
    }
};

// ============================================================================
// LIST PROMOTERS
// ============================================================================
export const getMyPromoters = async (req: CustomRequest, res: Response) => {
    const auth = checkOrganizerAuth(req);
    if (!auth) return res.status(401).json({ code: "AUTH_REQUIRED", message: "No autorizado" });

    try {
        const { skip, take } = getPagination(req.query, 50, 100);
        const result = await listPromoters(auth.organizerId, skip, take);
        return res.status(200).json(result);
    } catch (error: any) {
        return handleServiceError(error, res);
    }
};

// ============================================================================
// GET BY ID
// ============================================================================
export const getPromoterById = async (req: CustomRequest, res: Response) => {
    const auth = checkOrganizerAuth(req);
    if (!auth) return res.status(401).json({ code: "AUTH_REQUIRED", message: "No autorizado" });

    const promoterGroupId = parseInt(req.params.id);
    if (isNaN(promoterGroupId)) {
        return res.status(400).json({ code: "INVALID_ID", message: "ID inválido" });
    }

    try {
        const result = await getPromoterByIdSvc(promoterGroupId);
        if (result.organizerId !== auth.organizerId && !auth.isAdmin) {
            return res.status(403).json({ code: "FORBIDDEN", message: "No tienes permiso para ver este promotor" });
        }
        return res.status(200).json(result);
    } catch (error: any) {
        return handleServiceError(error, res);
    }
};

// ============================================================================
// UPDATE
// ============================================================================
export const updatePromoter = async (req: CustomRequest, res: Response) => {
    const auth = checkOrganizerAuth(req);
    if (!auth) return res.status(401).json({ code: "AUTH_REQUIRED", message: "No autorizado" });

    const promoterGroupId = parseInt(req.params.id);
    if (isNaN(promoterGroupId)) {
        return res.status(400).json({ code: "INVALID_ID", message: "ID inválido" });
    }

    try {
        const existing = await getPromoterByIdSvc(promoterGroupId);
        if (existing.organizerId !== auth.organizerId && !auth.isAdmin) {
            return res.status(403).json({ code: "FORBIDDEN", message: "No tienes permiso para actualizar este promotor" });
        }
        const result = await updatePromoterSvc(promoterGroupId, req.body);
        return res.status(200).json({ message: "Promotor actualizado exitosamente", promoter: result });
    } catch (error: any) {
        return handleServiceError(error, res);
    }
};

// ============================================================================
// REMOVE
// ============================================================================
export const removePromoter = async (req: CustomRequest, res: Response) => {
    const auth = checkOrganizerAuth(req);
    if (!auth) return res.status(401).json({ code: "AUTH_REQUIRED", message: "No autorizado" });

    const promoterGroupId = parseInt(req.params.id);
    if (isNaN(promoterGroupId)) {
        return res.status(400).json({ code: "INVALID_ID", message: "ID inválido" });
    }

    try {
        const existing = await getPromoterByIdSvc(promoterGroupId);
        if (existing.organizerId !== auth.organizerId && !auth.isAdmin) {
            return res.status(403).json({ code: "FORBIDDEN", message: "No tienes permiso para eliminar este promotor" });
        }
        await removePromoterSvc(promoterGroupId);
        return res.status(200).json({ message: "Promotor eliminado exitosamente" });
    } catch (error: any) {
        return handleServiceError(error, res);
    }
};

// ============================================================================
// ASSIGN TO EVENT
// ============================================================================
export const assignPromoterToEvent = async (req: CustomRequest, res: Response) => {
    const auth = checkOrganizerAuth(req);
    if (!auth) return res.status(401).json({ code: "AUTH_REQUIRED", message: "No autorizado" });

    const promoterGroupId = parseInt(req.params.id);
    if (isNaN(promoterGroupId)) {
        return res.status(400).json({ code: "INVALID_ID", message: "ID de promotor inválido" });
    }

    const { eventId, customCommissionPercentage } = req.body;
    if (!eventId) {
        return res.status(400).json({ code: "MISSING_EVENT", message: "ID de evento requerido" });
    }

    try {
        const result = await assignToEvent(promoterGroupId, parseInt(eventId), customCommissionPercentage);
        return res.status(201).json({ message: "Promotor asignado al evento exitosamente", assignment: result });
    } catch (error: any) {
        return handleServiceError(error, res);
    }
};

// ============================================================================
// REMOVE FROM EVENT
// ============================================================================
export const removePromoterFromEvent = async (req: CustomRequest, res: Response) => {
    const auth = checkOrganizerAuth(req);
    if (!auth) return res.status(401).json({ code: "AUTH_REQUIRED", message: "No autorizado" });

    const promoterGroupId = parseInt(req.params.id);
    const eventId = parseInt(req.params.eventId);
    if (isNaN(promoterGroupId) || isNaN(eventId)) {
        return res.status(400).json({ code: "INVALID_ID", message: "ID inválido" });
    }

    try {
        await removeFromEvent(promoterGroupId, eventId);
        return res.status(200).json({ message: "Promotor removido del evento exitosamente" });
    } catch (error: any) {
        return handleServiceError(error, res);
    }
};

// ============================================================================
// PROMOTER PROFILE
// ============================================================================
export const getPromoterProfile = async (req: CustomRequest, res: Response) => {
    const userId = checkPromoterAuth(req);
    if (!userId) return res.status(401).json({ code: "AUTH_REQUIRED", message: "No autorizado" });

    try {
        const result = await getPromoterProfileSvc(userId);
        return res.status(200).json(result);
    } catch (error: any) {
        return handleServiceError(error, res);
    }
};

// ============================================================================
// MY ASSIGNED EVENTS
// ============================================================================
export const getMyAssignedEvents = async (req: CustomRequest, res: Response) => {
    const userId = checkPromoterAuth(req);
    if (!userId) return res.status(401).json({ code: "AUTH_REQUIRED", message: "No autorizado" });

    try {
        const result = await getMyAssignedEventsSvc(userId);
        return res.status(200).json(result);
    } catch (error: any) {
        return handleServiceError(error, res);
    }
};

// ============================================================================
// CHECK ORGANIZER HAS EVENTS
// ============================================================================
export const checkOrganizerHasEvents = async (req: CustomRequest, res: Response) => {
    const auth = checkOrganizerAuth(req);
    if (!auth) return res.status(401).json({ code: "AUTH_REQUIRED", message: "No autorizado" });

    try {
        const result = await checkOrganizerHasEventsSvc(auth.organizerId);
        return res.status(200).json(result);
    } catch (error: any) {
        return handleServiceError(error, res);
    }
};
