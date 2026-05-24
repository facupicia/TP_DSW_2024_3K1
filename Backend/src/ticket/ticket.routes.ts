/**
 * Ticket Routes
 * All endpoints related to ticket purchases and management
 */
import { Router } from "express"
import { getTickets, createTicket, cancelTicket, getLastPurchaseTickets, inviteGuests } from "./ticket.controller"
import { checkAuthToken } from "../common/middleware/authToken"
import { checkRoleAuth } from "../common/middleware/checkRole"
import { schemaValidation } from "../common/middleware/schemaValidacion"
import { createTicketSchema, cancelTicketSchema, inviteGuestsSchema, getTicketsSchema } from "../schemas/schema.ticket"

const router = Router()

router.get("/last-purchase", checkAuthToken, checkRoleAuth(["user", "admin", "scanner", "organizer", "rrpp"]), getLastPurchaseTickets)
router.post("/invite", checkAuthToken, checkRoleAuth(["organizer", "admin"]), schemaValidation(inviteGuestsSchema), inviteGuests)
router.post("/buy/:id", checkAuthToken, schemaValidation(createTicketSchema), (_req, res) => {
    res.status(410).json({
        code: "DIRECT_TICKET_PURCHASE_DISABLED",
        message: "La compra directa fue deshabilitada. Usa /api/payment/create-preference."
    })
})
router.get("/:id", checkAuthToken, checkRoleAuth(["user", "admin", "scanner", "organizer", "rrpp"]), schemaValidation(getTicketsSchema), getTickets)
router.put("/cancel/:id", checkAuthToken, checkRoleAuth(["user", "admin", "scanner", "organizer", "rrpp"]), schemaValidation(cancelTicketSchema), cancelTicket)

export default router
