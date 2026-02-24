import { TicketType } from "../ticketType/ticketType.entity";
import { Ticket, TicketStatus } from "./ticket.entity";
import { User } from "../user/user.entity";
import { generarQRUrl } from "../common/utils/qr";
import enviarCorreoConQR from "../common/services/mailer";
import { logger } from "../common/services/logger";

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

/**
 * Crea tickets para una compra.
 * Genera códigos QR únicos para cada ticket.
 */
export async function createTicketsForPurchase(
    ticketType: TicketType, 
    user: User, 
    amount: number
): Promise<Ticket[]> {
    const { randomUUID } = await import("crypto");
    
    const tickets: Ticket[] = [];
    
    for (let i = 0; i < amount; i++) {
        const codigo_unico = randomUUID();
        const qrCode = await generarQRUrl(codigo_unico);
        
        const ticket = new Ticket();
        ticket.ticketType = ticketType;
        ticket.ticketTypeId = ticketType.id;
        ticket.user = user;
        ticket.userId = user.id;
        ticket.codigo_unico = codigo_unico;
        ticket.qrCode = qrCode;
        ticket.purchasePrice = ticketType.price;
        ticket.status = TicketStatus.ACTIVE;
        
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
        // Formatear fecha del evento (acepta Date o string)
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
        // Loguear error pero no fallar - los tickets ya están creados
        logger.error('TICKET_EMAIL_ERROR', {
            userId: user.id,
            email: userEmail,
            error: error?.message
        });
    }
}
