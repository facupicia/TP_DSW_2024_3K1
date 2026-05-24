/**
 * Event Routes
 * All endpoints related to event management and statistics
 */
import { Router } from "express"
import { getEvent, createEvent, deleteEvent, getEventByName, getEventsByUser, updateEvent, getEvents, getCreatorStats, getCreatorStatsComparative, streamCreatorStats, exportCreatorStatsPdf, getPlatformStats, getEventStats, exportCreatorStatsCsv, getEventsNumber } from "./event.controller"
import { createEventSchema, updateEventSchema } from "../schemas/schema.event"
import { schemaValidation } from "../common/middleware/schemaValidacion"
import { checkAuthToken } from "../common/middleware/authToken"
import { checkRoleAuth } from "../common/middleware/checkRole"

const router = Router()

import { globalRateLimiter } from "../common/middleware/rateLimit";

/* ==================== PUBLIC ROUTES ==================== */
router.get("/", globalRateLimiter, getEvents)  // Ruta pública para listar eventos
router.get("/explore", globalRateLimiter, getEvents)
router.get("/search", globalRateLimiter, getEventByName)
router.get("/count", checkAuthToken, checkRoleAuth(["admin"]), getEventsNumber)

/* ==================== STATISTICS ROUTES (before /:id) ==================== */
router.get("/stats", checkAuthToken, checkRoleAuth(["organizer", "admin"]), getCreatorStats)
router.get("/stats/comparative", checkAuthToken, checkRoleAuth(["organizer", "admin"]), getCreatorStatsComparative)
router.get("/stats/stream", checkAuthToken, checkRoleAuth(["organizer", "admin"]), streamCreatorStats)
router.get("/stats/export-pdf", checkAuthToken, checkRoleAuth(["organizer", "admin"]), exportCreatorStatsPdf)
router.get("/stats/export-csv", checkAuthToken, checkRoleAuth(["organizer", "admin"]), exportCreatorStatsCsv)
router.get("/stats/platform", checkAuthToken, checkRoleAuth(["admin"]), getPlatformStats)
router.get("/stats/event/:id", checkAuthToken, checkRoleAuth(["organizer", "admin"]), getEventStats)

/* ==================== PROTECTED ROUTES ==================== */
router.post("/new", checkAuthToken, checkRoleAuth(["user", "organizer", "admin", "scanner", "rrpp"]), schemaValidation(createEventSchema), createEvent)
router.get("/my-events", checkAuthToken, checkRoleAuth(["organizer", "admin"]), getEventsByUser)

/* ==================== DYNAMIC ROUTES (must be last) ==================== */
router.post("/:id/buy", checkAuthToken, (_req, res) => {
    res.status(410).json({
        code: "DIRECT_TICKET_PURCHASE_DISABLED",
        message: "La compra directa fue deshabilitada. Usa /api/payment/create-preference."
    })
})
router.get("/:id", getEvent)
router.delete("/:id", checkAuthToken, checkRoleAuth(["organizer", "admin"]), deleteEvent)
router.put("/:id", checkAuthToken, checkRoleAuth(["organizer", "admin"]), schemaValidation(updateEventSchema), updateEvent)

export default router
