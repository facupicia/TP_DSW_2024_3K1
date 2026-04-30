/**
 * Ticket Type Routes
 * Endpoints for managing ticket types within events
 */
import { Router } from "express";
import { createTicketType, getTicketTypesByEvent, updateTicketType, deactivateTicketType } from "./ticketType.controller";
import { checkAuthToken } from "../common/middleware/authToken";
import { checkRoleAuth } from "../common/middleware/checkRole";

const router = Router();

// GET /api/ticketType/event/:eventId - Obtener tipos de tickets de un evento
router.get("/event/:eventId", getTicketTypesByEvent);

// POST /api/ticketType - Crear nuevo tipo de ticket
router.post("/", checkAuthToken, checkRoleAuth(["organizer", "admin"]), createTicketType);

// PUT /api/ticketType/:id - Actualizar tipo de ticket
router.put("/:id", checkAuthToken, checkRoleAuth(["organizer", "admin"]), updateTicketType);

// DELETE /api/ticketType/:id - Desactivar tipo de ticket (soft delete)
router.delete("/:id", checkAuthToken, checkRoleAuth(["organizer", "admin"]), deactivateTicketType);

export default router;
