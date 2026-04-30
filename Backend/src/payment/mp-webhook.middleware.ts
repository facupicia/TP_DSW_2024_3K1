import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { getMPConfig } from './mp.config';
import { logger } from '../common/services/logger';

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
            if (process.env.NODE_ENV === 'production') {
                logger.error('MP_WEBHOOK_SECRET_MISSING_PRODUCTION', { type, path: req.path });
                res.status(503).json({ error: 'Webhook signature validation is not configured' });
                return;
            }

            // Development/sandbox mode only.
            next();
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
            
            // MercadoPago signs this manifest: id:<data.id>;request-id:<x-request-id>;ts:<ts>;
            const rawDataId = req.query['data.id'] || req.query.id || req.body?.data?.id || req.body?.id || '';
            const dataId = String(rawDataId).toLowerCase();
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
