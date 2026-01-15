import { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";

export function requestId(req: Request, res: Response, next: NextFunction) {
    const id = req.header("x-request-id") || randomUUID();
    (req as any).rid = id;
    res.setHeader("x-request-id", id);
    next();
}

