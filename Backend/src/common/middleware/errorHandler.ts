import { Request, Response, NextFunction } from "express";
import { env } from "../../config/env";
import { logger } from "../services/logger";

export const errorHandler = (err: any, req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || 500;
    const code = err.code || 'INTERNAL_ERROR';
    const isDev = env.NODE_ENV === 'development';

    // Never expose internal error details in production
    const SAFE_CLIENT_CODES = [
        'VALIDATION_ERROR', 'PAST_DATE', 'PLAN_LIMIT_EVENTS', 'PLAN_LIMIT_TICKET_TYPES',
        'CAPACITY_BELOW_SOLD', 'NO_STOCK', 'EVENT_STARTED', 'TICKET_TYPE_INACTIVE',
        'AGE_RESTRICTED', 'AUTH_NO_TOKEN', 'AUTH_INVALID_TOKEN', 'AUTH_USER_INACTIVE',
        'RATE_LIMITED', 'AUTH_RATE_LIMITED', 'FORBIDDEN', 'UNAUTHORIZED',
        'COUPON_INVALID', 'COUPON_EXPIRED', 'COUPON_EXHAUSTED', 'EXTRA_INACTIVE',
        'ZERO_AMOUNT_NOT_SUPPORTED', 'MULTIPLE_EVENTS', 'GUEST_BUYER_REQUIRED',
        'GUEST_EMAIL_INVALID', 'SEARCH_TOO_LONG', 'INVALID_EVENT_ID', 'INVALID_USER_ID',
        'EMAIL_ALREADY_EXISTS', 'USER_NOT_FOUND', 'INVALID_PASSWORD', 'INVALID_CREDENTIALS',
        'CLAIM_TOKEN_INVALID', 'MISSING_CREDENTIAL', 'INVALID_TOKEN', 'INVALID_ISSUER',
        'EMAIL_NOT_VERIFIED', 'INVALID_ROLE', 'QUERY_REQUIRED', 'NO_CHANGES'
    ];

    let message = err.message || 'Internal server error';
    if (!isDev) {
        if (status >= 500) {
            message = 'Internal server error';
        } else if (!SAFE_CLIENT_CODES.includes(code)) {
            message = 'Request error';
        }
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
