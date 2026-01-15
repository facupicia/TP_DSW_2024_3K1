import { Request, Response } from 'express';
import { CustomRequest } from '../common/middleware/authToken';
import AppDataSource from '../db';
import { User } from '../user/user.entity';
import { logger } from '../common/services/logger';

/* ==============================================================================
   MERCADO PAGO OAUTH CONTROLLER
   
   Flujo OAuth para que organizadores conecten su cuenta de Mercado Pago.
   Esto permite que los pagos de tickets vayan directamente a su cuenta.
   
   FLUJO:
   1. Frontend llama a GET /api/payment/mp/connect
   2. Usuario es redirigido a MP para autorizar
   3. MP redirige a /api/payment/mp/callback con código
   4. Backend intercambia código por tokens y los guarda
   5. Usuario es redirigido al frontend con estado de éxito/error
============================================================================== */

const MP_AUTH_URL = 'https://auth.mercadopago.com/authorization';
const MP_TOKEN_URL = 'https://api.mercadopago.com/oauth/token';

/**
 * Genera la URL de autorización de MP y devuelve al frontend.
 * El frontend debe redirigir al usuario a esta URL.
 * 
 * GET /api/payment/mp/connect
 */
export const initiateOAuth = async (req: CustomRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ message: 'No autorizado' });
        }

        const clientId = process.env.MP_CLIENT_ID;
        const backendUrl = process.env.APP_URL || 'http://localhost:3000';
        const redirectUri = `${backendUrl}/api/payment/mp/callback`;

        if (!clientId) {
            return res.status(500).json({
                code: 'MP_CONFIG_MISSING',
                message: 'Configuración de Mercado Pago incompleta (MP_CLIENT_ID)'
            });
        }

        // State contiene el userId para identificar al usuario en el callback
        // En producción, usar un token firmado para mayor seguridad
        const state = Buffer.from(JSON.stringify({ userId, ts: Date.now() })).toString('base64');

        const params = new URLSearchParams({
            client_id: clientId,
            response_type: 'code',
            platform_id: 'mp',
            redirect_uri: redirectUri,
            state: state
        });

        const authUrl = `${MP_AUTH_URL}?${params.toString()}`;

        logger.info('MP_OAUTH_INITIATED', { userId, redirectUri });

        return res.json({
            authUrl,
            message: 'Redirige al usuario a authUrl para conectar su cuenta de Mercado Pago'
        });

    } catch (error: any) {
        logger.error('MP_OAUTH_INIT_ERROR', { error: error?.message });
        return res.status(500).json({ message: 'Error al iniciar conexión con Mercado Pago' });
    }
};

/**
 * Callback de MP después de que el usuario autoriza.
 * Intercambia el código por access_token y refresh_token.
 * 
 * GET /api/payment/mp/callback?code=XXX&state=XXX
 */
export const oauthCallback = async (req: Request, res: Response) => {
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:4200';

    try {
        const { code, state, error } = req.query;

        // Si MP envía un error (usuario canceló, etc)
        if (error) {
            logger.warn('MP_OAUTH_CANCELLED', { error });
            return res.redirect(`${clientUrl}/perfil?mp_error=cancelled`);
        }

        if (!code || !state) {
            logger.error('MP_OAUTH_MISSING_PARAMS', { code: !!code, state: !!state });
            return res.redirect(`${clientUrl}/perfil?mp_error=missing_params`);
        }

        // Decodificar state para obtener userId
        let userId: number;
        try {
            const decoded = JSON.parse(Buffer.from(String(state), 'base64').toString());
            userId = decoded.userId;
        } catch (e) {
            logger.error('MP_OAUTH_INVALID_STATE', { state });
            return res.redirect(`${clientUrl}/perfil?mp_error=invalid_state`);
        }

        // Intercambiar código por tokens
        const clientId = process.env.MP_CLIENT_ID;
        const clientSecret = process.env.MP_CLIENT_SECRET;
        const backendUrl = process.env.APP_URL || 'http://localhost:3000';
        const redirectUri = `${backendUrl}/api/payment/mp/callback`;

        if (!clientId || !clientSecret) {
            logger.error('MP_OAUTH_CONFIG_MISSING');
            return res.redirect(`${clientUrl}/perfil?mp_error=config_missing`);
        }

        const tokenResponse = await fetch(MP_TOKEN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            },
            body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                code: String(code),
                grant_type: 'authorization_code',
                redirect_uri: redirectUri
            }).toString()
        });

        if (!tokenResponse.ok) {
            const errorData = await tokenResponse.text();
            logger.error('MP_OAUTH_TOKEN_ERROR', { status: tokenResponse.status, error: errorData });
            return res.redirect(`${clientUrl}/perfil?mp_error=token_exchange_failed`);
        }

        const tokens = await tokenResponse.json();

        /*
        tokens contiene:
        {
            access_token: "APP_USR-xxx",
            token_type: "bearer",
            expires_in: 15552000, // 180 días en segundos
            scope: "...",
            user_id: 123456789, // ID del usuario en MP
            refresh_token: "TG-xxx"
        }
        */

        if (!tokens.access_token || !tokens.user_id) {
            logger.error('MP_OAUTH_INVALID_TOKENS', { tokens });
            return res.redirect(`${clientUrl}/perfil?mp_error=invalid_tokens`);
        }

        // Calcular fecha de expiración
        const expiresAt = new Date();
        expiresAt.setSeconds(expiresAt.getSeconds() + (tokens.expires_in || 15552000));

        // Guardar tokens en el usuario
        const userRepo = AppDataSource.getRepository(User);
        await userRepo.update(userId, {
            mpUserId: String(tokens.user_id),
            mpAccessToken: tokens.access_token,
            mpRefreshToken: tokens.refresh_token || null,
            mpTokenExpiresAt: expiresAt
        });

        logger.info('MP_OAUTH_SUCCESS', { userId, mpUserId: tokens.user_id });

        return res.redirect(`${clientUrl}/perfil?mp_connected=true`);

    } catch (error: any) {
        logger.error('MP_OAUTH_CALLBACK_ERROR', { error: error?.message });
        return res.redirect(`${clientUrl}/perfil?mp_error=server_error`);
    }
};

/**
 * Verifica el estado de conexión de MP del usuario actual.
 * 
 * GET /api/payment/mp/status
 */
export const getMpStatus = async (req: CustomRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ message: 'No autorizado' });
        }

        const userRepo = AppDataSource.getRepository(User);
        const user = await userRepo.findOne({
            where: { id: userId },
            select: ['id', 'mpUserId', 'mpTokenExpiresAt']
        });

        if (!user) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }

        const isExpired = user.mpTokenExpiresAt ? new Date() > user.mpTokenExpiresAt : false;

        return res.json({
            connected: !!user.mpUserId && !isExpired,
            mpUserId: user.mpUserId,
            expiresAt: user.mpTokenExpiresAt,
            needsReconnect: isExpired
        });

    } catch (error: any) {
        logger.error('MP_STATUS_ERROR', { error: error?.message });
        return res.status(500).json({ message: 'Error al verificar estado de Mercado Pago' });
    }
};

/**
 * Desconecta la cuenta de MP del usuario.
 * 
 * POST /api/payment/mp/disconnect
 */
export const disconnectMp = async (req: CustomRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ message: 'No autorizado' });
        }

        const userRepo = AppDataSource.getRepository(User);
        await userRepo.update(userId, {
            mpUserId: null,
            mpAccessToken: null,
            mpRefreshToken: null,
            mpTokenExpiresAt: null
        });

        logger.info('MP_DISCONNECTED', { userId });

        return res.json({
            success: true,
            message: 'Cuenta de Mercado Pago desconectada'
        });

    } catch (error: any) {
        logger.error('MP_DISCONNECT_ERROR', { error: error?.message });
        return res.status(500).json({ message: 'Error al desconectar Mercado Pago' });
    }
};

/**
 * Helper para refrescar el access token si está por expirar.
 * Llamar antes de usar el token del organizador.
 */
export const refreshOrganizerToken = async (userId: number): Promise<string | null> => {
    const userRepo = AppDataSource.getRepository(User);

    // Obtener usuario con tokens (select: false normalmente, aquí lo forzamos)
    const user = await userRepo
        .createQueryBuilder('user')
        .select(['user.id', 'user.mpUserId', 'user.mpAccessToken', 'user.mpRefreshToken', 'user.mpTokenExpiresAt'])
        .where('user.id = :userId', { userId })
        .getOne();

    if (!user || !user.mpAccessToken) {
        return null;
    }

    // Si el token no está expirado o cerca de expirar (7 días de margen), retornarlo
    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    if (user.mpTokenExpiresAt && user.mpTokenExpiresAt > sevenDaysFromNow) {
        return user.mpAccessToken;
    }

    // Si no hay refresh token, no podemos renovar
    if (!user.mpRefreshToken) {
        logger.warn('MP_TOKEN_EXPIRED_NO_REFRESH', { userId });
        return null;
    }

    // Intentar refrescar el token
    try {
        const clientId = process.env.MP_CLIENT_ID;
        const clientSecret = process.env.MP_CLIENT_SECRET;

        if (!clientId || !clientSecret) {
            return null;
        }

        const response = await fetch(MP_TOKEN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            },
            body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                grant_type: 'refresh_token',
                refresh_token: user.mpRefreshToken
            }).toString()
        });

        if (!response.ok) {
            logger.error('MP_TOKEN_REFRESH_FAILED', { userId, status: response.status });
            return null;
        }

        const tokens = await response.json();

        // Actualizar tokens en DB
        const expiresAt = new Date();
        expiresAt.setSeconds(expiresAt.getSeconds() + (tokens.expires_in || 15552000));

        await userRepo.update(userId, {
            mpAccessToken: tokens.access_token,
            mpRefreshToken: tokens.refresh_token || user.mpRefreshToken,
            mpTokenExpiresAt: expiresAt
        });

        logger.info('MP_TOKEN_REFRESHED', { userId });

        return tokens.access_token;

    } catch (error: any) {
        logger.error('MP_TOKEN_REFRESH_ERROR', { userId, error: error?.message });
        return null;
    }
};
