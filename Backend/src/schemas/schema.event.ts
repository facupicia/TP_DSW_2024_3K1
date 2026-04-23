import { z } from "zod";

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;

export const createEventSchema = z.object({
    body: z.object({
        title: z.string().min(1, "El nombre es obligatorio"),
        pais: z.string().min(1, "El país es obligatorio"),
        provincia: z.string().min(1, "La provincia es obligatoria"),
        ciudad: z.string().min(1, "La ciudad es obligatoria"),
        direccion: z.string().min(1, "La dirección es obligatoria"),
        organizer: z.string().min(1, "El organizador es obligatorio"),
        image: z.string().optional(),
        date: z.string().refine(date => {
            const eventDate = new Date(date);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            return !isNaN(eventDate.getTime()) && eventDate >= today;
        }, "La fecha debe ser hoy o una fecha futura"),
        time: z.string().regex(timeRegex, "Formato de hora inválido"),
        description: z.string().min(1, "La descripción es obligatoria"),
        categoryId: z.number().int().positive("La categoría es obligatoria"),
        destacado: z.boolean().optional(),
        minAge: z.number().int().min(0).max(99).optional().default(0),
        isPublic: z.boolean().optional(),
        ticketTypes: z.array(z.object({
            name: z.string().min(1, "El nombre del tipo de entrada es obligatorio"),
            price: z.number().nonnegative("El precio no puede ser negativo"),
            capacity: z.number().int().positive("La capacidad debe ser mayor a 0"),
            description: z.string().optional(),
            active: z.boolean().optional()
        })).optional()
    }),
    query: z.object({
        search: z.string().optional()
    })
});

export const updateEventSchema = z.object({
    body: z.object({
        title: z.string().optional(),
        pais: z.string().optional(),
        provincia: z.string().optional(),
        ciudad: z.string().optional(),
        direccion: z.string().optional(),
        organizer: z.string().optional(),
        image: z.string().optional(),
        date: z.string().refine(date => !isNaN(Date.parse(date)), "Fecha inválida").optional(),
        time: z.string().regex(timeRegex, "Formato de hora inválido").optional(),
        description: z.string().optional(),
        categoryId: z.union([z.number(), z.string().transform(val => parseInt(val, 10))]).optional(),
        destacado: z.boolean().optional(),
        active: z.boolean().optional(),
        isPublic: z.boolean().optional(),
        minAge: z.union([z.number(), z.string().transform(val => parseInt(val, 10))]).optional(),
        ticketTypes: z.array(z.object({
            id: z.union([z.number(), z.string(), z.null()]).optional().transform(val =>
                val === null || val === undefined || val === '' ? null : Number(val)
            ),
            name: z.string().optional(),
            price: z.union([z.number(), z.string().transform(val => parseFloat(val))]).optional(),
            capacity: z.union([z.number(), z.string().transform(val => parseInt(val, 10))]).optional(),
            description: z.string().nullable().optional(),
            active: z.boolean().optional()
        })).optional()
    }),
    params: z.object({
        id: z.string().regex(/^\d+$/, "ID de evento inválido")
    })
});

