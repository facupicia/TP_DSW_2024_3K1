import { Router } from "express";
import { checkAuthToken } from "../common/middleware/authToken";
import {
    addPromoter,
    getMyPromoters,
    getPromoterById,
    updatePromoter,
    removePromoter,
    assignPromoterToEvent,
    removePromoterFromEvent,
    getPromoterProfile,
    checkOrganizerHasEvents,
    getMyAssignedEvents
} from "./promoter.controller";
import {
    getPromotersStats,
    getPromoterStatsById,
    getMyPromoterStats,
    getEventsPromoterStats,
    exportPromotersStatsPdf
} from "./promoter.stats.controller";

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Promoter
 *   description: Gestión de promotores (RRPP) y estadísticas de ventas
 */

// IMPORTANTE: Las rutas específicas deben ir ANTES que las rutas con parámetros (:id)

// Promoter profile (for logged in promoter) - debe ir antes de /:id
router.get("/profile", checkAuthToken, getPromoterProfile);

// Get my assigned events with shareable links - debe ir antes de /:id
router.get("/my-events", checkAuthToken, getMyAssignedEvents);

// Check if organizer has events - debe ir antes de /:id
router.get("/has-events", checkAuthToken, checkOrganizerHasEvents);

// Statistics routes - deben ir antes de /:id
router.get("/stats/overview", checkAuthToken, getPromotersStats);
router.get("/stats/events", checkAuthToken, getEventsPromoterStats);
router.get("/stats/me", checkAuthToken, getMyPromoterStats);
router.get("/stats/export/:eventId", checkAuthToken, exportPromotersStatsPdf);

// Promoter management routes
router.post("/", checkAuthToken, addPromoter);
router.get("/", checkAuthToken, getMyPromoters);

// Rutas con parámetros - van al final
router.get("/:id/stats", checkAuthToken, getPromoterStatsById);
router.get("/:id", checkAuthToken, getPromoterById);
router.put("/:id", checkAuthToken, updatePromoter);
router.delete("/:id", checkAuthToken, removePromoter);

// Promoter event assignment routes
router.post("/:id/events", checkAuthToken, assignPromoterToEvent);
router.delete("/:id/events/:eventId", checkAuthToken, removePromoterFromEvent);

export default router;
