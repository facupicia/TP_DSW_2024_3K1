import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { getMPConfig } from './mp.config';
import { logger } from '../common/services/logger';
import { env } from '../config/env';

declare global {
    namespace Express {
        interface Request {
            paymentId?: string;
        }
    }
}

/**
 * MercadoPago Webhook Middleware
 * 
 * Valida la firma de los webhooks de MercadoPago.
 */

/**
 * Extrae la IP real del request
 */
function getClientIP(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
        return forwarded.split(',')[0].trim();
    }
    return req.socket.remoteAddress || 'unknown';
}

function firstValue(value: unknown): string | undefined {
    if (Array.isArray(value)) {
        return firstValue(value[0]);
    }

    if (typeof value === 'string' && value.trim()) {
        return value;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
    }

    return undefined;
}

export function extractPaymentId(req: Request): string | undefined {
    return firstValue(req.body?.data?.id)
        || firstValue(req.body?.id)
        || firstValue(req.query['data.id'])
        || firstValue(req.query.id);
}

/**
 * Middleware factory: Valida la firma del webhook
 */
export function createValidateMPWebhookSignature(type: 'payment' | 'subscription') {
    return function validateMPWebhookSignature(req: Request, res: Response, next: NextFunction): void {
        const config = getMPConfig();
        const signature = req.headers['x-signature'] as string | undefined;
        const webhookSecret = type === 'subscription'
            ? (config.subscriptionWebhookSecret || config.webhookSecret)
            : config.webhookSecret;
        
        logger.info('MP_WEBHOOK_RECEIVED', {
            type,
            path: req.path,
            method: req.method,
            ip: getClientIP(req),
            hasSignature: !!signature,
            hasSecret: !!webhookSecret
        });
        
        if (!webhookSecret) {
            logger.error('MP_WEBHOOK_SECRET_MISSING', { type, path: req.path, env: env.NODE_ENV });
            res.status(503).json({ error: 'Webhook signature validation is not configured' });
            return;
        }

        if (!signature) {
            logger.error('MP_WEBHOOK_MISSING_SIGNATURE', { type, path: req.path });
            res.status(401).json({ error: 'Missing signature' });
            return;
        }
        
        try {
            // Formato: "ts=<timestamp>,v1=<signature>"
            const parts = signature.split(',');
            const tsPart = parts.find(p => p.startsWith('ts='));
            const v1Part = parts.find(p => p.startsWith('v1='));
            
            if (!tsPart || !v1Part) {
                logger.warn('MP_WEBHOOK_INVALID_SIGNATURE_FORMAT', { type, path: req.path });
                res.status(401).json({ error: 'Invalid signature format' });
                return;
            }
            
            const timestamp = tsPart.split('=')[1];
            const receivedHash = v1Part.split('=')[1];

            // Replay attack protection: reject webhooks older than 5 minutes
            const tsNum = Number(timestamp);
            const nowSeconds = Math.floor(Date.now() / 1000);
            if (!Number.isFinite(tsNum) || Math.abs(nowSeconds - tsNum) > 300) {
                logger.warn('MP_WEBHOOK_TIMESTAMP_REJECTED', { type, timestamp, diff: Math.abs(nowSeconds - tsNum) });
                res.status(401).json({ error: 'Webhook timestamp expired' });
                return;
            }
            
            // MercadoPago signs this manifest: id:<data.id>;request-id:<x-request-id>;ts:<ts>;
            req.paymentId = extractPaymentId(req);
            const dataId = req.paymentId || '';
            const requestId = String(req.headers['x-request-id'] || '');
            let template = '';
            if (dataId) template += `id:${dataId};`;
            if (requestId) template += `request-id:${requestId};`;
            template += `ts:${timestamp};`;
            
            const expectedHash = crypto
                .createHmac('sha256', webhookSecret)
                .update(template)
                .digest('hex');
            
            if (receivedHash.length !== expectedHash.length) {
                logger.error('MP_WEBHOOK_INVALID_SIGNATURE_LENGTH', {
                    type,
                    receivedLength: receivedHash.length,
                    expectedLength: expectedHash.length
                });
                res.status(401).json({ error: 'Invalid signature' });
                return;
            }

            if (!crypto.timingSafeEqual(
                Buffer.from(receivedHash),
                Buffer.from(expectedHash)
            )) {
                logger.error('MP_WEBHOOK_INVALID_SIGNATURE', {
                    type,
                    path: req.path
                });
                res.status(401).json({ error: 'Invalid signature' });
                return;
            }
            
            logger.info('MP_WEBHOOK_SIGNATURE_VALID', { type });
            next();
            
        } catch (error) {
            logger.error('MP_WEBHOOK_SIGNATURE_ERROR', { error: (error as Error).message });
            res.status(401).json({ error: 'Invalid signature' });
        }
    };
}

/**
 * Middleware combinado para webhooks de pagos
 */
export const mpPaymentWebhookMiddleware = [
    createValidateMPWebhookSignature('payment')
];
