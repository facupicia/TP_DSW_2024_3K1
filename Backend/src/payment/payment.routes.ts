import { Router } from "express";
import rateLimit from "express-rate-limit";
import { createPreference, paymentWebhook, getPaymentStatus, simulatePaymentWebhook } from "./payment.controller";
import { 
    initiateOAuth, 
    oauthCallback, 
    getMpStatus, 
    disconnectMp 
} from "./mp-oauth.controller";
import { checkAuthToken, optionalAuthToken, CustomRequest } from "../common/middleware/authToken";
import { checkRoleAuth } from "../common/middleware/checkRole";
import { 
    createValidateMPWebhookSignature 
} from "./mp-webhook.middleware";

const preferenceRateLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res, _next, options) => {
        res.status(options.statusCode).json({
            code: "PREFERENCE_RATE_LIMITED",
            message: "Demasiadas solicitudes de creación de preferencias. Intenta de nuevo en 5 minutos."
        });
    }
});

const statusRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res, _next, options) => {
        res.status(options.statusCode).json({
            code: "STATUS_RATE_LIMITED",
            message: "Demasiadas consultas de estado. Intenta de nuevo en un minuto."
        });
    }
});

const refundRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res, _next, options) => {
        res.status(options.statusCode).json({
            code: "REFUND_RATE_LIMITED",
            message: "Demasiadas solicitudes de reembolso. Intenta de nuevo en un minuto."
        });
    }
});

const router = Router();

/* ==================== PAYMENT ROUTES ==================== */

/**
 * POST /api/payment/create-preference
 * 
 * Crea una preferencia de pago para comprar tickets.
 * Acepta usuarios autenticados o compradores invitados.
 */
router.post("/create-preference", preferenceRateLimiter, optionalAuthToken, createPreference);

/**
 * GET /api/payment/status
 * 
 * Verifica el estado de un pago por external_reference.
 * Usado por el frontend para polling después del checkout, incluso para invitados.
 */
router.get("/status", statusRateLimiter, getPaymentStatus);

/* ==================== WEBHOOK ROUTES ==================== */

/**
 * POST/GET /api/payment/webhook
 * 
 * Webhook de MercadoPago para notificaciones de pago.
 * NOTA: Siempre responde 200 OK para que MP no reintente.
 * NOTA: No requiere auth token - los webhooks vienen directamente de MP.
 */

router.post("/webhook", createValidateMPWebhookSignature('payment'), paymentWebhook);

// GET webhook - para notificaciones GET de MP  
router.get("/webhook", createValidateMPWebhookSignature('payment'), paymentWebhook);

/* ==================== MP OAUTH ROUTES ==================== */

/**
 * GET /api/payment/mp/connect
 * 
 * Inicia el flujo OAuth para conectar cuenta de MP.
 * Retorna la URL de autorización.
 */
router.get("/mp/connect", checkAuthToken, initiateOAuth);

/**
 * GET /api/payment/mp/callback
 * 
 * Callback de MP después de la autorización.
 * Intercambia el código por tokens y redirige al frontend.
 */
router.get("/mp/callback", oauthCallback);

/**
 * GET /api/payment/mp/status
 * 
 * Verifica si el usuario tiene cuenta de MP vinculada.
 */
router.get("/mp/status", checkAuthToken, getMpStatus);

/**
 * POST /api/payment/test-webhook
 * 
 * Endpoint de prueba para simular un webhook de pago.
 * Solo disponible en modo sandbox/development.
 * 
 * Body: { paymentId: string, externalReference?: string }
 */
router.post("/test-webhook", checkAuthToken, checkRoleAuth(["admin"]), simulatePaymentWebhook);

/**
 * POST /api/payment/mp/disconnect
 * 
 * Desconecta la cuenta de MP del usuario.
 */
router.post("/mp/disconnect", checkAuthToken, disconnectMp);

/**
 * POST /api/payment/refund/:paymentId
 * 
 * Procesa un reembolso de pago.
 * Puede ser reembolso total o parcial.
 * 
 * Body: { amount?: number, reason?: string }
 */
router.post("/refund/:paymentId", refundRateLimiter, checkAuthToken, checkRoleAuth(["organizer", "admin"]), async (req: CustomRequest, res) => {
    const { processRefund } = await import('./refund.service');
    const result = await processRefund(req.params.paymentId, {
        amount: req.body?.amount,
        reason: req.body?.reason,
        requestedBy: req.user?.id,
        requesterRoles: req.user?.roles || []
    });
    res.status(result.success ? 200 : 400).json(result);
});

/**
 * GET /api/payment/refund-status/:paymentId
 * 
 * Verifica si un pago puede ser reembolsado.
 */
router.get("/refund-status/:paymentId", refundRateLimiter, checkAuthToken, checkRoleAuth(["organizer", "admin"]), async (req: CustomRequest, res) => {
    const { getRefundStatus } = await import('./refund.service');
    const result = await getRefundStatus(req.params.paymentId, req.user?.id, req.user?.roles || []);
    res.status(200).json(result);
});

export default router;
