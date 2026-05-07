import { generateTicketsPDF } from "./pdfGenerator";
import { logger } from "./logger";
import { env } from "../../config/env";

function escapeHtml(unsafe: string): string {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// --- FUNCIONES DE ESTADO ---
let mailerReady = false;

export const verifyMailer = async (): Promise<boolean> => {
  const ok = !!env.BREVO_API_KEY;
  mailerReady = ok;
  return ok;
};

export const getMailerStatus = () => (mailerReady ? "up" : "down");
// -------------------------------

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
  const apiKey = env.BREVO_API_KEY;
  if (!apiKey) {
    logger.error("MAILER_MISSING_BREVO_KEY");
    return null;
  }

  try {
    logger.info("MAILER_GENERATING_PDF");

    const pdfBase64 = await generateTicketsPDF(tickets);

    const attachments = [
      {
        content: pdfBase64,
        name: "Entradas-EventLife.pdf",
      },
    ];

    const eventName = tickets[0]?.eventTitle || "Evento";
    const escapedEventName = escapeHtml(eventName);

    const htmlContent = `
            <html>
                <body style="font-family: Arial, sans-serif; text-align: center; color: #333;">
                    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                        <h1 style="color: #0084f0;">¡Tu compra está confirmada!</h1>
                        <p>Hola,</p>
                        <p>Adjunto encontrarás un archivo PDF con tus <strong>${tickets.length}</strong> entradas para <strong>${escapedEventName}</strong>.</p>
                        <hr style="margin: 30px 0; border: 0; border-top: 1px solid #eee;" />
                        <p style="font-size: 14px; color: #555;">
                            Descarga el archivo adjunto y preséntalo en la entrada desde tu celular.
                        </p>
                        <p style="font-size: 12px; color: #999; margin-top: 40px;">EventLife App</p>
                    </div>
                </body>
            </html>
        `;

    const body = {
      sender: {
        name: "Event Life",
        email: env.MAIL_FROM || "no-reply@eventlife.com",
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
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorJson: any;
      try {
        errorJson = JSON.parse(errorText || "{}");
      } catch {
        errorJson = { message: errorText };
      }
      logger.error("MAILER_BREVO_ERROR", { error: errorJson });
      return null;
    }

    const data = await response.json();
    logger.info("MAILER_SENT", { messageId: (data as any)?.messageId });
    return data;
  } catch (error) {
    logger.error("MAILER_SEND_ERROR", { error: (error as Error).message });
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
  const apiKey = env.BREVO_API_KEY;
  if (!apiKey) {
    logger.error("MAILER_MISSING_BREVO_KEY");
    return null;
  }

  try {
    const safePromoterName = escapeHtml(promoterName);
    const safeOrganizerName = escapeHtml(organizerName);
    const safePromoterCode = escapeHtml(promoterCode);
    const safeCommission = Number(commissionPercentage).toFixed(2);

    const htmlContent = `
            <html>
                <body style="font-family: Arial, sans-serif; text-align: center; color: #333;">
                    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                        <h1 style="color: #4f46e5;">¡Has sido invitado como Promotor!</h1>
                        <p>Hola ${safePromoterName},</p>
                        <p><strong>${safeOrganizerName}</strong> te ha agregado como promotor (RRPP) en EventLife.</p>
                        
                        <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                            <p style="margin: 0; font-size: 14px; color: #666;">Tu código de promotor:</p>
                            <p style="margin: 10px 0; font-size: 24px; font-weight: bold; color: #4f46e5; letter-spacing: 2px;">${safePromoterCode}</p>
                            <p style="margin: 0; font-size: 14px; color: #666;">Comisión: <strong>${safeCommission}%</strong> por cada venta</p>
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
        email: env.MAIL_FROM || "no-reply@eventlife.com",
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
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorJson: any;
      try { errorJson = JSON.parse(errorText || "{}"); } catch { errorJson = { message: errorText }; }

      if (
        errorJson.code === "unauthorized" &&
        errorJson.message?.includes("unrecognised IP")
      ) {
        logger.error("MAILER_BREVO_UNAUTHORIZED_IP", {
          ip: errorJson.message.match(/\d+\.\d+\.\d+\.\d+/)?.[0] || "desconocida"
        });
      } else {
        logger.error("MAILER_BREVO_ERROR", { error: errorJson });
      }
      return { error: errorJson, success: false };
    }

    const data = await response.json();
    logger.info("MAILER_INVITATION_SENT", { messageId: (data as any)?.messageId });
    return { data, success: true };
  } catch (error) {
    logger.error("MAILER_INVITATION_ERROR", { error: (error as Error).message });
    return null;
  }
};

export const sendAccountClaimEmail = async (
  email: string,
  buyerName: string,
  claimUrl: string,
) => {
  const apiKey = env.BREVO_API_KEY;
  if (!apiKey) {
    logger.error("MAILER_MISSING_BREVO_KEY");
    return null;
  }

  try {
    const safeName = escapeHtml(buyerName || "comprador");
    // claimUrl should be validated by the caller; we still encode it for href safety
    const safeClaimUrl = claimUrl.replace(/"/g, '&quot;');
    const htmlContent = `
            <html>
                <body style="font-family: Arial, sans-serif; text-align: center; color: #333;">
                    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                        <h1 style="color: #0084f0;">Accede a tus entradas cuando quieras</h1>
                        <p>Hola ${safeName},</p>
                        <p>Creaste una compra como invitado en EventLife. Puedes reclamar tu cuenta para ver tus tickets y próximas compras desde tu perfil.</p>
                        <a href="${safeClaimUrl}"
                           style="display: inline-block; background: #111827; color: white; padding: 14px 28px; text-decoration: none; border-radius: 10px; margin: 20px 0; font-weight: bold;">
                            Reclamar mi cuenta
                        </a>
                        <p style="font-size: 13px; color: #666;">Este enlace vence por seguridad. Si no fuiste tú, puedes ignorar este correo.</p>
                        <hr style="margin: 30px 0; border: 0; border-top: 1px solid #eee;" />
                        <p style="font-size: 12px; color: #999; margin-top: 40px;">EventLife App</p>
                    </div>
                </body>
            </html>
        `;

    const body = {
      sender: {
        name: "Event Life",
        email: env.MAIL_FROM || "no-reply@eventlife.com",
      },
      to: [{ email }],
      subject: "Reclama tu cuenta de EventLife",
      htmlContent,
    };

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error("MAILER_CLAIM_ERROR", { error: errorText });
      return null;
    }

    const data = await response.json();
    logger.info("MAILER_CLAIM_SENT", { messageId: (data as any)?.messageId });
    return data;
  } catch (error) {
    logger.error("MAILER_CLAIM_ERROR", { error: (error as Error).message });
    return null;
  }
};

export default enviarCorreoConQR;
