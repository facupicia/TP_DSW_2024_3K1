import { TicketType, TicketTypeStatus } from "../ticketType/ticketType.entity";
import { Ticket, TicketStatus } from "./ticket.entity";
import { User } from "../user/user.entity";
import { PaymentLog, PaymentStatus } from "../payment/payment.entity";
import { generarQRUrl } from "../common/utils/qr";
import enviarCorreoConQR from "../common/services/mailer";
import { logger } from "../common/services/logger";
import AppDataSource from "../db";
import { getEventDateTime } from "../common/utils/ticket";
import { randomUUID } from "crypto";
import { addSendTicketEmailJob, addSendGuestInvitationJob } from "../queue/email.queue";

/**
 * Ticket Service
 *
 * Servicio especializado en la creación y gestión de tickets.
 */

export interface TicketEmailData {
    qrCode: string;
    ticketId: number;
    eventTitle: string;
    eventDate: string;
    eventLocation: string;
    buyerName: string;
    ticketType: string;
}

export interface PromoterInfo {
    soldByPromoterId: number;
    promoterCommissionPercentage: number;
    promoterCommissionAmount: number;
    promoterCode?: string;
}

class HttpError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

/**
 * Crea tickets para una compra.
 * Genera códigos QR únicos para cada ticket.
 * Si se pasa preGeneratedQrData, usa esos valores en lugar de generar nuevos (para evitar CPU-bound dentro de transacciones).
 */
export async function createTicketsForPurchase(
    ticketType: TicketType,
    user: User,
    amount: number,
    promoterInfo?: PromoterInfo,
    preGeneratedQrData?: Array<{ codigo_unico: string; qrCode: string }>
): Promise<Ticket[]> {
    const tickets: Ticket[] = [];

    const perTicketCommission = promoterInfo
        ? promoterInfo.promoterCommissionAmount / amount
        : null;

    for (let i = 0; i < amount; i++) {
        const codigo_unico = preGeneratedQrData
            ? preGeneratedQrData[i].codigo_unico
            : randomUUID();
        const qrCode = preGeneratedQrData
            ? preGeneratedQrData[i].qrCode
            : await generarQRUrl(codigo_unico);

        const ticket = new Ticket();
        ticket.ticketType = ticketType;
        ticket.ticketTypeId = ticketType.id;
        ticket.user = user;
        ticket.userId = user.id;
        ticket.codigo_unico = codigo_unico;
        ticket.qrCode = qrCode;
        ticket.purchasePrice = ticketType.price;
        ticket.status = TicketStatus.ACTIVE;

        if (promoterInfo) {
            ticket.soldByPromoterId = promoterInfo.soldByPromoterId;
            ticket.promoterCommissionPercentage = promoterInfo.promoterCommissionPercentage;
            ticket.promoterCommissionAmount = perTicketCommission;
            ticket.promoterCode = promoterInfo.promoterCode || null;
        }

        tickets.push(ticket);
    }

    return tickets;
}

/**
 * Envía email con los tickets comprados.
 * Es asíncrono - no bloquea el flujo principal.
 */
export async function sendTicketEmail(
    userEmail: string,
    tickets: Ticket[],
    ticketType: TicketType,
    event: { title: string; date: Date | string; time: string; direccion: string },
    user: User
): Promise<void> {
    if (!userEmail) {
        logger.warn('TICKET_EMAIL_NO_EMAIL', { userId: user.id });
        return;
    }

    try {
        const dateValue = event.date instanceof Date ? event.date : new Date(event.date);
        const formattedDate = !isNaN(dateValue.getTime())
            ? dateValue.toLocaleDateString('es-AR', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            })
            : String(event.date);

        const emailData: TicketEmailData[] = tickets.map(t => ({
            qrCode: t.qrCode!,
            ticketId: t.id,
            eventTitle: event.title,
            eventDate: `${formattedDate} ${event.time}`,
            eventLocation: event.direccion,
            buyerName: `${user.firstname} ${user.lastname}`,
            ticketType: ticketType.name
        }));

        await enviarCorreoConQR(userEmail, emailData);

        logger.info('TICKET_EMAIL_SENT', {
            userId: user.id,
            email: userEmail,
            ticketsCount: tickets.length
        });

    } catch (error: any) {
        logger.error('TICKET_EMAIL_ERROR', {
            userId: user.id,
            email: userEmail,
            error: error?.message
        });
    }
}

/**
 * Procesa una compra de tickets con transacción atómica.
 */
export async function purchase(
    userId: number,
    ticketTypeId: number,
    quantity: number,
    eventIdParam?: string
): Promise<{ tickets: Ticket[]; quantity: number }> {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        const user = await queryRunner.manager.findOne(User, {
            where: { id: userId },
            select: ['id', 'email', 'firstname', 'lastname', 'birth']
        });
        if (!user) throw new HttpError(404, 'USER_NOT_FOUND', "Usuario no encontrado");

        const ticketType = await queryRunner.manager.createQueryBuilder(TicketType, "tt")
            .setLock("pessimistic_write")
            .leftJoinAndSelect("tt.event", "event")
            .where("tt.id = :id", { id: ticketTypeId })
            .getOne();

        if (!ticketType) throw new HttpError(404, 'TICKET_TYPE_NOT_FOUND', "Tipo de ticket no encontrado");
        if (ticketType.status !== TicketTypeStatus.ACTIVE) throw new HttpError(400, 'TICKET_TYPE_INACTIVE', "Este tipo de ticket no está disponible.");

        const event = ticketType.event;
        if (!event) throw new HttpError(404, 'EVENT_NOT_FOUND', "Evento asociado no encontrado");
        if (!event.active) throw new HttpError(400, 'EVENT_INACTIVE', "El evento no está activo.");

        if (eventIdParam && event.id !== parseInt(eventIdParam)) {
            throw new HttpError(400, 'TICKET_TYPE_MISMATCH', "El tipo de ticket no pertenece al evento especificado");
        }

        const capacidadDisponible = ticketType.capacity - ticketType.soldCount;
        if (capacidadDisponible < quantity) {
            throw new HttpError(400, 'NO_STOCK', `No hay suficientes boletos disponibles. Quedan ${capacidadDisponible} boletos.`);
        }

        const eventDateTime = getEventDateTime(event);
        if (new Date() > eventDateTime) {
            throw new HttpError(400, 'EVENT_STARTED', 'Las ventas han cerrado. El evento ya comenzó.');
        }

        if ((event as any).minAge && (event as any).minAge > 0) {
            const birthDate = new Date(user.birth);
            const today = new Date();
            let age = today.getFullYear() - birthDate.getFullYear();
            const monthDiff = today.getMonth() - birthDate.getMonth();
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;
            if (age < (event as any).minAge) {
                throw new HttpError(403, 'AGE_RESTRICTED', `Debes tener al menos ${(event as any).minAge} años para comprar entradas a este evento.`);
            }
        }

        const stockUpdate = await queryRunner.manager
            .createQueryBuilder()
            .update(TicketType)
            .set({ soldCount: () => `"soldCount" + ${quantity}` })
            .where('id = :id', { id: ticketType.id })
            .andWhere('("soldCount" + :amount) <= capacity', { amount: quantity })
            .execute();
        if (!stockUpdate.affected) {
            throw new HttpError(409, 'NO_STOCK', 'No hay stock suficiente para completar la compra.');
        }

        const tickets = await createTicketsForPurchase(ticketType, user, quantity);
        await queryRunner.manager.save(Ticket, tickets);
        await queryRunner.commitTransaction();

        // Post-commit: encolar email en BullMQ para resiliencia ante reinicios
        if (user.email) {
            addSendTicketEmailJob({
                userEmail: user.email,
                userId: user.id,
                userFirstname: user.firstname || '',
                userLastname: user.lastname || '',
                ticketIds: tickets.map(t => t.id),
                ticketTypeId: ticketType.id,
                eventId: event.id,
            }).catch(err => {
                logger.error("TICKET_EMAIL_ENQUEUE_ERROR", { error: err?.message });
            });
        }

        return { tickets, quantity };
    } catch (error) {
        if (queryRunner.isTransactionActive) await queryRunner.rollbackTransaction();
        throw error;
    } finally {
        await queryRunner.release();
    }
}

/**
 * Lista tickets de un usuario con paginación.
 */
export async function findByUser(
    userID: number,
    pagination: { skip: number; take: number }
): Promise<{ tickets: any[]; total: number }> {
    const [tickets, total] = await AppDataSource.getRepository(Ticket)
        .createQueryBuilder("ticket")
        .leftJoinAndSelect("ticket.ticketType", "ticketType")
        .leftJoinAndSelect("ticketType.event", "event")
        .select([
            "ticket.id", "ticket.codigo_unico", "ticket.qrCode", "ticket.ticketTypeId",
            "ticket.userId", "ticket.status", "ticket.purchasePrice", "ticket.usedAt", "ticket.createdAt",
            "ticketType.id", "ticketType.name", "ticketType.price", "ticketType.status",
            "event.id", "event.title", "event.date", "event.time", "event.ciudad", "event.direccion", "event.image"
        ])
        .where("ticket.userId = :userID", { userID })
        .orderBy("ticket.createdAt", "DESC")
        .skip(pagination.skip)
        .take(pagination.take)
        .getManyAndCount();

    const mapped = tickets.map(t => ({
        ...t,
        event: t.ticketType?.event,
        ticketTypeName: t.ticketType?.name
    }));

    return { tickets: mapped, total };
}

/**
 * Obtiene los tickets de la última compra del usuario.
 */
export async function findLastPurchase(userId: number): Promise<{
    tickets: any[];
    status: 'approved' | 'failed' | 'processing' | 'no_logs';
}> {
    const logRepo = AppDataSource.getRepository(PaymentLog);
    const ticketRepo = AppDataSource.getRepository(Ticket);

    const lastLog = await logRepo
        .createQueryBuilder("log")
        .select(["log.id", "log.status", "log.createdAt"])
        .where("log.userId = :userId", { userId })
        .orderBy("log.createdAt", "DESC")
        .getOne();

    if (!lastLog) return { tickets: [], status: 'no_logs' };
    if (lastLog.status === PaymentStatus.FAILED) return { tickets: [], status: 'failed' };
    if (lastLog.status !== PaymentStatus.COMPLETED) return { tickets: [], status: 'processing' };

    let tickets = await ticketRepo
        .createQueryBuilder("ticket")
        .leftJoinAndSelect("ticket.ticketType", "ticketType")
        .leftJoinAndSelect("ticketType.event", "event")
        .select([
            "ticket.id", "ticket.codigo_unico", "ticket.qrCode", "ticket.ticketTypeId",
            "ticket.userId", "ticket.status", "ticket.purchasePrice", "ticket.usedAt", "ticket.createdAt",
            "ticketType.id", "ticketType.name", "ticketType.price",
            "event.id", "event.title", "event.date", "event.time", "event.ciudad", "event.direccion", "event.image"
        ])
        .where("ticket.userId = :userId", { userId })
        .andWhere("ticket.paymentLogId = :paymentLogId", { paymentLogId: lastLog.id })
        .orderBy("ticket.createdAt", "DESC")
        .take(10)
        .getMany();

    // Fallback for legacy tickets without paymentLogId
    if (tickets.length === 0) {
        const fiveMinutesBefore = new Date(lastLog.createdAt.getTime() - 5 * 60 * 1000);
        const fiveMinutesAfter = new Date(lastLog.createdAt.getTime() + 5 * 60 * 1000);
        tickets = await ticketRepo
            .createQueryBuilder("ticket")
            .leftJoinAndSelect("ticket.ticketType", "ticketType")
            .leftJoinAndSelect("ticketType.event", "event")
            .select([
                "ticket.id", "ticket.codigo_unico", "ticket.qrCode", "ticket.ticketTypeId",
                "ticket.userId", "ticket.status", "ticket.purchasePrice", "ticket.usedAt", "ticket.createdAt",
                "ticketType.id", "ticketType.name", "ticketType.price",
                "event.id", "event.title", "event.date", "event.time", "event.ciudad", "event.direccion", "event.image"
            ])
            .where("ticket.userId = :userId", { userId })
            .andWhere("ticket.createdAt BETWEEN :start AND :end", { start: fiveMinutesBefore, end: fiveMinutesAfter })
            .orderBy("ticket.createdAt", "DESC")
            .take(10)
            .getMany();
    }

    const mapped = tickets.map(t => ({
        ...t,
        event: t.ticketType?.event,
        ticketTypeName: t.ticketType?.name
    }));

    return { tickets: mapped, status: 'approved' };
}

/**
 * Cancela un ticket propio (solo gratuitos).
 */
export async function cancel(userId: number, ticketId: number): Promise<{
    success: boolean;
    message: string;
    code?: string;
}> {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        const updateResult = await queryRunner.manager.update(Ticket,
            { id: ticketId, userId, status: TicketStatus.ACTIVE, purchasePrice: 0 },
            { status: TicketStatus.CANCELLED }
        );

        if (updateResult.affected === 0) {
            await queryRunner.rollbackTransaction();

            const ticket = await queryRunner.manager.findOne(Ticket, {
                where: { id: ticketId, userId },
                select: ["id", "status", "purchasePrice"]
            });

            if (!ticket) return { success: false, message: "Ticket no encontrado" };
            if (ticket.status === TicketStatus.USED) return { success: false, message: "Ticket ya fue utilizado" };
            if (ticket.status === TicketStatus.CANCELLED) return { success: false, message: "Ticket ya fue cancelado" };
            if (Number(ticket.purchasePrice) > 0) {
                return {
                    success: false,
                    message: "Los tickets pagos deben cancelarse mediante el flujo de reembolso para mantener consistente el pago y el stock.",
                    code: "PAID_TICKET_REFUND_REQUIRED"
                };
            }
            return { success: false, message: "No se pudo cancelar el ticket" };
        }

        const cancelledTicket = await queryRunner.manager.findOne(Ticket, {
            where: { id: ticketId },
            select: ['ticketTypeId']
        });

        if (cancelledTicket) {
            await queryRunner.manager
                .createQueryBuilder()
                .update(TicketType)
                .set({ soldCount: () => `GREATEST("soldCount" - 1, 0)` })
                .where('id = :id', { id: cancelledTicket.ticketTypeId })
                .execute();
        }

        await queryRunner.commitTransaction();
        return { success: true, message: "Ticket cancelado" };
    } catch (error) {
        if (queryRunner.isTransactionActive) await queryRunner.rollbackTransaction();
        throw error;
    } finally {
        await queryRunner.release();
    }
}

/**
 * Invita guests a un evento gratuito.
 */
export async function inviteGuests(
    organizerId: number,
    ticketTypeId: number,
    emails: string[],
    quantity: number,
    isAdmin: boolean
): Promise<{
    message: string;
    tickets: Array<{ email: string; quantity: number }>;
    totalTickets: number;
    emailsSentWithErrors: boolean;
    errors?: string[];
}> {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();

    try {
        const ticketQty = Number(quantity);
        if (!Number.isInteger(ticketQty) || ticketQty < 1 || ticketQty > 10) {
            throw new HttpError(400, 'INVALID_QUANTITY', "La cantidad debe ser un número entero entre 1 y 10 por invitado");
        }

        if (!emails || !Array.isArray(emails) || emails.length === 0) {
            throw new HttpError(400, 'NO_EMAILS', "Debes proporcionar al menos un email");
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const errors: string[] = [];

        const normalizedEmails = Array.from(
            new Set(
                emails
                    .map((email: unknown) => typeof email === "string" ? email.trim().toLowerCase() : "")
                    .filter(Boolean)
            )
        );

        const validEmails = normalizedEmails.filter((email) => {
            if (!emailRegex.test(email)) {
                errors.push(`Email inválido: ${email}`);
                return false;
            }
            return true;
        });

        if (validEmails.length === 0) {
            throw new HttpError(400, 'INVALID_EMAILS', "No hay emails válidos para invitar");
        }

        const totalRequestedTickets = validEmails.length * ticketQty;
        if (validEmails.length > 50 || totalRequestedTickets > 100) {
            throw new HttpError(400, 'LIMIT_EXCEEDED', "Máximo 50 emails o 100 tickets por solicitud");
        }

        const ticketType = await AppDataSource.getRepository(TicketType).findOne({
            where: { id: ticketTypeId },
            relations: ["event"],
        });

        if (!ticketType) throw new HttpError(404, 'TICKET_TYPE_NOT_FOUND', "Tipo de ticket no encontrado");
        if (!ticketType.event) throw new HttpError(404, 'EVENT_NOT_FOUND', "Evento asociado al tipo de ticket no encontrado");
        if (Number(ticketType.price) > 0) {
            throw new HttpError(400, 'PAID_TICKET_NO_GUESTS', "Solo se pueden invitar guests a tipos de entrada gratuitos");
        }

        const event = ticketType.event;
        if (event.user_id !== organizerId && !isAdmin) {
            throw new HttpError(403, 'FORBIDDEN', "No tienes permiso para invitar a este evento");
        }

        const eventDateTime = getEventDateTime(event);
        if (new Date() > eventDateTime) {
            throw new HttpError(400, 'EVENT_PAST', "No se pueden invitar guests a un evento que ya pasó");
        }

        if (event.minAge && event.minAge > 0) {
            throw new HttpError(400, 'AGE_RESTRICTED', `Este evento requiere edad mínima de ${event.minAge} años. Las invitaciones no verifican edad.`);
        }

        interface EmailTicketInfo {
            qrCode: string;
            ticketId: number | null;
            eventTitle: string;
            eventDate: string;
            eventLocation: string;
            buyerName: string;
            ticketType: string;
        }
        const createdTickets: Array<{ email: string; quantity: number }> = [];
        const ticketsToInsert: Ticket[] = [];
        const emailTicketsMap: Record<string, EmailTicketInfo[]> = {};

        for (const email of validEmails) {
            try {
                const ticketsForThisEmail: EmailTicketInfo[] = [];

                for (let i = 0; i < ticketQty; i++) {
                    const codigo_unico = randomUUID();
                    const qrCode = await generarQRUrl(codigo_unico);

                    const ticket = new Ticket();
                    ticket.ticketTypeId = ticketType.id;
                    ticket.userId = organizerId;
                    ticket.codigo_unico = codigo_unico;
                    ticket.qrCode = qrCode;
                    ticket.purchasePrice = 0;
                    ticket.status = TicketStatus.ACTIVE;

                    ticketsToInsert.push(ticket);

                    ticketsForThisEmail.push({
                        qrCode: ticket.qrCode,
                        ticketId: null,
                        eventTitle: event.title,
                        eventDate: `${new Date(event.date).toLocaleDateString("es-AR", {
                            weekday: "long", year: "numeric", month: "long", day: "numeric",
                        })} ${event.time}`,
                        eventLocation: event.direccion || event.ciudad || "",
                        buyerName: "Invitado",
                        ticketType: ticketType.name,
                    });
                }

                emailTicketsMap[email] = ticketsForThisEmail;
                createdTickets.push({ email, quantity: ticketsForThisEmail.length });
            } catch (ticketErr) {
                const msg = ticketErr instanceof Error ? ticketErr.message : "Error desconocido";
                errors.push(`Error creando ticket para ${email}: ${msg}`);
            }
        }

        if (ticketsToInsert.length === 0) {
            throw new HttpError(400, 'NO_TICKETS_CREATED', "No se pudo crear ninguna invitación");
        }

        const requestedTickets = ticketsToInsert.length;

        await queryRunner.startTransaction();

        const stockUpdate = await queryRunner.manager
            .createQueryBuilder()
            .update(TicketType)
            .set({ soldCount: () => `"soldCount" + ${requestedTickets}` })
            .where("id = :id", { id: ticketType.id })
            .andWhere(`"soldCount" + ${requestedTickets} <= "capacity"`)
            .execute();

        if (!stockUpdate.affected) {
            const freshTicketType = await queryRunner.manager.findOne(TicketType, {
                where: { id: ticketType.id },
            });
            await queryRunner.rollbackTransaction();
            const availableStock = freshTicketType ? Math.max(freshTicketType.capacity - freshTicketType.soldCount, 0) : 0;
            throw new HttpError(400, 'NO_STOCK', `Stock insuficiente. Disponibles: ${availableStock}, Solicitados: ${requestedTickets}`);
        }

        const savedTickets = await queryRunner.manager.save(Ticket, ticketsToInsert);
        await queryRunner.commitTransaction();

        let ticketIndex = 0;
        for (const email of Object.keys(emailTicketsMap)) {
            const ticketsForThisEmail = emailTicketsMap[email];
            const ticketIdsForEmail: number[] = [];
            for (const ticketMailData of ticketsForThisEmail) {
                if (ticketIndex < savedTickets.length) {
                    ticketMailData.ticketId = savedTickets[ticketIndex].id;
                    ticketIdsForEmail.push(savedTickets[ticketIndex].id);
                    ticketIndex++;
                }
            }
            addSendGuestInvitationJob({
                email,
                ticketIds: ticketIdsForEmail,
                ticketTypeId: ticketType.id,
                eventId: event.id,
            }).catch((emailErr: any) => {
                logger.error(`GUEST_INVITE_ENQUEUE_ERROR ${email}:`, emailErr);
            });
        }

        return {
            message: `${savedTickets.length} ticket(s) creado(s) para ${createdTickets.length} invitado(s)`,
            tickets: createdTickets,
            totalTickets: savedTickets.length,
            emailsSentWithErrors: false,
        };
    } catch (error) {
        if (queryRunner.isTransactionActive) await queryRunner.rollbackTransaction();
        throw error;
    } finally {
        await queryRunner.release();
    }
}
