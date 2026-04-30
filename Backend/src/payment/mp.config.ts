import crypto from 'crypto';
import { logger } from '../common/services/logger';

/**
 * MercadoPago Configuration
 * 
 * Centraliza la configuración de MercadoPago.
 */

const requiredEnvVars = [
    'MP_ACCESS_TOKEN',
    'MP_CLIENT_ID',
    'MP_CLIENT_SECRET'
] as const;

export interface MPConfig {
    accessToken: string;
    clientId: string;
    clientSecret: string;
    webhookSecret?: string;
    subscriptionWebhookSecret?: string;
    subscriptionAccessToken?: string;
    notificationUrl: string;
    subscriptionBackUrl: string;
    clientUrl: string;
    appUrl: string;
}

let cachedConfig: MPConfig | null = null;

/**
 * Valida y retorna la configuración de MercadoPago
 */
export function getMPConfig(): MPConfig {
    if (cachedConfig) return cachedConfig;

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

    cachedConfig = {
        accessToken: process.env.MP_ACCESS_TOKEN!,
        clientId: process.env.MP_CLIENT_ID!,
        clientSecret: process.env.MP_CLIENT_SECRET!,
        webhookSecret: process.env.MP_WEBHOOK_SECRET,
        subscriptionWebhookSecret: process.env.MP_SUBSCRIPTION_WEBHOOK_SECRET,
        subscriptionAccessToken: process.env.MP_ACCESS_TOKEN_SUSCRIPCION,
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
 * Incluye redirectTo para devolver al usuario a la página original
 */
export function generateOAuthState(userId: number, redirectTo?: string): string {
    const config = getMPConfig();
    const timestamp = Date.now();
    const data = JSON.stringify({ userId, ts: timestamp, redirectTo });

    const signature = crypto
        .createHmac('sha256', config.clientSecret)
        .update(data)
        .digest('hex');

    const payload = { d: data, s: signature };
    return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

/**
 * Verifica y decodifica el state de OAuth
 * Retorna también redirectTo si existe
 */
export function verifyOAuthState(state: string): { userId: number; redirectTo?: string } | null {
    try {
        const config = getMPConfig();
        const payload = JSON.parse(Buffer.from(state, 'base64url').toString());

        if (!payload.d || !payload.s) return null;

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
        if (Date.now() - data.ts > 15 * 60 * 1000) {
            logger.warn('MP_OAUTH_STATE_EXPIRED');
            return null;
        }

        return { userId: data.userId, redirectTo: data.redirectTo };
    } catch (error) {
        logger.error('MP_OAUTH_STATE_DECODE_ERROR', { error: (error as Error).message });
        return null;
    }
}

/**
 * URLs de la API de MercadoPago
 */
export const MP_ENDPOINTS = {
    auth: 'https://auth.mercadopago.com/authorization',
    token: 'https://api.mercadopago.com/oauth/token',
    api: 'https://api.mercadopago.com'
} as const;
