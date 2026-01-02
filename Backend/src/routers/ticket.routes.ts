import { Router } from "express"
import { validateTicket, getTickets, createTicket, cancelTicket, getLastPurchaseTickets } from '../ticket/ticket.controller'
import { checkAuthToken } from "../middlewares/authToken"
import { checkRoleAuth } from "../middlewares/checkRole"




const router = Router()

//ruta protegida 
router.put("/validate", checkAuthToken, checkRoleAuth(["scanner", "admin"]), validateTicket)
router.get("/last-purchase", checkAuthToken, checkRoleAuth(["user", "admin", "scanner"]), getLastPurchaseTickets)
router.post("/buy/:id", checkAuthToken, checkRoleAuth(["user", "admin", "scanner"]), createTicket)
router.get("/:id", checkAuthToken, checkRoleAuth(["user", "admin", "scanner"]), getTickets)
router.put("/cancel/:id", checkAuthToken, checkRoleAuth(["user", "admin", "scanner"]), cancelTicket)

export default router
