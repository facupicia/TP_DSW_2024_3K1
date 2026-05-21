/**
 * Extra (EventProduct) Routes
 * Endpoints for managing extras activated in events
 */
import { Router } from "express";
import {
    getEventExtras,
    addExtraToEvent,
    updateEventExtra,
    removeExtraFromEvent
} from "./extra.controller";
import { checkAuthToken } from "../common/middleware/authToken";
import { checkRoleAuth } from "../common/middleware/checkRole";

const router = Router();

// GET /api/extra/event/:eventId - Listar extras activos de un evento (público)
router.get("/event/:eventId", getEventExtras);

// POST /api/extra/event/:eventId - Activar un producto del catálogo en el evento
router.post("/event/:eventId", checkAuthToken, checkRoleAuth(["organizer", "admin"]), addExtraToEvent);

// PUT /api/extra/:extraId - Actualizar configuración del extra en el evento
router.put("/:extraId", checkAuthToken, checkRoleAuth(["organizer", "admin"]), updateEventExtra);

// DELETE /api/extra/:extraId - Desactivar extra del evento
router.delete("/:extraId", checkAuthToken, checkRoleAuth(["organizer", "admin"]), removeExtraFromEvent);

export default router;
