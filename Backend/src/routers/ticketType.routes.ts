import { Router } from "express";
import {
    createTicketType,
    getTicketTypesByEvent,
    updateTicketType,
    deactivateTicketType
} from "../ticketType/ticketType.controller";
import { checkAuthToken } from "../middlewares/authToken";
import { checkRoleAuth } from "../middlewares/checkRole";

const router = Router();

// GET /api/ticketType/event/:eventId - Obtener tipos de tickets de un evento
router.get("/event/:eventId", getTicketTypesByEvent);

// POST /api/ticketType - Crear nuevo tipo de ticket
router.post("/", checkAuthToken, checkRoleAuth(["user", "admin"]), createTicketType);

// PUT /api/ticketType/:id - Actualizar tipo de ticket
router.put("/:id", checkAuthToken, checkRoleAuth(["user", "admin"]), updateTicketType);

// DELETE /api/ticketType/:id - Desactivar tipo de ticket (soft delete)
router.delete("/:id", checkAuthToken, checkRoleAuth(["user", "admin"]), deactivateTicketType);

export default router;
