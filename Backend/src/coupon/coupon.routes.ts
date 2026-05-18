/**
 * Coupon Routes
 * All endpoints related to discount coupons
 */
import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
    createCoupon,
    getCouponsByEvent,
    deleteCoupon,
    toggleCoupon,
    validateCoupon
} from "./coupon.controller";
import { checkAuthToken } from "../common/middleware/authToken";
import { checkRoleAuth } from "../common/middleware/checkRole";

const validateRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res, _next, options) => {
        res.status(options.statusCode).json({
            code: "COUPON_VALIDATE_RATE_LIMITED",
            message: "Demasiadas validaciones de cupón. Intenta de nuevo en un minuto."
        });
    }
});

const router = Router();

// Public: Validate coupon (for checkout)
router.post("/validate", validateRateLimiter, validateCoupon);

// Protected: Organizer only
router.post("/", checkAuthToken, checkRoleAuth(["organizer", "admin"]), createCoupon);
router.get("/event/:eventId", checkAuthToken, checkRoleAuth(["organizer", "admin"]), getCouponsByEvent);
router.delete("/:id", checkAuthToken, checkRoleAuth(["organizer", "admin"]), deleteCoupon);
router.put("/:id/toggle", checkAuthToken, checkRoleAuth(["organizer", "admin"]), toggleCoupon);

export default router;
