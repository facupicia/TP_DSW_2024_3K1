import { Request, Response, NextFunction } from "express";
import { env } from "../../config/env";
import { logger } from "../services/logger";

export const errorHandler = (err: any, req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || 500;
    const code = err.code || 'INTERNAL_ERROR';
    const isDev = env.NODE_ENV === 'development';

    // Never expose internal error details in production for 5xx errors
    let message = err.message || 'Internal server error';
    if (status >= 500 && !isDev) {
        message = 'Internal server error';
    }

    logger.error('GLOBAL_ERROR', {
        method: req.method,
        url: req.originalUrl,
        status,
        code,
        message: isDev ? message : '[REDACTED_IN_PROD]',
        stack: isDev ? err.stack : undefined,
    });

    res.status(status).json({ code, message });
};
