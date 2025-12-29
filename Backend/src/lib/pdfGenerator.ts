// src/lib/pdfGenerator.ts
import PDFDocument from 'pdfkit';

interface TicketData {
    qrCode: string; // Base64
    ticketId: string | number;
    eventTitle?: string;
    eventDate?: string;
    eventLocation?: string;
    buyerName?: string;
}

export const generateTicketsPDF = async (tickets: TicketData[]): Promise<string> => {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const buffers: Buffer[] = [];

        // Capturamos los datos del PDF en memoria
        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => {
            const pdfData = Buffer.concat(buffers);
            // Brevo necesita el PDF en string Base64
            resolve(pdfData.toString('base64'));
        });
        doc.on('error', (err) => reject(err));

        // --- DISEÑO DEL PDF ---

        const eventTitle = tickets[0]?.eventTitle || "Evento";
        const eventDate = tickets[0]?.eventDate || "";
        const eventLocation = tickets[0]?.eventLocation || "";
        const buyerName = tickets[0]?.buyerName || "";

        // 1. Cabecera (Logo o Título Grande)
        doc.fontSize(20).font('Helvetica-Bold').fillColor('#d1410c').text(eventTitle, { align: 'left' });
        doc.moveDown(0.5);

        // 2. Info del Evento
        doc.fontSize(12).font('Helvetica').fillColor('#333333');
        doc.text(`Fecha: ${eventDate}`);
        doc.text(`Lugar: ${eventLocation}`);
        doc.moveDown(0.5);
        
        // 3. Info del Comprador
        doc.fontSize(10).fillColor('#666666');
        doc.text(`Orden a nombre de: ${buyerName}`);
        doc.moveDown(2);

        // Línea separadora
        doc.strokeColor('#cccccc').lineWidth(1).moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown(2);

        // 4. Loop de Tickets (Dibujamos cada ticket)
        tickets.forEach((ticket, index) => {
            // Evitar que un ticket se corte entre páginas
            if (doc.y > 700) doc.addPage();

            const startY = doc.y;

            // Caja del ticket
            doc.roundedRect(50, startY, 500, 150, 5).strokeColor('#eeeeee').stroke();

            // Texto lateral (Ticket #)
            doc.fontSize(14).font('Helvetica-Bold').fillColor('#333333');
            doc.text(`Entrada General`, 70, startY + 20);
            
            doc.fontSize(10).font('Helvetica').fillColor('#666666');
            doc.text(`Ticket ID: #${ticket.ticketId}`, 70, startY + 45);
            doc.text(`Válido para una persona`, 70, startY + 60);

            // Imagen QR
            if (ticket.qrCode) {
                try {
                    // Limpiamos el base64 para pdfkit
                    const base64Data = ticket.qrCode.replace(/^data:image\/\w+;base64,/, "");
                    const imgBuffer = Buffer.from(base64Data, 'base64');
                    
                    // Dibujamos el QR a la derecha
                    doc.image(imgBuffer, 400, startY + 15, { width: 120 });
                } catch (e) {
                    doc.text("Error al generar QR", 400, startY + 50);
                }
            }

            // Movemos el cursor para el siguiente ticket
            doc.y = startY + 170; 
        });

        // Footer
        doc.fontSize(8).fillColor('#999999').text('Generado por EventLife', 50, 800, { align: 'center' });

        doc.end();
    });
};