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

export const getMailerStatus = () => (mailerReady ? "up" : "down");
// ---------------------------------------------------------------

export interface ITicketQR {
  qrCode: string;
  ticketId: string | number;
  eventTitle?: string;
  eventDate?: string;
  eventLocation?: string;
  buyerName?: string;
  ticketType?: string;
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
        name: "Entradas-EventLife.pdf",
      },
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
        email: process.env.MAIL_FROM || "no-reply@eventlife.com",
      },
      to: [{ email }],
      subject: `Tus Entradas para ${eventName} 🎟️`,
      htmlContent: htmlContent,
      attachment: attachments,
    };

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorJson;
      try {
        errorJson = JSON.parse(errorText || "{}");
      } catch {
        errorJson = { message: errorText };
      }
      console.error("❌ Error API Brevo:", errorJson);
      return null;
    }

    const data = await response.json();
    console.log("✅ Correo con PDF enviado. ID:", (data as any)?.messageId);
    return data;
  } catch (error) {
    console.error("Error enviando correo:", error);
    return null;
  }
};

/**
 * Envía email de notificación cuando un usuario es agregado como promotor
 */
export const sendPromoterInvitationEmail = async (
  email: string,
  promoterName: string,
  organizerName: string,
  promoterCode: string,
  commissionPercentage: number,
) => {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.error("FALTA BREVO_API_KEY");
    return null;
  }

  try {
    const htmlContent = `
            <html>
                <body style="font-family: Arial, sans-serif; text-align: center; color: #333;">
                    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                        <h1 style="color: #4f46e5;">¡Has sido invitado como Promotor!</h1>
                        <p>Hola ${promoterName},</p>
                        <p><strong>${organizerName}</strong> te ha agregado como promotor (RRPP) en EventLife.</p>
                        
                        <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                            <p style="margin: 0; font-size: 14px; color: #666;">Tu código de promotor:</p>
                            <p style="margin: 10px 0; font-size: 24px; font-weight: bold; color: #4f46e5; letter-spacing: 2px;">${promoterCode}</p>
                            <p style="margin: 0; font-size: 14px; color: #666;">Comisión: <strong>${commissionPercentage}%</strong> por cada venta</p>
                        </div>
                        
                        <p>Comparte tu código con tus contactos y empieza a ganar comisiones por cada ticket vendido.</p>
                        
                        <a href="${process.env.CLIENT_URL || "https://event-life.netlify.app"}/promoter/dashboard" 
                           style="display: inline-block; background: #4f46e5; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0;">
                            Ver Mi Panel
                        </a>
                        
                        <hr style="margin: 30px 0; border: 0; border-top: 1px solid #eee;" />
                        <p style="font-size: 12px; color: #999; margin-top: 40px;">EventLife - Sistema de Gestión de Eventos</p>
                    </div>
                </body>
            </html>
        `;

    const body = {
      sender: {
        name: "Event Life",
        email: process.env.MAIL_FROM || "no-reply@eventlife.com",
      },
      to: [{ email }],
      subject: `¡Has sido invitado como Promotor por ${organizerName}! 🎉`,
      htmlContent: htmlContent,
    };

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const errorJson = JSON.parse(errorText || "{}");

      // Detectar error de IP no autorizada
      if (
        errorJson.code === "unauthorized" &&
        errorJson.message?.includes("unrecognised IP")
      ) {
        console.error("❌ ERROR BREVO: IP no autorizada");
        console.error("👉 Para solucionarlo:");
        console.error(
          "   1. Ve a https://app.brevo.com/security/authorised_ips",
        );
        console.error("   2. Agrega la IP del servidor a la lista blanca");
        console.error("   O desactiva la restricción de IP si no la necesitas");
        console.error(
          "📍 IP detectada:",
          errorJson.message.match(/\d+\.\d+\.\d+\.\d+/)?.[0] || "desconocida",
        );
      } else {
        console.error("Error API Brevo:", errorText);
      }
      return { error: errorJson, success: false };
    }

    const data = await response.json();
    console.log(
      "✅ Correo de invitación enviado. ID:",
      (data as any)?.messageId,
    );
    return { data, success: true };
  } catch (error) {
    console.error("ERROR al enviar email:", error);
    return null;
  }
};

export default enviarCorreoConQR;
