export interface Ticket {
    id: number;
    codigo_unico: string;
    qrCode: string;
    ticketTypeId: number;
    userId: number;
    status: 'active' | 'used' | 'cancelled';
    purchasePrice: number;
    usedAt?: string;
    createdAt: string;
    ticketType?: {
        id: number;
        name: string;
        price: number;
        status: string;
        event?: {
            id: number;
            title: string;
            date: string;
            time: string;
            ciudad: string;
            direccion?: string;
            image?: string;
        };
    };
    user?: {
        firstname: string;
        lastname: string;
        imgPerfil?: string;
    };
    quantity?: number;
}
