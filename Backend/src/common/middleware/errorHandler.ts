import { Request, Response, NextFunction } from "express";


export const errorHandler = (err: any, req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || 500;
    const code = err.code || 'INTERNAL_ERROR';
    const message = err.message || 'Internal server error';

    console.error('GLOBAL_ERROR', {
        method: req.method,
        url: req.originalUrl,
        status,
        code,
        message,
    });

    res.status(status).json({ code, message });
};

