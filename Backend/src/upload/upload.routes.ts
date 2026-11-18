import { Router, NextFunction, Request, Response } from "express";
import multer from "multer";
import rateLimit from 'express-rate-limit';
import { checkAuthToken, CustomRequest } from "../common/middleware/authToken";
import { checkRoleAuth } from "../common/middleware/checkRole";
import { uploadImage } from "./upload.controller";
import { createRedisStore } from '../common/middleware/rateLimit';

const allowedMimeTypes = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
]);

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 8 * 1024 * 1024,
        files: 1,
        fields: 1,
        fieldSize: 32,
        parts: 2,
    },
    fileFilter: (_req, file, cb) => {
        if (!allowedMimeTypes.has(file.mimetype)) {
            cb(new Error("Formato de imagen no permitido"));
            return;
        }

        cb(null, true);
    },
});

function handleImageFile(req: Request, res: Response, next: NextFunction) {
    upload.single("image")(req, res, (error: any) => {
        if (!error) {
            next();
            return;
        }

        if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
            return res.status(413).json({
                code: "IMAGE_TOO_LARGE",
                message: "La imagen no puede superar 8MB",
            });
        }

        return res.status(400).json({
            code: "INVALID_IMAGE_FILE",
            message: error.message || "Imagen inválida",
        });
    });
}

const router = Router();
const uploadRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 10,
    store: createRedisStore('rl:image-upload:'),
    keyGenerator: (req: CustomRequest) => String(req.user.id),
    standardHeaders: true,
    legacyHeaders: false,
    message: { code: 'UPLOAD_RATE_LIMITED', message: 'Demasiadas imágenes. Intenta de nuevo en un minuto.' }
});

router.post(
    "/image",
    checkAuthToken,
    checkRoleAuth(["user", "organizer", "admin", "scanner", "rrpp"]),
    uploadRateLimiter,
    handleImageFile,
    uploadImage,
);

export default router;
