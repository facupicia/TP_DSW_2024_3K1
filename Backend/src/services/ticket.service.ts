import { Event } from "../event/event.entity";
import { Ticket, TicketStatus } from "../ticket/ticket.entity";
import { User } from "../user/user.entity";
import { generarQRUrl } from "../utils/qr";

export async function createTicketsForPurchase(event: Event, user: User, amount: number) {
    const tickets = await Promise.all(
        Array.from({ length: amount }, async () => {
            const { randomUUID } = await import("crypto");
            const codigo_unico = randomUUID();
            const qrCode = await generarQRUrl(codigo_unico);
            const t = new Ticket();
            t.event = event;
            t.user = user;
            t.eventId = event.id;
            t.userId = user.id;
            t.codigo_unico = codigo_unico;
            t.qrCode = qrCode;
            t.titleEvent = event.title;
            t.purchasePrice = event.price;
            t.status = TicketStatus.VALID;
            return t;
        })
    );
    return tickets;
}

