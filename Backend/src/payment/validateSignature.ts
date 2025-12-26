import { Request, Response, NextFunction } from "express";
import { createHmac } from "crypto";
/**
 * Middleware de validación de firma para el webhook de Mercado Pago.
 * Requiere que el cuerpo llegue como Buffer (express.raw) para calcular HMAC.
 */
export function validateSignature(req: Request, res: Response, next: NextFunction) {
    const signature = req.header("x-signature") || "";
    const secret = process.env.MP_WEBHOOK_SECRET || "";
    if (!secret) {
        return res.status(500).json({ code: "WEBHOOK_SECRET_MISSING", message: "Secreto de webhook no configurado" });
    }
    const payload = req.body as Buffer;
    if (!payload || !(payload instanceof Buffer)) {
        return res.status(400).json({ code: "WEBHOOK_PAYLOAD_INVALID", message: "Cuerpo de webhook inválido" });
    }
    const computed = createHmac("sha256", secret).update(payload).digest("hex");
    const received = signature.includes("=") ? signature.split("=")[1] : signature;
    if (received !== computed) {
        return res.status(401).json({ code: "INVALID_SIGNATURE", message: "Firma inválida" });
    }
    try {
        const text = payload.toString("utf8");
        (req as any).parsedBody = JSON.parse(text);
    } catch {
        return res.status(400).json({ code: "WEBHOOK_JSON_INVALID", message: "JSON inválido en webhook" });
    }
    next();
}

