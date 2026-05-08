import QRCode from "qrcode";
import { env } from "../../config/env";

export async function generarQRUrl(codigo_unico: string): Promise<string> {
    const base = (env.CLIENT_URL || 'http://localhost:4200').replace(/\/+$/, '');
    const urlValidacion = `${base}/validate/${codigo_unico}`;
    return await QRCode.toDataURL(urlValidacion);
}

