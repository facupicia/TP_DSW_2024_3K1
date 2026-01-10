

import { Categoria } from './categoria';

export interface TicketType {
    id?: number;
    name: string;
    description?: string;
    price: number;
    capacity: number;
    soldCount?: number;
    active?: boolean;
}

export interface Evento {
    destacado: boolean;
    user_id: number;
    id?: number;
    title: string;
    description: string;
    date: Date;
    pais: string;
    provincia: string;
    ciudad: string;
    direccion?: string;
    organizer: string;
    image: string;
    time: string;
    categoryId?: number;
    categoria_name?: string;
    category?: Categoria | any;
    ticketTypes?: TicketType[];
    minAge?: number; // 0 = sin restricción, 18 = +18, etc.
    // Legacy fields (optional/deprecated for display)
    capacity?: number;
    price?: number;
}

