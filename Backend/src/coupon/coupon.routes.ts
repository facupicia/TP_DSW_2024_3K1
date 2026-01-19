/**
 * Coupon Routes
 * All endpoints related to discount coupons
 */
import { Router } from "express";
import {
    createCoupon,
    getCouponsByEvent,
    deleteCoupon,
    toggleCoupon,
    validateCoupon
} from "./coupon.controller";
import { checkAuthToken } from "../common/middleware/authToken";
import { checkRoleAuth } from "../common/middleware/checkRole";

const router = Router();

// Public: Validate coupon (for checkout)
router.post("/validate", validateCoupon);

// Protected: Organizer only
router.post("/", checkAuthToken, checkRoleAuth(["organizer", "admin"]), createCoupon);
router.get("/event/:eventId", checkAuthToken, checkRoleAuth(["organizer", "admin"]), getCouponsByEvent);
router.delete("/:id", checkAuthToken, checkRoleAuth(["organizer", "admin"]), deleteCoupon);
router.put("/:id/toggle", checkAuthToken, checkRoleAuth(["organizer", "admin"]), toggleCoupon);

export default router;
