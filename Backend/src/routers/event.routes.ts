import { Router } from "express"
import { getEvent, createEvent, deleteEvent, getEventByName, getEventsByUser, updateEvent, getEvents, getCreatorStats, getCreatorStatsComparative, streamCreatorStats, exportCreatorStatsPdf, getPlatformStats, getEventStats, exportCreatorStatsCsv, getEventsNumber } from "../event/event.controller"
import { createTicket } from "../ticket/ticket.controller"
import { createEventSchema, updateEventSchema } from "../schemas/schema.event"
import { schemaValidation } from "../middlewares/schemaValidacion"
import { checkAuthToken } from "../middlewares/authToken"
import { checkRoleAuth } from "../middlewares/checkRole"


const router = Router()

// 1. Rutas Generales (Sin parámetros dinámicos)
router.post("/new", checkAuthToken, checkRoleAuth(["user", "admin", "scanner"]), schemaValidation(createEventSchema), createEvent)
router.get("/", checkAuthToken, checkRoleAuth(["user", "admin", "scanner"]), getEventsByUser)
router.get("/search", getEventByName)
router.get("/explore", getEvents)
router.get("/count", getEventsNumber)

// 2. Rutas Específicas (ESTADÍSTICAS) - ¡Deben ir ANTES de /:id!
router.get("/stats", checkAuthToken, checkRoleAuth(["user", "admin", "scanner"]), getCreatorStats)
router.get("/stats/comparative", checkAuthToken, checkRoleAuth(["user", "admin", "scanner"]), getCreatorStatsComparative)
router.get("/stats/stream", checkAuthToken, checkRoleAuth(["user", "admin", "scanner"]), streamCreatorStats)
router.get("/stats/export-pdf", checkAuthToken, checkRoleAuth(["user", "admin", "scanner"]), exportCreatorStatsPdf)
router.get("/stats/export-csv", checkAuthToken, checkRoleAuth(["user", "admin", "scanner"]), exportCreatorStatsCsv)
router.get("/stats/platform", checkAuthToken, checkRoleAuth(["admin"]), getPlatformStats)
router.get("/stats/event/:id", checkAuthToken, checkRoleAuth(["user", "admin", "scanner"]), getEventStats)

// 3. Rutas Dinámicas (Con :id) - Deben ir al final
router.post("/:id/buy", checkAuthToken, checkRoleAuth(["user", "admin", "scanner"]), createTicket)
router.get("/:id", getEvent)
router.delete("/:id", checkAuthToken, checkRoleAuth(["user", "admin", "scanner"]), deleteEvent)
router.put("/:id", checkAuthToken, checkRoleAuth(["user", "admin", "scanner"]), schemaValidation(updateEventSchema), updateEvent)

export default router