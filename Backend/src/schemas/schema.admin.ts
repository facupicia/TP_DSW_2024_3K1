import { z } from 'zod';

const dateInput = z.union([z.iso.date(), z.iso.datetime({ offset: true })]);
const boundedInteger = (max: number) => z.union([z.number(), z.string().regex(/^\d+$/).transform(Number)])
    .pipe(z.number().int().min(1).max(max));

export const adminMetricsSchema = z.object({
    query: z.object({
        startDate: dateInput.optional(),
        endDate: dateInput.optional(),
        limit: boundedInteger(100).default(10),
        period: z.enum(['day', 'week', 'month']).default('day'),
        last: boundedInteger(366).default(30)
    }).superRefine((query, context) => {
        if (!!query.startDate !== !!query.endDate) context.addIssue({ code: 'custom', path: ['startDate'], message: 'Se requieren ambas fechas' });
        if (query.startDate && query.endDate && new Date(query.startDate) > new Date(query.endDate)) {
            context.addIssue({ code: 'custom', path: ['endDate'], message: 'El fin debe ser posterior al inicio' });
        }
    })
});
