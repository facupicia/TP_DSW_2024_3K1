import express, { Router } from "express";
import { createPreference, paymentWebhook } from "./payment.controller";
import { checkAuthToken } from "../middlewares/authToken";

const router = Router();

// POST /api/payment/create-preference
router.post("/create-preference", checkAuthToken, createPreference);

// Webhook de Mercado Pago
// IMPORTANTE: Ya no usamos express.raw ni validateSignature.
// Asumimos que en tu app.ts principal tienes app.use(express.json());
router.post("/webhook", paymentWebhook);

export default router;