import { Request, Response, NextFunction } from 'express';
import { env } from '../../config/env';

// Cookie-mutating endpoints must not rely on CORS response visibility for CSRF protection.
export function trustedOrigin(req: Request, res: Response, next: NextFunction) {
    const origins = (env.CLIENT_URLS || env.CLIENT_URL || '').split(',').map(value => value.trim().replace(/\/+$/, '').toLowerCase()).filter(Boolean);
    const origin = req.header('Origin');
    if (!origin || !origins.includes(origin.toLowerCase().replace(/\/+$/, ''))) {
        return res.status(403).json({ code: 'UNTRUSTED_ORIGIN', message: 'Origen de solicitud no autorizado' });
    }
    next();
}
