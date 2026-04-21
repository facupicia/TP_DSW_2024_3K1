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
        const webhookSecret = type === 'payment' 
            ? config.webhookSecret 
            : undefined;
        
        logger.info('MP_WEBHOOK_RECEIVED', {
            type,
            path: req.path,
            method: req.method,
            ip: getClientIP(req),
            hasSignature: !!signature,
            hasSecret: !!webhookSecret
        });
        
        // Si no hay secret configurado, continuar (modo desarrollo)
        if (!webhookSecret || !signature) {
            next();
            return;
        }
        
        try {
            // Formato: "ts=<timestamp>,v1=<signature>"
            const parts = signature.split(',');
            const tsPart = parts.find(p => p.startsWith('ts='));
            const v1Part = parts.find(p => p.startsWith('v1='));
            
            if (!tsPart || !v1Part) {
                logger.warn('MP_WEBHOOK_INVALID_SIGNATURE_FORMAT', { signature });
                next();
                return;
            }
            
            const timestamp = tsPart.split('=')[1];
            const receivedHash = v1Part.split('=')[1];
            
            // Template: "id:<data.id>|topic:<topic>|ts:<timestamp>"
            const dataId = req.query['data.id'] || req.body?.data?.id || '';
            const topic = req.query.topic || req.query.type || req.body?.type || '';
            const template = `id:${dataId}|topic:${topic}|ts:${timestamp}`;
            
            const expectedHash = crypto
                .createHmac('sha256', webhookSecret)
                .update(template)
                .digest('hex');
            
            if (!crypto.timingSafeEqual(
                Buffer.from(receivedHash),
                Buffer.from(expectedHash)
            )) {
                logger.error('MP_WEBHOOK_INVALID_SIGNATURE', {
                    received: receivedHash,
                    expected: expectedHash
                });
                res.status(401).json({ error: 'Invalid signature' });
                return;
            }
            
            logger.info('MP_WEBHOOK_SIGNATURE_VALID', { type });
            next();
            
        } catch (error) {
            logger.error('MP_WEBHOOK_SIGNATURE_ERROR', { error: (error as Error).message });
            next();
        }
    };
}

/**
 * Middleware combinado para webhooks de pagos
 */
export const mpPaymentWebhookMiddleware = [
    createValidateMPWebhookSignature('payment')
];
