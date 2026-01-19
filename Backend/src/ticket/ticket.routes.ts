/**
 * Ticket Routes
 * All endpoints related to ticket purchases and management
 */
import { Router } from "express"
import { validateTicket, getTickets, createTicket, cancelTicket, getLastPurchaseTickets, inviteGuests } from "./ticket.controller"
import { checkAuthToken } from "../common/middleware/authToken"
import { checkRoleAuth } from "../common/middleware/checkRole"

const router = Router()

router.put("/validate", checkAuthToken, checkRoleAuth(["scanner", "admin"]), validateTicket)
router.get("/last-purchase", checkAuthToken, checkRoleAuth(["user", "admin", "scanner", "organizer"]), getLastPurchaseTickets)
router.post("/invite", checkAuthToken, checkRoleAuth(["organizer", "admin"]), inviteGuests)
router.post("/buy/:id", checkAuthToken, checkRoleAuth(["admin", "user", "scanner", "organizer"]), createTicket)
router.get("/:id", checkAuthToken, checkRoleAuth(["user", "admin", "scanner", "organizer"]), getTickets)
router.put("/cancel/:id", checkAuthToken, checkRoleAuth(["user", "admin", "scanner", "organizer"]), cancelTicket)

export default router
