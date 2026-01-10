import { TicketType } from "../ticketType/ticketType.entity";
import { Ticket, TicketStatus } from "../ticket/ticket.entity";
import { User } from "../user/user.entity";
import { generarQRUrl } from "../utils/qr";

export async function createTicketsForPurchase(ticketType: TicketType, user: User, amount: number) {
    const tickets = await Promise.all(
        Array.from({ length: amount }, async () => {
            const { randomUUID } = await import("crypto");
            const codigo_unico = randomUUID();
            const qrCode = await generarQRUrl(codigo_unico);
            const t = new Ticket();
            t.ticketType = ticketType;
            t.ticketTypeId = ticketType.id;
            t.user = user;
            t.userId = user.id;
            t.codigo_unico = codigo_unico;
            t.qrCode = qrCode;
            t.purchasePrice = ticketType.price;
            t.status = TicketStatus.ACTIVE;
            return t;
        })
    );
    return tickets;
}

