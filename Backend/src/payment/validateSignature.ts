import { Request, Response, NextFunction } from "express";
import { createHmac } from "crypto";
/**
 * Middleware de validación de firma para el webhook de Mercado Pago.
 * Requiere que el cuerpo llegue como Buffer (express.raw) para calcular HMAC.
 */
export function validateSignature(req: Request, res: Response, next: NextFunction) {
    const signature = req.header("x-signature") || "";
    const secret = process.env.MP_WEBHOOK_SECRET || "";
    const bodyAny: any = req.body as any;
    let text: string | null = null;
    if (bodyAny instanceof Buffer) {
        text = bodyAny.toString("utf8");
    } else if (typeof bodyAny === "string") {
        text = bodyAny;
    } else if (bodyAny && typeof bodyAny === "object") {
        try { text = JSON.stringify(bodyAny); } catch { text = null; }
    }
    if (!text) {
        return res.status(400).json({ code: "WEBHOOK_PAYLOAD_INVALID", message: "Cuerpo de webhook inválido" });
    }
    try {
        (req as any).parsedBody = JSON.parse(text);
    } catch {
        return res.status(400).json({ code: "WEBHOOK_JSON_INVALID", message: "JSON inválido en webhook" });
    }
    if (!secret) {
        // Fallback: si no hay secreto configurado, permitir webhook sin validación para ambientes de prueba
        return next();
    }
    const computed = createHmac("sha256", secret).update(text).digest("hex");
    const receivedRaw = signature.includes("=") ? signature.split("=")[1] : signature;
    const received = receivedRaw.split(/[;,]/)[0].trim();
    if (received !== computed) {
        return res.status(401).json({ code: "INVALID_SIGNATURE", message: "Firma inválida" });
    }
    next();
}
