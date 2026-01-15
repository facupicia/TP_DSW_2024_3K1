import { Router } from "express";
import { ScannerController } from "./scanner.controller";
import { checkAuthToken } from "../common/middleware/authToken";
import { checkRoleAuth } from "../common/middleware/checkRole";

const router = Router();

router.use(checkAuthToken);
router.use(checkRoleAuth(["scanner", "admin"]));

router.post("/validate", ScannerController.validateTicket);
router.get("/history", ScannerController.getHistory);

export default router;
