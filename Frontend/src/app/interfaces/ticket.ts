export interface EventSummary {
    id: number;
    title: string;
    date: string;
    time: string;
    ciudad: string;
    direccion: string;
    image: string;
}

export interface TicketTypeSummary {
    id: number;
    name: string;
    price: number;
}

export interface UserTicket {
    id: number;
    codigo_unico: string;
    qrCode: string;
    ticketTypeId: number;
    userId: number;
    status: 'active' | 'used' | 'cancelled' | 'refunded';
    purchasePrice: number;
    usedAt: string | null;
    createdAt: string;
    event?: EventSummary;
    ticketTypeName?: string;
}

/**
 * @deprecated La interfaz Ticket solo declara quantity y no refleja
 * la respuesta real del backend. Usar UserTicket en su lugar.
 */
export interface Ticket {
    quantity: number;
}
