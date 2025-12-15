import QRCode from "qrcode";

export async function generarQRUrl(codigo_unico: string): Promise<string> {
    const base = (process.env.CLIENT_URL || 'http://localhost:4200').replace(/\/+$/, '');
    const urlValidacion = `${base}/validate/${codigo_unico}`;
    return await QRCode.toDataURL(urlValidacion);
}

