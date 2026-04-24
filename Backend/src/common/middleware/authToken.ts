import { verifyToken } from "../services/generateToken";
import { Request, Response, NextFunction } from "express";

export interface IPayload {
    id: number;
    roles?: string[];
    iat: number;
}

// Extender la interfaz Request para incluir la propiedad id
export interface CustomRequest extends Request {
    id?: number;
    user?: IPayload
}

export const checkAuthToken = async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
        const tokenHeader = req.header("Authorization");
        let token: any;

        if (tokenHeader && tokenHeader.startsWith("Bearer ")) {
            token = tokenHeader.split(" ")[1];
        } else {
            token = req.header("token");
        }

        if (!token) {
            console.warn('[AUTH] No token in request. Headers:', JSON.stringify(req.headers));
            return res.status(401).json({ code: 'AUTH_NO_TOKEN', message: 'No token provided' });
        }

        const tokenData = await verifyToken(token) as IPayload;

        if (!tokenData || !tokenData.id) {
            return res.status(401).json({ code: 'AUTH_INVALID_TOKEN', message: 'Invalid token data' });
        }

        // Ensure roles is always an array
        if (tokenData.roles && typeof tokenData.roles === 'string') {
            tokenData.roles = (tokenData.roles as any).split(',');
        }
        req.user = tokenData;
        next();

    } catch (error) {
        console.error('AUTH_MIDDLEWARE_ERROR', { error });
        return res.status(401).json({ code: 'AUTH_VALIDATION_ERROR', message: 'Invalid or expired token' });
    }
};

export const optionalAuthToken = async (req: CustomRequest, res: Response, next: NextFunction) => {
    try {
        const tokenHeader = req.header("Authorization");
        let token: any;

        if (tokenHeader && tokenHeader.startsWith("Bearer ")) {
            token = tokenHeader.split(" ")[1];
        } else {
            token = req.header("token");
        }

        if (!token) {
            return next();
        }

        const tokenData = await verifyToken(token) as IPayload;

        if (!tokenData || !tokenData.id) {
            return res.status(401).json({ code: 'AUTH_INVALID_TOKEN', message: 'Invalid token data' });
        }

        if (tokenData.roles && typeof tokenData.roles === 'string') {
            tokenData.roles = (tokenData.roles as any).split(',');
        }

        req.user = tokenData;
        return next();
    } catch (error) {
        console.error('OPTIONAL_AUTH_MIDDLEWARE_ERROR', { error });
        return res.status(401).json({ code: 'AUTH_VALIDATION_ERROR', message: 'Invalid or expired token' });
    }
};
