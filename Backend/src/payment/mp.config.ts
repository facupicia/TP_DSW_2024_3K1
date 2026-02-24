import crypto from 'crypto';
import { logger } from '../common/services/logger';
import { isSandboxMode, logSandboxStatus } from './mp.sandbox';

/**
 * MercadoPago Configuration
 * 
 * Centraliza la configuración y validación de variables de entorno
 * relacionadas con MercadoPago.
 */

// Validar variables requeridas al inicio
const requiredEnvVars = [
    'MP_ACCESS_TOKEN',
    'MP_CLIENT_ID',
    'MP_CLIENT_SECRET'
] as const;

const optionalEnvVars = [
    'MP_ACCESS_TOKEN_SUSCRIPCION',
    'MP_WEBHOOK_SECRET',              // Para webhooks de pagos (marketplace)
    'MP_SUBSCRIPTION_WEBHOOK_SECRET', // Para webhooks de suscripciones (opcional)
    'MP_NOTIFICATION_URL',
    'MP_SUBSCRIPTION_BACK_URL'
] as const;

export interface MPConfig {
    accessToken: string;
    clientId: string;
    clientSecret: string;
    subscriptionAccessToken?: string;
    webhookSecret?: string;              // Secret para webhooks de pagos
    subscriptionWebhookSecret?: string;  // Secret para webhooks de suscripciones
    notificationUrl: string;
    subscriptionBackUrl: string;
    clientUrl: string;
    appUrl: string;
}

let cachedConfig: MPConfig | null = null;
let hasLoggedStatus = false;

/**
 * Valida y retorna la configuración de MercadoPago
 * Lanza error si faltan variables requeridas
 */
export function getMPConfig(): MPConfig {
    if (cachedConfig) return cachedConfig;

    // Validar variables requeridas
    const missing: string[] = [];
    for (const envVar of requiredEnvVars) {
        if (!process.env[envVar]) {
            missing.push(envVar);
        }
    }

    if (missing.length > 0) {
        throw new Error(
            `Missing required MercadoPago environment variables: ${missing.join(', ')}`
        );
    }

    // Loguear estado solo una vez
    if (!hasLoggedStatus) {
        logSandboxStatus();
        hasLoggedStatus = true;
    }

    cachedConfig = {
        accessToken: process.env.MP_ACCESS_TOKEN!,
        clientId: process.env.MP_CLIENT_ID!,
        clientSecret: process.env.MP_CLIENT_SECRET!,
        subscriptionAccessToken: process.env.MP_ACCESS_TOKEN_SUSCRIPCION,
        webhookSecret: process.env.MP_WEBHOOK_SECRET,
        subscriptionWebhookSecret: process.env.MP_SUBSCRIPTION_WEBHOOK_SECRET || process.env.MP_WEBHOOK_SECRET,
        notificationUrl: process.env.MP_NOTIFICATION_URL || '',
        subscriptionBackUrl: process.env.MP_SUBSCRIPTION_BACK_URL || process.env.BACKEND_URL || 'http://localhost:3000',
        clientUrl: (process.env.CLIENT_URLS || process.env.CLIENT_URL || 'http://localhost:4200').split(',')[0].trim(),
        appUrl: process.env.APP_URL || 'http://localhost:3000'
    };

    return cachedConfig;
}

/**
 * Limpia la URL removiendo trailing slashes
 */
export function sanitizeUrl(url: string): string {
    return String(url || '').trim().replace(/\/+$/, '');
}

/**
 * Genera un state firmado para OAuth
 * Incluye timestamp para expiración y firma HMAC
 */
export function generateOAuthState(userId: number): string {
    const config = getMPConfig();
    const timestamp = Date.now();
    const data = JSON.stringify({ userId, ts: timestamp });
    
    // Crear firma HMAC
    const signature = crypto
        .createHmac('sha256', config.clientSecret)
        .update(data)
        .digest('hex');
    
    const payload = { d: data, s: signature };
    return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

/**
 * Verifica y decodifica el state de OAuth
 * Retorna null si es inválido o expiró
 */
export function verifyOAuthState(state: string): { userId: number } | null {
    try {
        const config = getMPConfig();
        const payload = JSON.parse(Buffer.from(state, 'base64url').toString());
        
        if (!payload.d || !payload.s) return null;
        
        // Verificar firma
        const expectedSignature = crypto
            .createHmac('sha256', config.clientSecret)
            .update(payload.d)
            .digest('hex');
        
        if (!crypto.timingSafeEqual(
            Buffer.from(payload.s),
            Buffer.from(expectedSignature)
        )) {
            logger.warn('MP_OAUTH_INVALID_SIGNATURE');
            return null;
        }
        
        const data = JSON.parse(payload.d);
        
        // Verificar expiración (15 minutos)
        const maxAge = 15 * 60 * 1000;
        if (Date.now() - data.ts > maxAge) {
            logger.warn('MP_OAUTH_STATE_EXPIRED');
            return null;
        }
        
        return { userId: data.userId };
    } catch (error) {
        logger.error('MP_OAUTH_STATE_DECODE_ERROR', { error: (error as Error).message });
        return null;
    }
}

/**
 * IPs oficiales de MercadoPago para webhooks
 * Fuente: https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks
 */
export const MERCADOPAGO_WEBHOOK_IPS = [
    '18.229.206.29',
    '18.231.79.223',
    '35.167.59.33',
    '50.16.248.122',
    '52.11.176.35',
    '52.67.2.252',
    '52.67.44.67'
];

/**
 * Valida si una IP pertenece a MercadoPago
 * En sandbox/desarrollo siempre retorna true
 */
export function isValidMPWebhookIP(ip: string): boolean {
    // En sandbox/desarrollo, permitir cualquier IP
    if (isSandboxMode()) {
        return true;
    }
    
    return MERCADOPAGO_WEBHOOK_IPS.includes(ip);
}

/**
 * URLs de la API de MercadoPago
 */
export const MP_ENDPOINTS = {
    auth: 'https://auth.mercadopago.com/authorization',
    token: 'https://api.mercadopago.com/oauth/token',
    api: 'https://api.mercadopago.com'
} as const;
