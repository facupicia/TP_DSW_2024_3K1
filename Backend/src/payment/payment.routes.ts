import express, { Router } from "express";
import { createPreference, paymentWebhook, getPaymentStatus, simulatePaymentWebhook, createQRPreference } from "./payment.controller";
import { 
    initiateOAuth, 
    oauthCallback, 
    getMpStatus, 
    disconnectMp 
} from "./mp-oauth.controller";
import { checkAuthToken } from "../common/middleware/authToken";
import { 
    validateMPWebhookIP,
    createValidateMPWebhookSignature 
} from "./mp-webhook.middleware";

const router = Router();

/* ==================== PAYMENT ROUTES ==================== */

/**
 * POST /api/payment/create-preference
 * 
 * Crea una preferencia de pago para comprar tickets.
 * Requiere autenticación.
 */
router.post("/create-preference", checkAuthToken, createPreference);

/**
 * GET /api/payment/status
 * 
 * Verifica el estado de un pago por external_reference.
 * Usado por el frontend para polling después del checkout.
 */
router.get("/status", checkAuthToken, getPaymentStatus);

/**
 * POST /api/payment/create-qr-preference
 * 
 * Crea una preferencia de pago por QR (Checkout Pro).
 * El usuario paga escaneando el QR desde la app de MercadoPago.
 * Comisión MP: 2.59%
 */
router.post("/create-qr-preference", checkAuthToken, createQRPreference);

/* ==================== WEBHOOK ROUTES ==================== */

/**
 * POST/GET /api/payment/webhook
 * 
 * Webhook de MercadoPago para notificaciones de pago.
 * NOTA: Siempre responde 200 OK para que MP no reintente.
 * NOTA: No requiere auth token - los webhooks vienen directamente de MP.
 */

// POST webhook - sin validaciones complejas para evitar errores 502
router.post("/webhook", express.json(), paymentWebhook);

// GET webhook - para notificaciones GET de MP  
router.get("/webhook", paymentWebhook);

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
router.post("/test-webhook", checkAuthToken, simulatePaymentWebhook);

/**
 * POST /api/payment/mp/disconnect
 * 
 * Desconecta la cuenta de MP del usuario.
 */
router.post("/mp/disconnect", checkAuthToken, disconnectMp);

export default router;
