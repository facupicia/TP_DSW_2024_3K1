import { Request, Response, NextFunction } from "express";
import { createHmac } from "crypto";
export function validateSignature(req: Request, res: Response, next: NextFunction) {
  const signature = req.header("x-signature") || "";
  const secret = process.env.MP_WEBHOOK_SECRET || "";
  const payload = req.body as Buffer;
  if (payload && payload instanceof Buffer && payload.length > 0) {
    if (secret && signature) {
      const computed = createHmac("sha256", secret).update(payload).digest("hex");
      const received = signature.includes("=") ? signature.split("=")[1] : signature;
      if (received !== computed) {
        return res.status(401).json({ code: "INVALID_SIGNATURE", message: "Firma inválida" });
      }
    }
    try {
      const text = payload.toString("utf8");
      (req as any).parsedBody = JSON.parse(text);
    } catch {
      // Si el cuerpo no es JSON, continuamos; el controlador usará req.query
    }
  }
  next();
}
