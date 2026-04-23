/**
 * Ticket Routes
 * All endpoints related to ticket purchases and management
 */
import { Router } from "express"
import { validateTicket, getTickets, createTicket, cancelTicket, getLastPurchaseTickets, inviteGuests } from "./ticket.controller"
import { checkAuthToken } from "../common/middleware/authToken"
import { checkExactRole, checkRoleAuth } from "../common/middleware/checkRole"

const router = Router()

router.put("/validate", checkAuthToken, checkExactRole(["scanner", "admin", "organizer"]), validateTicket)
router.get("/last-purchase", checkAuthToken, checkRoleAuth(["user", "admin", "scanner", "organizer", "rrpp"]), getLastPurchaseTickets)
router.post("/invite", checkAuthToken, checkRoleAuth(["organizer", "admin"]), inviteGuests)
router.post("/buy/:id", checkAuthToken, (_req, res) => {
    res.status(410).json({
        code: "DIRECT_TICKET_PURCHASE_DISABLED",
        message: "La compra directa fue deshabilitada. Usa /api/payment/create-preference."
    })
})
router.get("/:id", checkAuthToken, checkRoleAuth(["user", "admin", "scanner", "organizer", "rrpp"]), getTickets)
router.put("/cancel/:id", checkAuthToken, checkRoleAuth(["user", "admin", "scanner", "organizer", "rrpp"]), cancelTicket)

export default router
