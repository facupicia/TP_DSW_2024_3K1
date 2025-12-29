import dotenv from "dotenv";
import { generateTicketsPDF } from "./pdfGenerator"; 

dotenv.config();

// --- FUNCIONES DE ESTADO (Restauradas para arreglar index.ts) ---
let mailerReady = false;

export const verifyMailer = async (): Promise<boolean> => {
    // Verificamos si existe la API Key de Brevo
    const ok = !!process.env.BREVO_API_KEY;
    mailerReady = ok;
    return ok;
};

export const getMailerStatus = () => (mailerReady ? 'up' : 'down');
// ---------------------------------------------------------------

export interface ITicketQR {
    qrCode: string;
    ticketId: string | number;
    eventTitle?: string;
    eventDate?: string;
    eventLocation?: string;
    buyerName?: string;
}

const enviarCorreoConQR = async (email: string, tickets: ITicketQR[]) => {
    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) {
        console.error("FALTA BREVO_API_KEY");
        return null;
    }

    try {
        console.log("📄 Generando PDF de tickets...");
        
        // 1. Generamos el PDF en Base64 usando tu nuevo generador
        const pdfBase64 = await generateTicketsPDF(tickets);

        // 2. Preparamos el adjunto para Brevo
        const attachments = [
            {
                content: pdfBase64,
                name: "Mis_Entradas_EventLife.pdf"
            }
        ];
        
        const eventName = tickets[0]?.eventTitle || "Evento";
        
        // 3. HTML simple del correo
        const htmlContent = `
            <html>
                <body style="font-family: Arial, sans-serif; text-align: center; color: #333;">
                    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                        <h1 style="color: #0084f0;">¡Tu compra está confirmada!</h1>
                        <p>Hola,</p>
                        <p>Adjunto encontrarás un archivo PDF con tus <strong>${tickets.length}</strong> entradas para <strong>${eventName}</strong>.</p>
                        <hr style="margin: 30px 0; border: 0; border-top: 1px solid #eee;" />
                        <p style="font-size: 14px; color: #555;">
                            Descarga el archivo adjunto y preséntalo en la entrada desde tu celular.
                        </p>
                        <p style="font-size: 12px; color: #999; margin-top: 40px;">EventLife App</p>
                    </div>
                </body>
            </html>
        `;

        // 4. Enviar a Brevo
        const body = {
            sender: {
                name: "Event Life",
                email: process.env.MAIL_FROM || "no-reply@eventlife.com"
            },
            to: [{ email }],
            subject: `Tus Entradas para ${eventName} 🎟️`,
            htmlContent: htmlContent,
            attachment: attachments
        };
        
        const response = await fetch("https://api.brevo.com/v3/smtp/email", {
            method: "POST",
            headers: {
                "accept": "application/json",
                "api-key": apiKey,
                "content-type": "application/json"
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Error API Brevo:", errorText);
            return null;
        }
        
        const data = await response.json();
        console.log("✅ Correo con PDF enviado. ID:", (data as any)?.messageId);
        return data;

    } catch (error) {
        console.error("ERROR al enviar email:", error);
        return null;
    }
};

export default enviarCorreoConQR;