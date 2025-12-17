import { Router } from "express"
import { getEvent, createEvent, deleteEvent, getEventByName, getEventsByUser, updateEvent, getEvents, getCreatorStats, getCreatorStatsComparative, streamCreatorStats, exportCreatorStatsPdf } from "../event/event.controller"
import { createTicket } from "../ticket/ticket.controller"
import { createEventSchema } from "../schemas/schema.event"
import { schemaValidation } from "../middlewares/schemaValidacion"
import { checkAuthToken } from "../middlewares/authToken"
import { checkRoleAuth } from "../middlewares/checkRole"


const router = Router()

// 1. Rutas Generales (Sin parámetros dinámicos)
router.post("/new", checkAuthToken, checkRoleAuth(["user", "admin"]), schemaValidation(createEventSchema), createEvent)
router.get("/", checkAuthToken, checkRoleAuth(["user", "admin"]), getEventsByUser)
router.get("/search", getEventByName)
router.get("/explore", getEvents)

// 2. Rutas Específicas (ESTADÍSTICAS) - ¡Deben ir ANTES de /:id!
router.get("/stats", checkAuthToken, checkRoleAuth(["user", "admin"]), getCreatorStats)
router.get("/stats/comparative", checkAuthToken, checkRoleAuth(["user", "admin"]), getCreatorStatsComparative)
router.get("/stats/stream", checkAuthToken, checkRoleAuth(["user", "admin"]), streamCreatorStats)
router.get("/stats/export-pdf", checkAuthToken, checkRoleAuth(["user", "admin"]), exportCreatorStatsPdf)

// 3. Rutas Dinámicas (Con :id) - Deben ir al final
router.post("/:id/buy", checkAuthToken, checkRoleAuth(["user", "admin"]), createTicket)
router.get("/:id", getEvent)
router.delete("/:id", deleteEvent)
router.put("/:id", updateEvent)

export default router