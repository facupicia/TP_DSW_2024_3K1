import { Router } from "express";
import {
    getPlans,
    getMySubscription,
    getMyLimits,
    createCheckout,
    subscriptionWebhook,
    subscriptionCallback,
    cancelMySubscription,
    adminAssignPlan,
    adminGetStats
} from "./subscription.controller";
import { checkAuthToken } from "../middlewares/authToken";
import { checkRoleAuth } from "../middlewares/checkRole";

const router = Router();

// Public routes
router.get("/plans", getPlans);

// Webhook (no auth - called by Mercado Pago)
router.post("/webhook", subscriptionWebhook);
router.get("/webhook", subscriptionWebhook); // MP sometimes uses GET

// Callback redirect (no auth - redirects to frontend after MP checkout)
router.get("/callback", subscriptionCallback);

// Authenticated user routes
router.get("/my-subscription", checkAuthToken, checkRoleAuth(["user", "organizer", "admin"]), getMySubscription);
router.get("/my-limits", checkAuthToken, checkRoleAuth(["user", "organizer", "admin"]), getMyLimits);
router.post("/checkout/:planId", checkAuthToken, checkRoleAuth(["user", "organizer", "admin"]), createCheckout);
router.post("/cancel", checkAuthToken, checkRoleAuth(["user", "organizer", "admin"]), cancelMySubscription);

// Admin routes
router.post("/admin/assign", checkAuthToken, checkRoleAuth(["admin"]), adminAssignPlan);
router.get("/admin/stats", checkAuthToken, checkRoleAuth(["admin"]), adminGetStats);

export default router;
