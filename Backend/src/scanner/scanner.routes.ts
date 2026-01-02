import { Router } from "express";
import { ScannerController } from "./scanner.controller";
import { checkAuthToken } from "../middlewares/authToken";
import { checkRoleAuth } from "../middlewares/checkRole";

const router = Router();

router.use(checkAuthToken);
router.use(checkRoleAuth(["scanner", "admin"]));

router.post("/validate", ScannerController.validateTicket);
router.get("/history", ScannerController.getHistory);

export default router;
