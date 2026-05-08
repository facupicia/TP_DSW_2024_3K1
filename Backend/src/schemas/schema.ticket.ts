import { z } from "zod";

export const createTicketSchema = z.object({
    cantidad: z.coerce.number().int().min(1).max(10),
    ticketTypeId: z.coerce.number().int().positive(),
});

export const cancelTicketSchema = z.object({
    id: z.coerce.number().int().positive(),
});

export const validateTicketSchema = z.object({
    code: z.string().min(1).max(500),
});

export const inviteGuestsSchema = z.object({
    ticketTypeId: z.coerce.number().int().positive(),
    emails: z.array(z.string().email()).min(1).max(50),
    quantity: z.coerce.number().int().min(1).max(10).optional().default(1),
});

export const getTicketsSchema = z.object({
    id: z.coerce.number().int().positive(),
});
