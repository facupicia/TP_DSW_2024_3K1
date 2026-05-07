import { Request, Response } from 'express';
import { CustomRequest } from '../common/middleware/authToken';
import AppDataSource from '../db';
import { User } from '../user/user.entity';
import { logger } from '../common/services/logger';
import { 
    getMPConfig, 
    generateOAuthState, 
    verifyOAuthState,
    MP_ENDPOINTS 
} from './mp.config';
import { encryptToString, decryptFromString } from '../common/services/encryption';

/**
 * MercadoPago OAuth Controller (Refactored)
 * 
 * Maneja el flujo OAuth para que organizadores conecten su cuenta de MP.
 * Ahora con:
 * - Estados firmados criptográficamente
 * - Tokens encriptados en base de datos
 * - Manejo consistente de errores
 */

// ============================================================================
// OAUTH INITIATION
// ============================================================================

/**
 * GET /api/payment/mp/connect
 * 
 * Genera la URL de autorización de MP y la devuelve al frontend.
 */
export const initiateOAuth = async (req: CustomRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({
                code: 'UNAUTHORIZED',
                message: 'No autorizado'
            });
        }

        const config = getMPConfig();
        const redirectUri = `${config.appUrl}/api/payment/mp/callback`;

        // Capturar página de retorno (ej: /create-event, /profile, /settings)
        const redirectTo = req.query.redirectTo as string | undefined;
        const allowedPaths = ['/perfil', '/profile', '/create-event', '/settings', '/configuracion'];
        const sanitizedRedirect = redirectTo && allowedPaths.includes(redirectTo) ? redirectTo : undefined;

        // Generar state firmado con redirectTo
        const state = generateOAuthState(userId, sanitizedRedirect);

        const params = new URLSearchParams({
            client_id: config.clientId,
            response_type: 'code',
            platform_id: 'mp',
            redirect_uri: redirectUri,
            state: state
        });

        const authUrl = `${MP_ENDPOINTS.auth}?${params.toString()}`;

        logger.info('MP_OAUTH_INITIATED', { userId, redirectUri, redirectTo });

        return res.json({
            success: true,
            authUrl,
            message: 'Redirige al usuario a authUrl para conectar su cuenta de Mercado Pago'
        });

    } catch (error: any) {
        logger.error('MP_OAUTH_INIT_ERROR', { error: error?.message });
        return res.status(500).json({
            code: 'INIT_ERROR',
            message: 'Error al iniciar conexión con Mercado Pago'
        });
    }
};

// ============================================================================
// OAUTH CALLBACK
// ============================================================================

/**
 * GET /api/payment/mp/callback
 * 
 * Callback de MP después de que el usuario autoriza.
 * Intercambia el código por tokens y los guarda encriptados.
 */
export const oauthCallback = async (req: Request, res: Response) => {
    const config = getMPConfig();

    try {
        const { code, state, error } = req.query;

        // Determinar página de retorno (default: /perfil)
        let returnPath = '/perfil';

        // Si MP envía un error (usuario canceló, etc)
        if (error) {
            logger.warn('MP_OAUTH_CANCELLED', { error });
            return res.redirect(`${config.clientUrl}${returnPath}?mp_error=cancelled&mp_error_description=${encodeURIComponent(String(error))}`);
        }

        if (!code || !state) {
            logger.error('MP_OAUTH_MISSING_PARAMS', {
                hasCode: !!code,
                hasState: !!state
            });
            return res.redirect(`${config.clientUrl}${returnPath}?mp_error=missing_params`);
        }

        // Verificar state
        const stateData = verifyOAuthState(String(state));
        if (!stateData) {
            logger.error('MP_OAUTH_INVALID_STATE', { state: String(state).substring(0, 20) });
            return res.redirect(`${config.clientUrl}${returnPath}?mp_error=invalid_state`);
        }

        const { userId, redirectTo } = stateData;
        const allowedPaths = ['/perfil', '/profile', '/create-event', '/settings', '/configuracion'];
        // Usar la página original si existe y está en whitelist, sino default
        if (redirectTo && allowedPaths.includes(redirectTo)) {
            returnPath = redirectTo;
        }

        const redirectUri = `${config.appUrl}/api/payment/mp/callback`;

        // Intercambiar código por tokens
        const tokenResponse = await fetch(MP_ENDPOINTS.token, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            },
            body: new URLSearchParams({
                client_id: config.clientId,
                client_secret: config.clientSecret,
                code: String(code),
                grant_type: 'authorization_code',
                redirect_uri: redirectUri
            }).toString()
        });

        if (!tokenResponse.ok) {
            const errorData = await tokenResponse.text();
            logger.error('MP_OAUTH_TOKEN_ERROR', {
                status: tokenResponse.status,
                error: errorData,
                userId
            });
            return res.redirect(`${config.clientUrl}${returnPath}?mp_error=token_exchange_failed`);
        }

        const tokens = await tokenResponse.json() as any;

        if (!tokens.access_token || !tokens.user_id) {
            logger.error('MP_OAUTH_INVALID_TOKENS', {
                hasAccessToken: !!tokens.access_token,
                hasUserId: !!tokens.user_id
            });
            return res.redirect(`${config.clientUrl}${returnPath}?mp_error=invalid_tokens`);
        }

        // Calcular fecha de expiración
        const expiresAt = new Date();
        expiresAt.setSeconds(expiresAt.getSeconds() + (tokens.expires_in || 15552000));

        // Encriptar tokens antes de guardar
        const encryptedAccessToken = encryptToString(tokens.access_token);
        const encryptedRefreshToken = tokens.refresh_token
            ? encryptToString(tokens.refresh_token)
            : null;

        if (!encryptedAccessToken) {
            logger.error('MP_OAUTH_ENCRYPTION_FAILED', { userId });
            return res.redirect(`${config.clientUrl}${returnPath}?mp_error=encryption_failed`);
        }

        // Guardar tokens encriptados
        const userRepo = AppDataSource.getRepository(User);
        await userRepo.update(userId, {
            mpUserId: String(tokens.user_id),
            mpAccessToken: encryptedAccessToken,
            mpRefreshToken: encryptedRefreshToken,
            mpTokenExpiresAt: expiresAt
        });

        logger.info('MP_OAUTH_SUCCESS', {
            userId,
            mpUserId: tokens.user_id,
            expiresAt: expiresAt.toISOString(),
            redirectTo: returnPath
        });

        return res.redirect(`${config.clientUrl}${returnPath}?mp_connected=true`);

    } catch (error: any) {
        logger.error('MP_OAUTH_CALLBACK_ERROR', { error: error?.message });
        return res.redirect(`${config.clientUrl}/perfil?mp_error=server_error`);
    }
};

// ============================================================================
// STATUS & DISCONNECT
// ============================================================================

/**
 * GET /api/payment/mp/status
 * 
 * Verifica el estado de conexión de MP del usuario actual.
 */
export const getMpStatus = async (req: CustomRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ 
                code: 'UNAUTHORIZED',
                message: 'No autorizado' 
            });
        }
        
        const userRepo = AppDataSource.getRepository(User);
        const user = await userRepo.findOne({
            where: { id: userId },
            select: ['id', 'mpUserId', 'mpTokenExpiresAt']
        });
        
        if (!user) {
            return res.status(404).json({ 
                code: 'NOT_FOUND',
                message: 'Usuario no encontrado' 
            });
        }
        
        const now = new Date();
        const isExpired = user.mpTokenExpiresAt ? now > user.mpTokenExpiresAt : false;
        const isConnected = !!user.mpUserId && !isExpired;
        
        return res.json({
            success: true,
            connected: isConnected,
            mpUserId: user.mpUserId,
            expiresAt: user.mpTokenExpiresAt,
            needsReconnect: isExpired
        });
        
    } catch (error: any) {
        logger.error('MP_STATUS_ERROR', { error: error?.message });
        return res.status(500).json({ 
            code: 'STATUS_ERROR',
            message: 'Error al verificar estado de Mercado Pago' 
        });
    }
};

/**
 * POST /api/payment/mp/disconnect
 * 
 * Desconecta la cuenta de MP del usuario.
 */
export const disconnectMp = async (req: CustomRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ 
                code: 'UNAUTHORIZED',
                message: 'No autorizado' 
            });
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
        return res.status(500).json({ 
            code: 'DISCONNECT_ERROR',
            message: 'Error al desconectar Mercado Pago' 
        });
    }
};

// ============================================================================
// TOKEN REFRESH
// ============================================================================

/**
 * Helper para refrescar el access token si está por expirar.
 * Desencripta el token actual, refresca, y guarda encriptado nuevamente.
 */
export const refreshOrganizerToken = async (userId: number): Promise<string | null> => {
    const userRepo = AppDataSource.getRepository(User);
    
    try {
        // Obtener usuario con tokens
        const user = await userRepo
            .createQueryBuilder('user')
            .select([
                'user.id', 
                'user.mpUserId', 
                'user.mpAccessToken', 
                'user.mpRefreshToken', 
                'user.mpTokenExpiresAt'
            ])
            .where('user.id = :userId', { userId })
            .getOne();
        
        if (!user?.mpAccessToken) {
            return null;
        }
        
        // Desencriptar token actual
        const currentToken = decryptFromString(user.mpAccessToken);
        if (!currentToken) {
            logger.error('MP_TOKEN_DECRYPT_FAILED', { userId });
            return null;
        }
        
        // Verificar si necesita refresco (7 días de margen)
        const now = new Date();
        const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        
        if (user.mpTokenExpiresAt && user.mpTokenExpiresAt > sevenDaysFromNow) {
            // Token todavía válido
            return currentToken;
        }
        
        // Necesita refresco
        if (!user.mpRefreshToken) {
            logger.warn('MP_TOKEN_EXPIRED_NO_REFRESH', { userId });
            return null;
        }
        
        const config = getMPConfig();
        const decryptedRefreshToken = decryptFromString(user.mpRefreshToken);
        
        if (!decryptedRefreshToken) {
            logger.error('MP_REFRESH_TOKEN_DECRYPT_FAILED', { userId });
            return null;
        }
        
        // Llamar a MP para refrescar
        const response = await fetch(MP_ENDPOINTS.token, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            },
            body: new URLSearchParams({
                client_id: config.clientId,
                client_secret: config.clientSecret,
                grant_type: 'refresh_token',
                refresh_token: decryptedRefreshToken
            }).toString()
        });
        
        if (!response.ok) {
            logger.error('MP_TOKEN_REFRESH_FAILED', { 
                userId, 
                status: response.status 
            });
            return null;
        }
        
        const tokens = await response.json() as any;
        
        // Calcular nueva fecha de expiración
        const expiresAt = new Date();
        expiresAt.setSeconds(expiresAt.getSeconds() + (tokens.expires_in || 15552000));
        
        // Encriptar nuevos tokens
        const newEncryptedAccess = encryptToString(tokens.access_token);
        const newEncryptedRefresh = tokens.refresh_token 
            ? encryptToString(tokens.refresh_token)
            : user.mpRefreshToken; // Mantener el anterior si no hay nuevo
        
        if (!newEncryptedAccess) {
            logger.error('MP_TOKEN_REFRESH_ENCRYPTION_FAILED', { userId });
            return null;
        }
        
        // Guardar en DB
        await userRepo.update(userId, {
            mpAccessToken: newEncryptedAccess,
            mpRefreshToken: newEncryptedRefresh,
            mpTokenExpiresAt: expiresAt
        });
        
        logger.info('MP_TOKEN_REFRESHED', { userId, expiresAt: expiresAt.toISOString() });
        
        return tokens.access_token;
        
    } catch (error: any) {
        logger.error('MP_TOKEN_REFRESH_ERROR', { userId, error: error?.message });
        return null;
    }
};
