import express, { Router } from "express";
import { createPreference, paymentWebhook } from "./payment.controller";
import { initiateOAuth, oauthCallback, getMpStatus, disconnectMp } from "./mp-oauth.controller";
import { checkAuthToken } from "../middlewares/authToken";

const router = Router();

/* ==================== PAYMENT ROUTES ==================== */

// POST /api/payment/create-preference
router.post("/create-preference", checkAuthToken, createPreference);

// Webhook de Mercado Pago
router.post("/webhook", paymentWebhook);
router.get("/webhook", paymentWebhook);

/* ==================== MP OAUTH ROUTES ==================== */
// Flujo OAuth para que organizadores conecten su cuenta MP

// GET /api/payment/mp/connect - Obtener URL de autorización
router.get("/mp/connect", checkAuthToken, initiateOAuth);

// GET /api/payment/mp/callback - Callback de MP después de autorizar
router.get("/mp/callback", oauthCallback);

// GET /api/payment/mp/status - Verificar si el usuario tiene MP vinculado
router.get("/mp/status", checkAuthToken, getMpStatus);

// POST /api/payment/mp/disconnect - Desconectar cuenta MP
router.post("/mp/disconnect", checkAuthToken, disconnectMp);

export default router;