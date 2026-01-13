import { Router } from "express"
import { getEvent, createEvent, deleteEvent, getEventByName, getEventsByUser, updateEvent, getEvents, getCreatorStats, getCreatorStatsComparative, streamCreatorStats, exportCreatorStatsPdf, getPlatformStats, getEventStats, exportCreatorStatsCsv, getEventsNumber } from "../event/event.controller"
import { createTicket } from "../ticket/ticket.controller"
import { createEventSchema, updateEventSchema } from "../schemas/schema.event"
import { schemaValidation } from "../middlewares/schemaValidacion"
import { checkAuthToken } from "../middlewares/authToken"
import { checkRoleAuth } from "../middlewares/checkRole"


const router = Router()

// 1. Rutas Generales (Sin parámetros dinámicos)
router.post("/new", checkAuthToken, checkRoleAuth(["user", "organizer", "admin"]), schemaValidation(createEventSchema), createEvent)
router.get("/", checkAuthToken, checkRoleAuth(["organizer", "admin", "user"]), getEventsByUser)
router.get("/search", getEventByName)
router.get("/explore", getEvents)
router.get("/count", getEventsNumber)

// 2. Rutas Específicas (ESTADÍSTICAS) - ¡Deben ir ANTES de /:id!
router.get("/stats", checkAuthToken, checkRoleAuth(["organizer", "admin"]), getCreatorStats)
router.get("/stats/comparative", checkAuthToken, checkRoleAuth(["organizer", "admin"]), getCreatorStatsComparative)
router.get("/stats/stream", checkAuthToken, checkRoleAuth(["organizer", "admin"]), streamCreatorStats)
router.get("/stats/export-pdf", checkAuthToken, checkRoleAuth(["organizer", "admin"]), exportCreatorStatsPdf)
router.get("/stats/export-csv", checkAuthToken, checkRoleAuth(["organizer", "admin"]), exportCreatorStatsCsv)
router.get("/stats/platform", checkAuthToken, checkRoleAuth(["admin"]), getPlatformStats)
router.get("/stats/event/:id", checkAuthToken, checkRoleAuth(["organizer", "admin"]), getEventStats)

// 3. Rutas Dinámicas (Con :id) - Deben ir al final
router.post("/:id/buy", checkAuthToken, checkRoleAuth(["user", "organizer", "admin", "scanner"]), createTicket)
router.get("/:id", getEvent)
router.delete("/:id", checkAuthToken, checkRoleAuth(["organizer", "admin"]), deleteEvent)
router.put("/:id", checkAuthToken, checkRoleAuth(["organizer", "admin"]), schemaValidation(updateEventSchema), updateEvent)

export default router