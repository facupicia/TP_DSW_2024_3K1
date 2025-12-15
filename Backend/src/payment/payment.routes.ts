import { Router } from "express";
import { createPreference, paymentWebhook } from "./payment.controller";
import { checkAuthToken } from "../middlewares/authToken";

const router = Router();

// POST /api/payment/create-preference
router.post("/create-preference", checkAuthToken, createPreference);

// Webhook de Mercado Pago (no requiere autenticación)
router.post("/webhook", paymentWebhook);
router.get("/webhook", paymentWebhook);

export default router;
