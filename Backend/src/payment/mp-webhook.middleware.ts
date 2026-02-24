import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { getMPConfig, isValidMPWebhookIP, MERCADOPAGO_WEBHOOK_IPS } from './mp.config';
import { logger } from '../common/services/logger';
import { isSandboxMode, getSandboxConfig } from './mp.sandbox';

/**
 * MercadoPago Webhook Middleware
 * 
 * Proporciona validación de seguridad para webhooks de MercadoPago:
 * - Validación de IP origen
 * - Validación de firma (secret)
 * - Rate limiting básico
 */

// Simple in-memory rate limiter para webhooks
const webhookAttempts = new Map<string, { count: number; resetTime: number }>();

const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minuto
const RATE_LIMIT_MAX = 30; // max 30 requests por minuto por IP

/**
 * Limpia entradas expiradas del rate limiter
 */
function cleanExpiredEntries(): void {
    const now = Date.now();
    for (const [ip, data] of webhookAttempts.entries()) {
        if (now > data.resetTime) {
            webhookAttempts.delete(ip);
        }
    }
}

/**
 * Verifica rate limit para una IP
 */
function checkRateLimit(ip: string): boolean {
    cleanExpiredEntries();
    
    const now = Date.now();
    const data = webhookAttempts.get(ip);
    
    if (!data || now > data.resetTime) {
        // Nueva ventana
        webhookAttempts.set(ip, {
            count: 1,
            resetTime: now + RATE_LIMIT_WINDOW
        });
        return true;
    }
    
    if (data.count >= RATE_LIMIT_MAX) {
        return false;
    }
    
    data.count++;
    return true;
}

/**
 * Extrae la IP real del request (considerando proxies)
 */
function getClientIP(req: Request): string {
    // Priorizar headers de proxy si están configurados
    const forwarded = req.headers['x-forwarded-for'];
    const realIP = req.headers['x-real-ip'];
    
    if (typeof forwarded === 'string') {
        return forwarded.split(',')[0].trim();
    }
    
    if (typeof realIP === 'string') {
        return realIP;
    }
    
    return req.socket.remoteAddress || 'unknown';
}

/**
 * Middleware: Valida que el request venga de una IP de MercadoPago
 * En modo sandbox o desarrollo, permite cualquier IP
 */
export function validateMPWebhookIP(req: Request, res: Response, next: NextFunction): void {
    const clientIP = getClientIP(req);
    const sandbox = getSandboxConfig();
    
    if (!checkRateLimit(clientIP)) {
        logger.warn('MP_WEBHOOK_RATE_LIMITED', { ip: clientIP });
        res.status(429).json({ error: 'Too many requests' });
        return;
    }
    
    if (!isValidMPWebhookIP(clientIP)) {
        logger.warn('MP_WEBHOOK_INVALID_IP', { 
            ip: clientIP,
            path: req.path,
            userAgent: req.headers['user-agent']
        });
        res.status(403).json({ error: 'Invalid source IP' });
        return;
    }
    
    // En sandbox, loguear pero permitir cualquier IP
    if (sandbox.skipIpValidation && !MERCADOPAGO_WEBHOOK_IPS.includes(clientIP)) {
        logger.info('MP_WEBHOOK_IP_SKIPPED_SANDBOX', { ip: clientIP, path: req.path });
    }
    
    next();
}

/**
 * Middleware factory: Crea un middleware que valida la firma del webhook
 * 
 * @param type - 'payment' para webhooks de pagos, 'subscription' para suscripciones
 * 
 * Nota: MercadoPago no siempre envía firma en todos los tipos de webhooks.
 * En modo sandbox, la validación se puede saltear para facilitar testing.
 */
export function createValidateMPWebhookSignature(type: 'payment' | 'subscription') {
    return function validateMPWebhookSignature(req: Request, res: Response, next: NextFunction): void {
        const config = getMPConfig();
        const signature = req.headers['x-signature'] as string | undefined;
        const requestId = req.headers['x-request-id'] as string | undefined;
        const sandbox = getSandboxConfig();
        
        // Seleccionar el secret apropiado
        const webhookSecret = type === 'subscription' 
            ? config.subscriptionWebhookSecret 
            : config.webhookSecret;
        
        // Log del webhook recibido para debugging
        logger.info('MP_WEBHOOK_RECEIVED', {
            type,
            path: req.path,
            method: req.method,
            contentType: req.headers['content-type'],
            requestId,
            hasSignature: !!signature,
            hasSecret: !!webhookSecret,
            sandbox: isSandboxMode(),
            query: req.query
        });
        
        // En sandbox sin secret configurado, saltear validación
        if (sandbox.skipSignatureValidation && !webhookSecret) {
            logger.info('MP_WEBHOOK_SIGNATURE_SKIPPED_SANDBOX', { type });
            next();
            return;
        }
        
        // Si no hay secret configurado o no hay firma, continuar
        if (!webhookSecret || !signature) {
            next();
            return;
        }
        
        try {
            // El formato del header es: "ts=<timestamp>,v1=<signature>"
            const parts = signature.split(',');
            const tsPart = parts.find(p => p.startsWith('ts='));
            const v1Part = parts.find(p => p.startsWith('v1='));
            
            if (!tsPart || !v1Part) {
                logger.warn('MP_WEBHOOK_INVALID_SIGNATURE_FORMAT', { type, signature });
                // No rechazar, solo loguear
                next();
                return;
            }
            
            const timestamp = tsPart.split('=')[1];
            const receivedHash = v1Part.split('=')[1];
            
            // Verificar que el timestamp no sea muy viejo (5 minutos de tolerancia)
            const now = Math.floor(Date.now() / 1000);
            const ts = parseInt(timestamp, 10);
            
            if (Math.abs(now - ts) > 300) {
                logger.warn('MP_WEBHOOK_TIMESTAMP_TOO_OLD', { type, timestamp, now, diff: now - ts });
                // No rechazar, solo loguear (puede haber diferencia de reloj)
            }
            
            // Construir el template para la firma
            // Format: "id:<data.id>|topic:<topic>|ts:<timestamp>"
            const dataId = req.query['data.id'] || req.body?.data?.id || '';
            const topic = req.query.topic || req.query.type || req.body?.type || '';
            const template = `id:${dataId}|topic:${topic}|ts:${timestamp}`;
            
            // Calcular firma esperada
            const expectedHash = crypto
                .createHmac('sha256', webhookSecret)
                .update(template)
                .digest('hex');
            
            // Comparación segura contra timing attacks
            if (!crypto.timingSafeEqual(
                Buffer.from(receivedHash),
                Buffer.from(expectedHash)
            )) {
                    logger.error('MP_WEBHOOK_INVALID_SIGNATURE', {
                    type,
                    received: receivedHash,
                    expected: expectedHash,
                    template
                });
                res.status(401).json({ error: 'Invalid signature' });
                return;
            }
            
            logger.info('MP_WEBHOOK_SIGNATURE_VALID', { type });
            next();
            
        } catch (error) {
            logger.error('MP_WEBHOOK_SIGNATURE_ERROR', { type, error: (error as Error).message });
            // No rechazar por errores de parsing, solo loguear
            next();
        }
    };
}

/**
 * Middleware: Parsea el body raw para verificación de firma
 * Debe usarse antes de express.json() para preservar el body raw
 */
export function captureRawBody(req: Request, res: Response, next: NextFunction): void {
    let data = '';
    
    req.setEncoding('utf8');
    
    req.on('data', (chunk: string) => {
        data += chunk;
    });
    
    req.on('end', () => {
        // Guardar el body raw para verificación de firma
        (req as any).rawBody = data;
        
        // Parsear JSON manualmente si es necesario
        if (req.headers['content-type']?.includes('application/json') && data) {
            try {
                req.body = JSON.parse(data);
            } catch (e) {
                // Si falla el parseo, continuar con body vacío
                req.body = {};
            }
        }
        
        next();
    });
    
    req.on('error', (error) => {
        logger.error('MP_WEBHOOK_BODY_PARSE_ERROR', { error: error.message });
        next(error);
    });
}

/**
 * Middleware combinado para webhooks de pagos (marketplace)
 * Usa MP_WEBHOOK_SECRET
 */
export const mpPaymentWebhookMiddleware = [
    validateMPWebhookIP,
    createValidateMPWebhookSignature('payment')
];

/**
 * Middleware combinado para webhooks de suscripciones
 * Usa MP_SUBSCRIPTION_WEBHOOK_SECRET (o MP_WEBHOOK_SECRET si no está definido)
 */
export const mpSubscriptionWebhookMiddleware = [
    validateMPWebhookIP,
    createValidateMPWebhookSignature('subscription')
];
