import { Router } from "express"
import { getEvent, createEvent, deleteEvent, getEventByName, getEventsByUser, updateEvent, getEvents } from "../event/event.controller"
import { createEventSchema } from "../schemas/schema.event"
import { schemaValidation } from "../middlewares/schemaValidacion"
import { checkAuthToken } from "../middlewares/authToken"
import { checkRoleAuth } from "../middlewares/checkRole"


const router = Router()


router.post("/new", checkAuthToken, checkRoleAuth(["user", "admin"]), schemaValidation(createEventSchema), createEvent)
router.get("/", checkAuthToken, checkRoleAuth(["user", "admin"]), getEventsByUser)
router.get("/search", getEventByName)
router.get("/explore", getEvents)
router.get("/:id", getEvent)
router.delete("/:id", deleteEvent)
router.put("/:id", updateEvent)




export default router