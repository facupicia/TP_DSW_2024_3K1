import { logger } from "../common/services/logger";
import { Ticket, TicketStatus } from "./ticket.entity";
import { ExtraItem, ExtraItemStatus } from "../extra/extraItem.entity";
import { TicketTypeStatus } from "../ticketType/ticketType.entity";
import AppDataSource from "../db";
import { canValidateEvent } from "../scanner/scanner-permissions";
import { sanitizeTicketCode, getEventDateTime } from "../common/utils/ticket";

export interface ValidationResult {
    success: boolean;
    ticket?: Ticket;
    extra?: ExtraItem;
    type?: 'ticket' | 'extra';
    message?: string;
    code?: string;
    usedAt?: Date;
}

/**
 * Validates a QR code (ticket or extra) and marks it as USED atomically.
 * This is a domain operation shared between ticket and scanner modules.
 */
export async function validateTicket(
    rawCode: string,
    validatorId: number,
    validatorRoles: string[]
): Promise<ValidationResult> {
    const cleanCode = sanitizeTicketCode(rawCode);
    if (!cleanCode) {
        return { success: false, message: "Code is required", code: "INVALID_CODE" };
    }

    // Try ticket first
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

    if (ticket) {
        return validateTicketEntity(ticket, validatorId, validatorRoles);
    }

    // Try extra
    const extra = await AppDataSource.getRepository(ExtraItem)
        .createQueryBuilder("extraItem")
        .leftJoinAndSelect("extraItem.user", "user")
        .leftJoinAndSelect("extraItem.eventProduct", "eventProduct")
        .leftJoinAndSelect("eventProduct.product", "product")
        .leftJoinAndSelect("eventProduct.event", "event")
        .select([
            "extraItem.id",
            "extraItem.codigo_unico",
            "extraItem.status",
            "extraItem.usedAt",
            "extraItem.scannedById",
            "extraItem.quantity",
            "user.id",
            "user.firstname",
            "user.lastname",
            "eventProduct.id",
            "eventProduct.isActive",
            "product.name",
            "event.id",
            "event.title",
            "event.date",
            "event.time",
            "event.active",
            "event.user_id"
        ])
        .where("extraItem.codigo_unico = :code", { code: cleanCode })
        .getOne();

    if (extra) {
        return validateExtraEntity(extra, validatorId, validatorRoles);
    }

    return { success: false, message: "Código inexistente", code: "NOT_FOUND" };
}

async function validateTicketEntity(
    ticket: Ticket,
    validatorId: number,
    validatorRoles: string[]
): Promise<ValidationResult> {
    const isAuthorized = await canValidateEvent(
        validatorId,
        validatorRoles,
        ticket.ticketType.event.id,
        ticket.ticketType.event.user_id
    );

    if (!isAuthorized) {
        return { success: false, message: "No tienes permiso para validar entradas de este evento", code: "FORBIDDEN" };
    }

    if (ticket.status === TicketStatus.USED) {
        return { success: false, message: "Entrada YA utilizada", code: "ALREADY_USED", usedAt: ticket.usedAt };
    }

    if (ticket.status === TicketStatus.CANCELLED) {
        return { success: false, message: "Entrada anulada/cancelada", code: "CANCELLED" };
    }

    if (ticket.ticketType.status !== TicketTypeStatus.ACTIVE) {
        return { success: false, message: "El tipo de entrada no está activo", code: "INACTIVE_TICKET_TYPE" };
    }

    if (!ticket.ticketType.event.active) {
        return { success: false, message: "El evento no está activo", code: "INACTIVE_EVENT" };
    }

    const eventDate = getEventDateTime(ticket.ticketType.event);
    const now = Date.now();
    const hoursDiff = (now - eventDate.getTime()) / (1000 * 60 * 60);

    if (hoursDiff > 24) {
        return {
            success: false,
            message: `Este ticket es de un evento pasado: ${ticket.ticketType.event.title}`,
            code: "EVENT_PAST"
        };
    }

    if (hoursDiff < -3) {
        return {
            success: false,
            message: "El evento aún no comenzó. No se puede validar hasta 3 horas antes del inicio.",
            code: "EVENT_NOT_STARTED"
        };
    }

    const usedAt = new Date();
    const updateResult = await Ticket.update(
        { id: ticket.id, status: TicketStatus.ACTIVE },
        { status: TicketStatus.USED, usedAt, scannedById: validatorId }
    );

    if (!updateResult.affected) {
        return { success: false, message: "Entrada YA utilizada", code: "RACE_CONDITION" };
    }

    ticket.status = TicketStatus.USED;
    ticket.usedAt = usedAt;
    ticket.scannedById = validatorId;

    logger.info("TICKET_VALIDATED", {
        ticketId: ticket.id,
        code: ticket.codigo_unico,
        validatorId,
        eventId: ticket.ticketType.event.id
    });

    return { success: true, ticket, type: 'ticket' };
}

async function validateExtraEntity(
    extra: ExtraItem,
    validatorId: number,
    validatorRoles: string[]
): Promise<ValidationResult> {
    const isAuthorized = await canValidateEvent(
        validatorId,
        validatorRoles,
        extra.eventProduct.event.id,
        extra.eventProduct.event.user_id
    );

    if (!isAuthorized) {
        return { success: false, message: "No tienes permiso para validar extras de este evento", code: "FORBIDDEN" };
    }

    if (extra.status === ExtraItemStatus.USED) {
        return { success: false, message: "Extra YA canjeado", code: "ALREADY_USED", usedAt: extra.usedAt };
    }

    if (extra.status === ExtraItemStatus.CANCELLED) {
        return { success: false, message: "Extra anulado/cancelado", code: "CANCELLED" };
    }

    if (!extra.eventProduct.isActive) {
        return { success: false, message: "El extra no está activo", code: "INACTIVE_EXTRA" };
    }

    if (!extra.eventProduct.event.active) {
        return { success: false, message: "El evento no está activo", code: "INACTIVE_EVENT" };
    }

    const eventDate = getEventDateTime(extra.eventProduct.event);
    const now = Date.now();
    const hoursDiff = (now - eventDate.getTime()) / (1000 * 60 * 60);

    if (hoursDiff > 24) {
        return {
            success: false,
            message: `Este extra es de un evento pasado: ${extra.eventProduct.event.title}`,
            code: "EVENT_PAST"
        };
    }

    if (hoursDiff < -3) {
        return {
            success: false,
            message: "El evento aún no comenzó. No se puede validar hasta 3 horas antes del inicio.",
            code: "EVENT_NOT_STARTED"
        };
    }

    const usedAt = new Date();
    const updateResult = await ExtraItem.update(
        { id: extra.id, status: ExtraItemStatus.ACTIVE },
        { status: ExtraItemStatus.USED, usedAt, scannedById: validatorId }
    );

    if (!updateResult.affected) {
        return { success: false, message: "Extra YA canjeado", code: "RACE_CONDITION" };
    }

    extra.status = ExtraItemStatus.USED;
    extra.usedAt = usedAt;
    extra.scannedById = validatorId;

    logger.info("EXTRA_VALIDATED", {
        extraId: extra.id,
        code: extra.codigo_unico,
        validatorId,
        eventId: extra.eventProduct.event.id
    });

    return { success: true, extra, type: 'extra' };
}
