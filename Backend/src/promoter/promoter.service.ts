import { randomUUID } from "crypto";
import AppDataSource from "../db";
import { User } from "../user/user.entity";
import { Role, getRoleNames } from "../user/role.entity";
import { Event } from "../event/event.entity";
import { PromoterGroup, PromoterEventAssignment } from "./promoter.entity";
import { env } from "../config/env";

class HttpError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

// ============================================================================
// ADD PROMOTER
// ============================================================================
export async function addPromoter(
    organizerId: number,
    email: string,
    commissionPercentage: number | undefined,
    notes: string | undefined
) {
    const commission = commissionPercentage !== undefined ? parseFloat(String(commissionPercentage)) : 10;
    if (isNaN(commission) || commission < 0 || commission > 100) {
        throw new HttpError(400, 'INVALID_COMMISSION', 'El porcentaje de comisión debe estar entre 0 y 100');
    }

    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        const promoter = await queryRunner.manager.findOne(User, { where: { email }, relations: ['roles'] });
        if (!promoter) {
            throw new HttpError(404, 'USER_NOT_FOUND', 'El usuario no está registrado en la plataforma. Debe crear una cuenta primero.');
        }

        const existingAssignment = await queryRunner.manager.findOne(PromoterGroup, {
            where: { organizerId, promoterId: promoter.id }
        });
        if (existingAssignment) {
            throw new HttpError(409, 'ALREADY_PROMOTER', 'Este usuario ya es promotor de este organizador');
        }

        const promoterRoleNames = getRoleNames(promoter);
        if (promoterRoleNames.length === 0) promoterRoleNames.push('user');
        if (promoterRoleNames.includes("rrpp")) {
            const otherAssignment = await queryRunner.manager.findOne(PromoterGroup, {
                where: { promoterId: promoter.id }
            });
            if (otherAssignment && otherAssignment.organizerId !== organizerId) {
                throw new HttpError(409, 'PROMOTER_HAS_ORGANIZER', 'Este usuario ya es promotor de otro organizador');
            }
        }

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

        const finalPromoterCode = `PROMO-${randomUUID().substring(0, 8).toUpperCase()}`;
        const existingCode = await queryRunner.manager.findOne(PromoterGroup, {
            where: { promoterCode: finalPromoterCode }
        });
        if (existingCode) {
            throw new HttpError(409, 'CODE_EXISTS', 'El código de promotor ya existe');
        }

        const promoterGroup = new PromoterGroup();
        promoterGroup.organizerId = organizerId;
        promoterGroup.promoterId = promoter.id;
        promoterGroup.commissionPercentage = commission;
        promoterGroup.promoterCode = finalPromoterCode;
        promoterGroup.notes = notes || null;
        promoterGroup.isActive = true;

        await queryRunner.manager.save(PromoterGroup, promoterGroup);
        await queryRunner.commitTransaction();

        return {
            promoter: {
                id: promoter.id,
                email: promoter.email,
                firstname: promoter.firstname,
                lastname: promoter.lastname,
                commissionPercentage: commission,
                promoterCode: finalPromoterCode
            }
        };
    } catch (error) {
        if (queryRunner.isTransactionActive) await queryRunner.rollbackTransaction();
        throw error;
    } finally {
        await queryRunner.release();
    }
}

// ============================================================================
// LIST PROMOTERS
// ============================================================================
export async function listPromoters(organizerId: number, skip: number, take: number) {
    const [promoters, total] = await PromoterGroup.findAndCount({
        where: { organizerId },
        relations: { promoter: true },
        order: { createdAt: "DESC" },
        skip,
        take
    });

    const data = promoters.map(pg => ({
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

    return { data, total };
}

// ============================================================================
// GET BY ID
// ============================================================================
export async function getPromoterById(promoterGroupId: number) {
    const promoterGroup = await PromoterGroup.findOne({
        where: { id: promoterGroupId },
        relations: { promoter: true }
    });
    if (!promoterGroup) {
        throw new HttpError(404, 'NOT_FOUND', 'Promotor no encontrado');
    }

    const eventAssignments = await PromoterEventAssignment.find({
        where: { promoterGroupId: promoterGroup.id },
        relations: { event: true }
    });

    return {
        id: promoterGroup.id,
        promoterId: promoterGroup.promoterId,
        organizerId: promoterGroup.organizerId,
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
    };
}

// ============================================================================
// UPDATE
// ============================================================================
export async function updatePromoter(
    promoterGroupId: number,
    data: {
        commissionPercentage?: number;
        isActive?: boolean;
        notes?: string;
        promoterCode?: string;
    }
) {
    const promoterGroup = await PromoterGroup.findOne({
        where: { id: promoterGroupId },
        relations: { promoter: true }
    });
    if (!promoterGroup) {
        throw new HttpError(404, 'NOT_FOUND', 'Promotor no encontrado');
    }

    if (data.commissionPercentage !== undefined) {
        const commission = parseFloat(String(data.commissionPercentage));
        if (isNaN(commission) || commission < 0 || commission > 100) {
            throw new HttpError(400, 'INVALID_COMMISSION', 'El porcentaje de comisión debe estar entre 0 y 100');
        }
        promoterGroup.commissionPercentage = commission;
    }

    if (data.promoterCode && data.promoterCode !== promoterGroup.promoterCode) {
        const existingCode = await PromoterGroup.findOne({ where: { promoterCode: data.promoterCode } });
        if (existingCode) {
            throw new HttpError(409, 'CODE_EXISTS', 'El código de promotor ya existe');
        }
        promoterGroup.promoterCode = data.promoterCode;
    }

    if (data.isActive !== undefined) promoterGroup.isActive = data.isActive;
    if (data.notes !== undefined) promoterGroup.notes = data.notes;

    await promoterGroup.save();

    return {
        id: promoterGroup.id,
        promoterId: promoterGroup.promoterId,
        commissionPercentage: promoterGroup.commissionPercentage,
        promoterCode: promoterGroup.promoterCode,
        isActive: promoterGroup.isActive,
        notes: promoterGroup.notes
    };
}

// ============================================================================
// REMOVE (SOFT DELETE)
// ============================================================================
export async function removePromoter(promoterGroupId: number) {
    const promoterGroup = await PromoterGroup.findOne({
        where: { id: promoterGroupId },
        relations: { promoter: true }
    });
    if (!promoterGroup) {
        throw new HttpError(404, 'NOT_FOUND', 'Promotor no encontrado');
    }

    promoterGroup.isActive = false;
    await promoterGroup.save();
}

// ============================================================================
// ASSIGN TO EVENT
// ============================================================================
export async function assignToEvent(
    promoterGroupId: number,
    eventId: number,
    customCommissionPercentage?: number
) {
    const promoterGroup = await PromoterGroup.findOne({ where: { id: promoterGroupId } });
    if (!promoterGroup) {
        throw new HttpError(404, 'NOT_FOUND', 'Promotor no encontrado');
    }

    const event = await Event.findOne({ where: { id: eventId } });
    if (!event) {
        throw new HttpError(404, 'EVENT_NOT_FOUND', 'Evento no encontrado');
    }

    if (event.user_id !== promoterGroup.organizerId) {
        throw new HttpError(403, 'FORBIDDEN', 'No tienes permiso para este evento');
    }

    const existingAssignment = await PromoterEventAssignment.findOne({
        where: { promoterGroupId, eventId }
    });
    if (existingAssignment) {
        throw new HttpError(409, 'ALREADY_ASSIGNED', 'El promotor ya está asignado a este evento');
    }

    const assignment = new PromoterEventAssignment();
    assignment.promoterGroupId = promoterGroupId;
    assignment.eventId = eventId;

    if (customCommissionPercentage !== undefined) {
        const commission = parseFloat(String(customCommissionPercentage));
        if (isNaN(commission) || commission < 0 || commission > 100) {
            throw new HttpError(400, 'INVALID_COMMISSION', 'Comisión inválida');
        }
        assignment.customCommissionPercentage = commission;
    }

    await assignment.save();

    return {
        id: assignment.id,
        eventId: assignment.eventId,
        customCommissionPercentage: assignment.customCommissionPercentage
    };
}

// ============================================================================
// REMOVE FROM EVENT
// ============================================================================
export async function removeFromEvent(promoterGroupId: number, eventId: number) {
    const promoterGroup = await PromoterGroup.findOne({ where: { id: promoterGroupId } });
    if (!promoterGroup) {
        throw new HttpError(404, 'NOT_FOUND', 'Promotor no encontrado');
    }

    const assignment = await PromoterEventAssignment.findOne({
        where: { promoterGroupId, eventId }
    });
    if (!assignment) {
        throw new HttpError(404, 'NOT_FOUND', 'Asignación no encontrada');
    }

    assignment.isActive = false;
    await assignment.save();
}

// ============================================================================
// PROMOTER PROFILE
// ============================================================================
export async function getPromoterProfile(userId: number) {
    const promoterGroup = await PromoterGroup.findOne({
        where: { promoterId: userId, isActive: true },
        relations: { organizer: true }
    });
    if (!promoterGroup) {
        throw new HttpError(404, 'NOT_FOUND', 'No estás asignado a ningún organizador');
    }

    const eventAssignments = await PromoterEventAssignment.find({
        where: { promoterGroupId: promoterGroup.id, isActive: true },
        relations: { event: true }
    });

    return {
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
    };
}

// ============================================================================
// MY ASSIGNED EVENTS
// ============================================================================
export async function getMyAssignedEvents(userId: number) {
    const promoterGroup = await PromoterGroup.findOne({
        where: { promoterId: userId, isActive: true },
        relations: { organizer: true }
    });
    if (!promoterGroup) {
        throw new HttpError(404, 'NOT_FOUND', 'No estás asignado a ningún organizador');
    }

    const eventAssignments = await PromoterEventAssignment.find({
        where: { promoterGroupId: promoterGroup.id, isActive: true },
        relations: ['event', 'event.category']
    });

    const frontendUrl = env.CLIENT_URL || "https://event-life.netlify.app";

    const events = eventAssignments.map(ea => ({
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
        shareableLink: `${frontendUrl}/event/${ea.eventId}?promo=${promoterGroup.promoterCode}`,
        isActive: ea.isActive
    }));

    return {
        promoterCode: promoterGroup.promoterCode,
        commissionPercentage: promoterGroup.commissionPercentage,
        organizer: {
            id: promoterGroup.organizer?.id,
            firstname: promoterGroup.organizer?.firstname,
            lastname: promoterGroup.organizer?.lastname,
            email: promoterGroup.organizer?.email
        },
        events
    };
}

// ============================================================================
// CHECK ORGANIZER HAS EVENTS
// ============================================================================
export async function checkOrganizerHasEvents(organizerId: number) {
    const eventCount = await Event.count({ where: { user_id: organizerId } });
    return { hasEvents: eventCount > 0, eventCount };
}
