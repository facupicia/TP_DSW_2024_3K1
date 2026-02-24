/**
 * Event Routes
 * All endpoints related to event management and statistics
 */
import { Router } from "express"
import { getEvent, createEvent, deleteEvent, getEventByName, getEventsByUser, updateEvent, getEvents, getCreatorStats, getCreatorStatsComparative, streamCreatorStats, exportCreatorStatsPdf, getPlatformStats, getEventStats, exportCreatorStatsCsv, getEventsNumber } from "./event.controller"
import { createTicket } from "../ticket/ticket.controller"
import { createEventSchema, updateEventSchema } from "../schemas/schema.event"
import { schemaValidation } from "../common/middleware/schemaValidacion"
import { checkAuthToken } from "../common/middleware/authToken"
import { checkRoleAuth } from "../common/middleware/checkRole"

const router = Router()

/* ==================== PUBLIC ROUTES ==================== */
router.get("/explore", getEvents)
router.get("/search", getEventByName)
router.get("/count", getEventsNumber)

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
router.get("/", checkAuthToken, checkRoleAuth(["organizer", "admin", "user", "rrpp"]), getEventsByUser)

/* ==================== DYNAMIC ROUTES (must be last) ==================== */
router.post("/:id/buy", checkAuthToken, checkRoleAuth(["user", "organizer", "admin", "scanner", "rrpp"]), createTicket)
router.get("/:id", getEvent)
router.delete("/:id", checkAuthToken, checkRoleAuth(["organizer", "admin"]), deleteEvent)
router.put("/:id", checkAuthToken, checkRoleAuth(["organizer", "admin"]), schemaValidation(updateEventSchema), updateEvent)

export default router
