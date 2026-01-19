import { Request, Response } from "express";
import { Ticket, TicketStatus } from "./ticket.entity";
import { TicketType, TicketTypeStatus } from "../ticketType/ticketType.entity";
import { CustomRequest } from "../common/middleware/authToken";
import { User } from "../user/user.entity";
import { Event } from "../event/event.entity";
import { PaymentStatus } from "../payment/payment.entity";
import { generarQRUrl } from "../common/utils/qr";
import enviarCorreoConQR from "../common/services/mailer";
import { createTicketsForPurchase } from "./ticket.service";
import { PaymentLog } from "../payment/payment.entity";
import AppDataSource from "../db";

export const createTicket = async (req: CustomRequest, res: Response) => {
    // 0. Validaciones Previas (Fail Fast)
    const { cantidad, ticketTypeId } = req.body;
    const userId = req.user?.id;

    if (!userId) {
        return res.status(401).json({ message: "No autorizado. Token inválido o expirado." });
    }

    if (!ticketTypeId) {
        return res.status(400).json({ message: "ID del tipo de ticket no proporcionado." });
    }

    const cantidadTickets = parseInt(cantidad);
    if (isNaN(cantidadTickets) || cantidadTickets <= 0) {
        return res.status(400).json({ message: "Cantidad inválida." });
    }

    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        // 1. Buscar Usuario
        const user = await queryRunner.manager.findOne(User, { where: { id: userId } });
        if (!user) {
            return res.status(404).json({ message: "Usuario no encontrado" });
        }

        // 2. Buscar TicketType (con bloqueo pesimista) y Evento
        const ticketType = await queryRunner.manager.createQueryBuilder(TicketType, "tt")
            .setLock("pessimistic_write")
            .leftJoinAndSelect("tt.event", "event")
            .where("tt.id = :id", { id: ticketTypeId })
            .getOne();

        if (!ticketType) {
            return res.status(404).json({ message: "Tipo de ticket no encontrado" });
        }

        if (ticketType.status !== TicketTypeStatus.ACTIVE) {
            return res.status(400).json({ message: "Este tipo de ticket no está disponible." });
        }

        const event = ticketType.event;
        if (!event) {
            return res.status(404).json({ message: "Evento asociado no encontrado" });
        }

        // Verificar que el ticketType pertenezca al evento de la URL (si se provee)
        const { id: eventIdParam } = req.params;
        if (eventIdParam && event.id !== parseInt(eventIdParam)) {
            return res.status(400).json({ message: "El tipo de ticket no pertenece al evento especificado" });
        }

        // 3. Verificar Stock
        const capacidadDisponible = ticketType.capacity - ticketType.soldCount;

        if (capacidadDisponible < cantidadTickets) {
            return res.status(400).json({ message: `No hay suficientes boletos disponibles. Quedan ${capacidadDisponible} boletos.` });
        }

        // 3.1 Validar que el evento no haya comenzado
        const eventDateTime = new Date(`${event.date}T${event.time}`);
        if (new Date() > eventDateTime) {
            return res.status(400).json({
                code: 'EVENT_STARTED',
                message: 'Las ventas han cerrado. El evento ya comenzó.'
            });
        }

        // 3.2 Validar edad mínima si aplica
        if ((event as any).minAge && (event as any).minAge > 0) {
            const birthDate = new Date(user.birth);
            const today = new Date();
            let age = today.getFullYear() - birthDate.getFullYear();
            const monthDiff = today.getMonth() - birthDate.getMonth();
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                age--;
            }

            if (age < (event as any).minAge) {
                return res.status(403).json({
                    code: 'AGE_RESTRICTED',
                    message: `Debes tener al menos ${(event as any).minAge} años para comprar entradas a este evento.`
                });
            }
        }

        // 4. Actualizar Stock
        ticketType.soldCount += cantidadTickets;
        await queryRunner.manager.save(ticketType);

        // 5. Crear Tickets
        const tickets = await createTicketsForPurchase(ticketType, user, cantidadTickets);
        await queryRunner.manager.save(Ticket, tickets);

        // 6. Enviar Correo
        if (user.email) {
            const dateObj = new Date(event.date);
            const formattedDate = !isNaN(dateObj.getTime())
                ? dateObj.toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
                : String(event.date);

            try {
                await enviarCorreoConQR(user.email, tickets.map(ticket => ({
                    qrCode: ticket.qrCode!,
                    ticketId: ticket.id,
                    eventTitle: event.title,
                    eventDate: `${formattedDate} ${event.time}`,
                    eventLocation: event.direccion,
                    buyerName: `${user.firstname} ${user.lastname}`,
                    ticketType: ticketType.name
                })));
            } catch (emailErr) {
                console.error("Error enviando email (no bloqueante):", emailErr);
            }
        }

        await queryRunner.commitTransaction();

        return res.status(201).json({ message: `${cantidadTickets} ticket(s) creado(s) exitosamente` });

    } catch (error: any) {
        if (queryRunner.isTransactionActive) {
            await queryRunner.rollbackTransaction();
        }
        return res.status(500).json({ message: 'Error interno del servidor', error: error.message });
    } finally {
        await queryRunner.release();
    }
}

export const getTickets = async (req: CustomRequest, res: Response) => {
    try {
        const { id: userID } = req.params;

        const tickets = await Ticket.find({
            where: { userId: parseInt(userID) },
            relations: { ticketType: { event: true } },
            order: { createdAt: 'DESC' }
        });

        const mappedTickets = tickets.map(t => ({
            ...t,
            event: t.ticketType?.event,
            ticketTypeName: t.ticketType?.name
        }));

        return res.status(200).json(mappedTickets);
    } catch (error: any) {
        return res.status(500).json({ message: 'Error interno del servidor', error: error.message });
    }
}

export const getLastPurchaseTickets = async (req: CustomRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ code: 'AUTH_REQUIRED', message: 'No autorizado' });
        }

        if (!AppDataSource.isInitialized) await AppDataSource.initialize();

        const logRepo = AppDataSource.getRepository(PaymentLog);
        const ticketRepo = AppDataSource.getRepository(Ticket);

        // Último pago
        const lastLog = await logRepo.findOne({
            where: { userId },
            order: { createdAt: 'DESC' }
        });

        if (!lastLog) {
            return res.status(200).json({ tickets: [], status: 'no_logs' });
        }

        if (lastLog.status !== PaymentStatus.COMPLETED) {
            return res.status(200).json({ tickets: [], status: 'processing' });
        }

        // Tickets asociados al tipo de ticket del último pago
        const tickets = await ticketRepo.find({
            where: {
                userId,
                ticketTypeId: lastLog.ticketTypeId!
            },
            order: { createdAt: 'DESC' },
            relations: { ticketType: { event: true } },
            take: 10
        });

        const mappedTickets = tickets.map(t => ({
            ...t,
            event: t.ticketType?.event,
            ticketTypeName: t.ticketType?.name
        }));

        return res.status(200).json({
            tickets: mappedTickets,
            status: 'approved'
        });

    } catch (error: any) {
        console.error("ERROR REAL:", error);
        return res.status(500).json({ message: 'Error interno del servidor' });
    }
};

export const validateTicket = async (req: Request, res: Response) => {
    try {
        const { code } = req.body;

        const ticket = await Ticket.findOne({
            where: [{ codigo_unico: code }, { id: parseInt(code) || -1 }],
            relations: { ticketType: { event: true }, user: true }
        });

        if (!ticket) {
            return res.status(404).json({ message: "Ticket no encontrado", valid: false });
        }

        if (ticket.status === TicketStatus.USED) {
            return res.status(400).json({
                message: "Ticket ya fue utilizado",
                valid: false,
                usedAt: ticket.usedAt
            });
        }

        if (ticket.status === TicketStatus.CANCELLED) {
            return res.status(400).json({ message: "Ticket cancelado", valid: false });
        }

        // Marcar como usado
        ticket.status = TicketStatus.USED;
        ticket.usedAt = new Date();
        await ticket.save();

        return res.json({
            message: "Ticket válido. Acceso permitido.",
            valid: true,
            ticket: {
                id: ticket.id,
                event: ticket.ticketType?.event?.title,
                ticketType: ticket.ticketType?.name,
                user: `${ticket.user?.firstname} ${ticket.user?.lastname}`,
                status: ticket.status
            }
        });

    } catch (error) {
        if (error instanceof Error) {
            return res.status(500).json({ message: error.message });
        }
    }
};

export const cancelTicket = async (req: CustomRequest, res: Response) => {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
        const { id } = req.params;
        const userId = req.user?.id;

        if (!userId) {
            await queryRunner.rollbackTransaction();
            return res.status(401).json({ message: "No autorizado" });
        }

        const ticket = await queryRunner.manager.findOne(Ticket, {
            where: { id: parseInt(id), userId },
            relations: { ticketType: true }
        });

        if (!ticket) {
            await queryRunner.rollbackTransaction();
            return res.status(404).json({ message: "Ticket no encontrado" });
        }

        if (ticket.status === TicketStatus.USED || ticket.status === TicketStatus.CANCELLED) {
            await queryRunner.rollbackTransaction();
            return res.status(400).json({ message: `Ticket ya ${ticket.status === TicketStatus.USED ? 'utilizado' : 'cancelado'}` });
        }

        // Cancelar ticket
        ticket.status = TicketStatus.CANCELLED;
        await queryRunner.manager.save(Ticket, ticket);

        // Restaurar stock
        if (ticket.ticketType) {
            const ticketType = await queryRunner.manager.findOne(TicketType, {
                where: { id: ticket.ticketType.id },
                relations: { event: true }
            });

            if (ticketType) {
                ticketType.soldCount -= 1;
                await queryRunner.manager.save(TicketType, ticketType);
            }
        }

        await queryRunner.commitTransaction();
        return res.status(200).json({ message: "Ticket cancelado", ticketId: ticket.id });

    } catch (error: any) {
        await queryRunner.rollbackTransaction();
        return res.status(500).json({ message: 'Error interno del servidor', error: error.message });
    } finally {
        await queryRunner.release();
    }
}

/**
 * INVITE GUESTS (Free Tickets)
 * POST /ticket/invite
 * Allows organizers to create free tickets and send them via email
 */
export const inviteGuests = async (req: CustomRequest, res: Response) => {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ message: "No autorizado" });
        }

        const { ticketTypeId, emails } = req.body;

        // Validate emails
        if (!emails || !Array.isArray(emails) || emails.length === 0) {
            return res.status(400).json({ message: "Debes proporcionar al menos un email" });
        }

        // Limit to prevent abuse (max 50 invites per request)
        if (emails.length > 50) {
            return res.status(400).json({ message: "Máximo 50 invitaciones por solicitud" });
        }

        // Get ticket type with event
        const ticketType = await queryRunner.manager.findOne(TicketType, {
            where: { id: ticketTypeId },
            relations: ["event"]
        });

        if (!ticketType) {
            return res.status(404).json({ message: "Tipo de ticket no encontrado" });
        }

        // Verify organizer owns the event
        if (ticketType.event.user_id !== userId) {
            return res.status(403).json({ message: "No tienes permiso para invitar a este evento" });
        }

        const event = ticketType.event;
        const createdTickets: any[] = [];
        const errors: string[] = [];

        for (const email of emails) {
            try {
                // Validate email format
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(email)) {
                    errors.push(`Email inválido: ${email}`);
                    continue;
                }

                // Generate unique code and QR
                const { randomUUID } = await import("crypto");
                const codigo_unico = randomUUID();
                const qrCode = await generarQRUrl(codigo_unico);

                // Create ticket with price 0 (free)
                const ticket = new Ticket();
                ticket.ticketType = ticketType;
                ticket.ticketTypeId = ticketType.id;
                ticket.userId = userId; // Temporarily assigned to organizer
                ticket.codigo_unico = codigo_unico;
                ticket.qrCode = qrCode;
                ticket.purchasePrice = 0; // FREE
                ticket.status = TicketStatus.ACTIVE;

                await queryRunner.manager.save(Ticket, ticket);

                // Send email with QR
                const dateObj = new Date(event.date);
                const formattedDate = !isNaN(dateObj.getTime())
                    ? dateObj.toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
                    : String(event.date);

                try {
                    await enviarCorreoConQR(email, [{
                        qrCode: ticket.qrCode,
                        ticketId: ticket.id,
                        eventTitle: event.title,
                        eventDate: `${formattedDate} ${event.time}`,
                        eventLocation: event.direccion || event.ciudad || '',
                        buyerName: 'Invitado',
                        ticketType: ticketType.name
                    }]);
                } catch (emailErr) {
                    console.error(`Error enviando email a ${email}:`, emailErr);
                    errors.push(`Error enviando a: ${email}`);
                }

                createdTickets.push({
                    id: ticket.id,
                    email,
                    codigo_unico: ticket.codigo_unico
                });

            } catch (ticketErr: any) {
                errors.push(`Error creando ticket para ${email}: ${ticketErr.message}`);
            }
        }

        await queryRunner.commitTransaction();

        return res.status(201).json({
            message: `${createdTickets.length} invitación(es) enviada(s)`,
            tickets: createdTickets,
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (error: any) {
        if (queryRunner.isTransactionActive) {
            await queryRunner.rollbackTransaction();
        }
        console.error("Error inviting guests:", error);
        return res.status(500).json({ message: 'Error al enviar invitaciones', error: error.message });
    } finally {
        await queryRunner.release();
    }
};
