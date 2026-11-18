import { IANAZone, DateTime } from 'luxon';
import { z } from "zod";

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;
const numericInput = (schema: z.ZodNumber) => z.union([
    z.number(), z.string().trim().regex(/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/).transform(Number)
]).pipe(schema.finite());
const positiveId = numericInput(z.number().int().positive());
const capacity = numericInput(z.number().int().min(0).max(2147483647));
const price = numericInput(z.number().nonnegative().max(9999999999.99));
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => DateTime.fromISO(value).isValid, 'Fecha inválida');
const eventFields = {
    title: z.string().trim().min(1).max(200),
    pais: z.string().trim().min(1).max(100),
    provincia: z.string().trim().min(1).max(100),
    ciudad: z.string().trim().min(1).max(100),
    direccion: z.string().trim().min(1).max(255),
    organizer: z.string().trim().min(1).max(200),
    image: z.string().max(2048).optional(),
    date,
    timeZone: z.string().max(100).refine(zone => IANAZone.isValidZone(zone), 'Zona horaria inválida').optional(),
    time: z.string().regex(timeRegex, 'Formato de hora inválido'),
    description: z.string().min(1).max(10000),
    categoryId: positiveId,
    destacado: z.boolean().optional(),
    minAge: numericInput(z.number().int().min(0).max(99)).optional(),
    isPublic: z.boolean().optional()
};
const newTicket = z.object({
    name: z.string().trim().min(1).max(200), price,
    capacity: numericInput(z.number().int().positive().max(2147483647)),
    description: z.string().max(2000).optional(), active: z.boolean().optional()
});
const ticketPatch = z.object({
    id: z.preprocess(value => value === '' || value === undefined ? null : value, positiveId.nullable()),
    name: z.string().trim().min(1).max(200).optional(), price: price.optional(), capacity: capacity.optional(),
    description: z.string().max(2000).nullable().optional(), active: z.boolean().optional()
}).superRefine((ticket, context) => {
    if (ticket.id === null) {
        for (const key of ['name', 'price', 'capacity'] as const) {
            if (ticket[key] === undefined) context.addIssue({ code: 'custom', path: [key], message: 'Requerido para nuevas entradas' });
        }
        if (ticket.capacity === 0) context.addIssue({ code: 'custom', path: ['capacity'], message: 'La capacidad debe ser mayor a 0' });
    }
});

export const createEventSchema = z.object({
    body: z.object({ ...eventFields, minAge: eventFields.minAge.default(0), ticketTypes: z.array(newTicket).max(1000).optional() }),
    query: z.object({ search: z.string().max(200).optional() })
});
export const updateEventSchema = z.object({
    body: z.object(eventFields).partial().extend({ active: z.boolean().optional(), ticketTypes: z.array(ticketPatch).max(1000).optional() }),
    params: z.object({ id: z.string().regex(/^\d+$/, 'ID de evento inválido').refine(value => Number.isSafeInteger(Number(value)) && Number(value) > 0, 'ID de evento inválido') })
});
