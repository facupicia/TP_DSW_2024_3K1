import { Router } from "express";
import { logger } from "../common/services/logger";
import { ScannerController } from "./scanner.controller";
import { checkAuthToken, CustomRequest } from "../common/middleware/authToken";
import { checkExactRole } from "../common/middleware/checkRole";
import { schemaValidation } from "../common/middleware/schemaValidacion";
import { assignScannerSchema, removeScannerSchema } from "../schemas/schema.scanner";
import { NextFunction, Response } from "express";
import { User } from "../user/user.entity";
import { getRoleNames } from "../user/role.entity";

const router = Router();
const SCANNER_ACCESS_ROLES = ["scanner", "admin", "organizer"];

const checkScannerAccess = async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
        const tokenRoles = req.user?.roles || [];
        const roles = Array.isArray(tokenRoles) ? tokenRoles : String(tokenRoles).split(",");
        if (roles.some(role => SCANNER_ACCESS_ROLES.includes(role))) {
            return next();
        }

        const user = await User.findOne({ where: { id: req.user?.id }, relations: ["roles"] });
        const freshRoles = user ? getRoleNames(user) : [];
        if (freshRoles.some(role => SCANNER_ACCESS_ROLES.includes(role))) {
            req.user!.roles = freshRoles;
            return next();
        }

        return res.status(403).json({
            code: "FORBIDDEN_ROLE",
            message: "Role not assigned",
            required: SCANNER_ACCESS_ROLES,
            current: roles
        });
    } catch (error) {
        logger.error("Scanner role check error:", error);
        return res.status(500).json({ code: "INTERNAL_ERROR", message: "Internal Server Error" });
    }
};

router.use(checkAuthToken);
router.use(checkScannerAccess);

router.post("/validate", ScannerController.validateTicket);
router.get("/history", ScannerController.getHistory);
router.get(
    "/team",
    checkExactRole(["organizer", "admin"]),
    ScannerController.getOrganizerScanners
);
router.post(
    "/team",
    checkExactRole(["organizer", "admin"]),
    schemaValidation(assignScannerSchema),
    ScannerController.assignScannerToOrganizer
);
router.delete(
    "/team/:assignmentId",
    checkExactRole(["organizer", "admin"]),
    schemaValidation(removeScannerSchema),
    ScannerController.removeScannerFromOrganizer
);

export default router;
