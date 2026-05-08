import { Response } from "express";
import { CustomRequest } from "../common/middleware/authToken";
import { ImageUploadKind, uploadImageBuffer } from "./upload.service";

const validKinds = new Set<ImageUploadKind>(["event", "profile"]);

export async function uploadImage(req: CustomRequest, res: Response) {
    try {
        const kind = req.body?.kind as ImageUploadKind;

        if (!validKinds.has(kind)) {
            return res.status(400).json({
                code: "INVALID_UPLOAD_KIND",
                message: "kind must be event or profile",
            });
        }

        if (!req.file) {
            return res.status(400).json({
                code: "IMAGE_FILE_REQUIRED",
                message: "Image file is required",
            });
        }

        const uploaded = await uploadImageBuffer(req.file.buffer, kind);
        return res.status(201).json(uploaded);
    } catch (error: any) {
        const status = error?.status || 500;
        const code = error?.code || "IMAGE_UPLOAD_FAILED";

        return res.status(status).json({
            code,
            message: status >= 500 ? "Error al subir la imagen" : error.message,
        });
    }
}
