import { Router } from "express"
import { validateTicket, getTickets, createTicket, cancelTicket } from '../ticket/ticket.controller'
import { checkAuthToken } from "../middlewares/authToken"
import { checkRoleAuth } from "../middlewares/checkRole"




const router = Router()

//ruta protegida 
router.put("/validate", checkAuthToken, checkRoleAuth(["scanner", "admin"]), validateTicket)
router.post("/buy/:id", checkAuthToken, checkRoleAuth(["user", "admin"]), createTicket)
router.get("/:id", checkAuthToken, checkRoleAuth(["user", "admin"]), getTickets)
router.put("/cancel/:id", checkAuthToken, checkRoleAuth(["user", "admin"]), cancelTicket)

export default router
