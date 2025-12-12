import { Router } from "express"
import { validateTicket, getTickets, createTicket } from '../ticket/ticket.controller'
import { checkAuthToken } from "../middlewares/authToken"
import { checkRoleAuth } from "../middlewares/checkRole"




const router = Router()

//ruta protegida 
router.put("/validate", checkAuthToken, checkRoleAuth(["user", "admin"]), validateTicket)
router.post("/buy/:id", checkAuthToken, checkRoleAuth(["user", "admin"]), createTicket)
router.get("/:id", checkAuthToken, checkRoleAuth(["user", "admin"]), getTickets)

export default router