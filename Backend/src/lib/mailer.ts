import nodemailer from 'nodemailer';
import dotenv from "dotenv";
dotenv.config();

const transporter = nodemailer.createTransport({
    host: process.env.MAIL_HOST || process.env.EMAIL_HOST,
    port: Number(process.env.MAIL_PORT || process.env.EMAIL_PORT || 465),
    secure: String(process.env.MAIL_SECURE || process.env.EMAIL_SECURE || 'true') === 'true',
    auth: {
        user: process.env.MAIL_USER || process.env.EMAIL_USER,
        pass: process.env.MAIL_PASSWORD || process.env.EMAIL_PASSWORD,
    },
});

export interface ITicketQR {
    qrCode: string;
    ticketId: string | number; // Puede ser el ID numérico o el código único
}

let mailerReady = false;
export const verifyMailer = async (): Promise<boolean> => {
    try {
        await transporter.verify();
        mailerReady = true;
        return true;
    } catch {
        mailerReady = false;
        return false;
    }
};
export const getMailerStatus = () => (mailerReady ? 'up' : 'down');

// 1. Modificamos el generador de HTML para iterar sobre los objetos tiket
const generarHtmlConQr = (tickets: ITicketQR[]): string => {

    const qrImagesHtml = tickets.map((ticket, index) => {
        return `
            <div style="margin: 20px; display: inline-block; vertical-align: top; width: 160px;">
                <p style="margin: 0 0 5px 0; font-weight: bold; color: #555;">Ticket #${ticket.ticketId}</p>
                <img src="cid:qr-${index}" alt="QR Ticket ${ticket.ticketId}" style="width: 150px; height: auto; border: 2px solid #0084f0; border-radius: 8px; padding: 5px;"/>
            </div>
        `;
    }).join('');

    return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Confirmación de Compra y Tickets</title>
        <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); overflow: hidden; }
            .header { background-color: #0084f0; color: white; padding: 20px; text-align: center; }
            .content { padding: 30px; text-align: center; color: #333333; }
            .qr-container { margin-top: 25px; text-align: center; }
            
            .footer { background-color: #f9f9f9; padding: 20px; font-size: 13px; text-align: center; color: #777777; }
        </style>
    </head>
    <body>
        <table width="100%" border="0" cellspacing="0" cellpadding="0">
            <tr>
                <td align="center">
                    <div class="container">
                        <div class="header">
                            <h1>¡Confirmación de Compra!</h1>
                        </div>
                        <div class="content">
                            <h2>¡Gracias por tu reciente adquisición!</h2>
                            <p>Nos complace informarte que tu compra ha sido procesada exitosamente.</p>
                            
                            <div class="qr-container">
                                ${qrImagesHtml}
                            </div>

                            <p style="margin-top: 30px;">Presenta estos códigos en la entrada.</p>
                        </div>
                        <div class="footer">
                            <p>&copy; ${new Date().getFullYear()} EventLife. Todos los derechos reservados.</p>
                        </div>
                    </div>
                </td>
            </tr>
        </table>
    </body>
    </html>
    `;
};

// 2. Modificamos la función de envío para asignar los CIDs y recibir objetos de tickets
export const enviarCorreoConQR = async (destinatario: string, tickets: ITicketQR[]): Promise<void> => {
    try {
        const htmlContent = generarHtmlConQr(tickets);

        // Preparamos los adjuntos con la propiedad 'cid'
        const attachments = tickets.map((ticket, index) => {
            // Limpiamos el string base64 por seguridad (quitamos "data:image/png;base64,")
            const cleanBase64 = ticket.qrCode.replace(/^data:image\/\w+;base64,/, "");

            return {
                filename: `ticket_${ticket.ticketId}.png`,
                content: cleanBase64,
                encoding: 'base64',
                cid: `qr-${index}` // Debe coincidir con el src="cid:..." del HTML
            };
        });

        const mailOptions = {
            from: process.env.MAIL_FROM || process.env.EMAIL_FROM!,
            to: destinatario,
            subject: 'Confirmación de compra - Tus Tickets',
            html: htmlContent,
            attachments: attachments
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('Correo enviado: ' + info.response);
    } catch (error) {
        console.error('Error al enviar el correo:', error);
    }
};

export default enviarCorreoConQR;
