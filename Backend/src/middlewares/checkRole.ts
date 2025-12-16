import { Request, Response, NextFunction } from "express";
import { User } from "../user/user.entity";
import { CustomRequest as AuthRequest } from "./authToken";

export interface IPayload {
    id: string;
    iat: number;
}

export interface CustomRequest extends AuthRequest {}

export const checkRoleAuth = (roles: string | string[]) => async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({ code: "AUTH_NO_USER", message: "Authentication required" });
        }
        const userData = await User.findOneBy({ id: req.user.id });
        if (!userData) {
            return res.status(404).json({ code: "USER_NOT_FOUND", message: "User not found" });
        }
        const allowedRoles = Array.isArray(roles) ? roles : [roles];
        if (allowedRoles.includes(userData.rol)) {
            return next();
        }
        return res.status(403).json({ code: "FORBIDDEN_ROLE", message: "Insufficient role permissions" });
    } catch (error) {
        return res.status(500).json({ code: "INTERNAL_ERROR", message: "Internal Server Error" });
    }
}
