import { z } from "zod";

const idParam = z.string().regex(/^\d+$/, "ID inválido");

export const assignScannerSchema = z.object({
    body: z.object({
        email: z.string().email("Email inválido").optional(),
        userId: z.number().int().positive().optional()
    }).refine(data => data.email || data.userId, {
        message: "Debes enviar email o userId"
    })
});

export const removeScannerSchema = z.object({
    params: z.object({
        assignmentId: idParam
    })
});
