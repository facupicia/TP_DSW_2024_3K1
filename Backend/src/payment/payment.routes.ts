import express, { Router } from "express";
import { createPreference, paymentWebhook } from "./payment.controller";
import { checkAuthToken } from "../middlewares/authToken";
import { validateSignature } from "./validateSignature";

const router = Router();

// POST /api/payment/create-preference
router.post("/create-preference", checkAuthToken, createPreference);

// Webhook de Mercado Pago (no requiere autenticación)
router.post("/webhook", express.raw({ type: "*/*" }), validateSignature, paymentWebhook);
router.get("/webhook", paymentWebhook);

export default router;
