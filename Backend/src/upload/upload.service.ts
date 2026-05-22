import { v2 as cloudinary, UploadApiResponse } from "cloudinary";
import { env } from "../config/env";

export type ImageUploadKind = "event" | "profile" | "product";

const folders: Record<ImageUploadKind, string> = {
    event: "eventlife/events",
    profile: "eventlife/profiles",
    product: "eventlife/products",
};

export interface UploadedImage {
    url: string;
    publicId: string;
}

export function assertCloudinaryConfigured() {
    if (!env.CLOUDINARY_URL) {
        const error = new Error("Cloudinary is not configured");
        (error as any).status = 503;
        (error as any).code = "CLOUDINARY_NOT_CONFIGURED";
        throw error;
    }

    cloudinary.config({ secure: true });
}

export function uploadImageBuffer(buffer: Buffer, kind: ImageUploadKind): Promise<UploadedImage> {
    assertCloudinaryConfigured();

    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder: folders[kind],
                resource_type: "image",
                unique_filename: true,
                overwrite: false,
            },
            (error, result?: UploadApiResponse) => {
                if (error || !result) {
                    reject(error || new Error("Cloudinary upload failed"));
                    return;
                }

                resolve({
                    url: result.secure_url,
                    publicId: result.public_id,
                });
            },
        );

        uploadStream.end(buffer);
    });
}
