import { z } from 'zod';
import { ProductCategory } from '../product/product.entity';

const numberInput = (schema: z.ZodNumber) => z.preprocess(value =>
    typeof value === 'string' && value.trim() !== '' ? Number(value) : value, schema);
const price = numberInput(z.number().finite().min(0).max(9999999999.99));
const count = numberInput(z.number().int().min(0).max(2147483647));
const positiveId = numberInput(z.number().int().positive().max(2147483647));
const id = z.string().regex(/^\d+$/).refine(value => Number(value) > 0 && Number(value) <= 2147483647, 'ID inválido');
const image = z.union([z.string().trim().max(2048).url().refine(value => /^https?:\/\//i.test(value), 'URL de imagen inválida'), z.literal('')]).nullable().optional();

export const productCreateBody = z.object({
    name: z.string().trim().min(1).max(255),
    description: z.string().trim().max(5000).nullable().optional(),
    category: z.enum(ProductCategory),
    basePrice: price,
    imageUrl: image
});
export const productUpdateBody = productCreateBody.partial().refine(value => Object.keys(value).length > 0, 'No hay cambios válidos');
export const extraCreateBody = z.object({
    productId: positiveId,
    eventPrice: price,
    hasStock: z.boolean().optional(),
    stock: count.optional(),
    maxPerOrder: numberInput(z.number().int().positive().max(1000)).optional()
});
export const extraUpdateBody = extraCreateBody.omit({ productId: true }).extend({ isActive: z.boolean().optional() })
    .partial().refine(value => Object.keys(value).length > 0, 'No hay cambios válidos');

export const createProductSchema = z.object({ body: productCreateBody });
export const updateProductSchema = z.object({ params: z.object({ id }), body: productUpdateBody });
export const productIdSchema = z.object({ params: z.object({ id }) });
export const eventExtrasSchema = z.object({ params: z.object({ eventId: id }) });
export const createExtraSchema = z.object({ params: z.object({ eventId: id }), body: extraCreateBody });
export const updateExtraSchema = z.object({ params: z.object({ extraId: id }), body: extraUpdateBody });
export const extraIdSchema = z.object({ params: z.object({ extraId: id }) });
