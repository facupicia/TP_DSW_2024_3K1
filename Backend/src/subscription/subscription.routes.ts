import { Router } from "express";
import {
    getPlans,
    getMySubscription,
    getMyLimits,
    createCheckout,
    subscriptionWebhook,
    subscriptionCallback,
    cancelMySubscription,
    verifySubscription,
    adminAssignPlan,
    adminGetStats
} from "./subscription.controller";
import { checkAuthToken } from "../common/middleware/authToken";
import { checkRoleAuth } from "../common/middleware/checkRole";
import { createValidateMPWebhookSignature } from "../payment/mp-webhook.middleware";
import express from "express";

const router = Router();

// ============================================================================
// PUBLIC ROUTES
// ============================================================================

/**
 * GET /api/subscription/plans
 * 
 * Lista todos los planes de suscripción disponibles.
 */
router.get("/plans", getPlans);

// ============================================================================
// WEBHOOK ROUTES (No auth - called by MercadoPago)
// ============================================================================

/**
 * POST/GET /api/subscription/webhook
 * 
 * Recibe notificaciones de MercadoPago sobre suscripciones.
 * NOTA: No requiere auth token - los webhooks vienen directamente de MP.
 */
router.post("/webhook", express.json(), createValidateMPWebhookSignature('subscription'), subscriptionWebhook);
router.get("/webhook", createValidateMPWebhookSignature('subscription'), subscriptionWebhook);

/**
 * GET /api/subscription/callback
 * 
 * Redirección después del checkout de MP.
 * No requiere auth porque viene de MP.
 */
router.get("/callback", subscriptionCallback);

// ============================================================================
// AUTHENTICATED USER ROUTES
// ============================================================================

/**
 * GET /api/subscription/my-subscription
 * 
 * Obtiene la suscripción actual del usuario.
 */
router.get(
    "/my-subscription",
    checkAuthToken,
    checkRoleAuth(["user", "organizer", "admin", "scanner", "rrpp"]),
    getMySubscription
);

/**
 * GET /api/subscription/my-limits
 * 
 * Obtiene los límites y uso del plan actual.
 */
router.get(
    "/my-limits",
    checkAuthToken,
    checkRoleAuth(["user", "organizer", "admin", "scanner", "rrpp"]),
    getMyLimits
);

/**
 * POST /api/subscription/checkout/:planId
 * 
 * Crea un checkout de MP para suscribirse a un plan.
 */
router.post(
    "/checkout/:planId",
    checkAuthToken,
    checkRoleAuth(["user", "organizer", "admin", "scanner", "rrpp"]),
    createCheckout
);

/**
 * POST /api/subscription/verify/:id
 * 
 * Verifica manualmente una suscripción (útil si el webhook se demora).
 */
router.post(
    "/verify/:id",
    checkAuthToken,
    checkRoleAuth(["user", "organizer", "admin", "scanner", "rrpp"]),
    verifySubscription
);

/**
 * POST /api/subscription/cancel
 * 
 * Cancela la suscripción activa.
 */
router.post(
    "/cancel",
    checkAuthToken,
    checkRoleAuth(["user", "organizer", "admin", "scanner", "rrpp"]),
    cancelMySubscription
);

// ============================================================================
// ADMIN ROUTES
// ============================================================================

/**
 * POST /api/subscription/admin/assign
 * 
 * Admin: Asigna manualmente un plan a un usuario.
 */
router.post(
    "/admin/assign",
    checkAuthToken,
    checkRoleAuth(["admin"]),
    adminAssignPlan
);

/**
 * GET /api/subscription/admin/stats
 * 
 * Admin: Estadísticas de suscripciones.
 */
router.get(
    "/admin/stats",
    checkAuthToken,
    checkRoleAuth(["admin"]),
    adminGetStats
);

export default router;
