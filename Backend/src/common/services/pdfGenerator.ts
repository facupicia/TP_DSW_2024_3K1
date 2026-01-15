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

        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => {
            const pdfData = Buffer.concat(buffers);
            resolve(pdfData.toString('base64'));
        });
        doc.on('error', (err) => reject(err));

        // Datos comunes (asumiendo que todos los tickets son del mismo evento y comprador)
        const eventTitle = tickets[0]?.eventTitle || "Evento EventLife";
        const eventDate = tickets[0]?.eventDate || "Fecha a confirmar";
        const eventLocation = tickets[0]?.eventLocation || "Ubicación a confirmar";
        const buyerName = tickets[0]?.buyerName || "Cliente";

        // --- BUCLE PRINCIPAL: UNA VUELTA = UNA PÁGINA ---
        tickets.forEach((ticket, index) => {
            
            // Si no es el primer ticket, añadimos una página nueva
            if (index > 0) {
                doc.addPage();
            }

            // ==========================================
            // 1. CABECERA (Se repite en cada página)
            // ==========================================
            
            // Logo o Nombre de la App (Pequeño arriba)
            doc.fontSize(10).fillColor('#999999').text('EventLife Tickets', 50, 40);

            // Título del Evento (Grande y destacado)
            doc.fontSize(24).font('Helvetica-Bold').fillColor('#d1410c').text(eventTitle, 50, 70);
            doc.moveDown(0.5);

            // Detalles del Evento
            doc.fontSize(12).font('Helvetica').fillColor('#333333');
            doc.text(`Fecha: ${eventDate}`);
            doc.moveDown(0.2);
            doc.text(`Ubicación: ${eventLocation}`);
            doc.moveDown(0.2);
            
            // Info del Comprador
            doc.fontSize(10).fillColor('#666666');
            doc.text(`Orden a nombre de: ${buyerName}`);
            
            doc.moveDown(2);

            // Línea separadora decorativa
            doc.strokeColor('#d1410c').lineWidth(2).moveTo(50, doc.y).lineTo(550, doc.y).stroke();
            doc.moveDown(3);

            // ==========================================
            // 2. CUERPO DEL TICKET (Diseño central)
            // ==========================================
            
            const ticketBoxY = doc.y;

            // Dibujamos un marco para el ticket
            doc.roundedRect(50, ticketBoxY, 500, 200, 8)
               .lineWidth(1)
               .strokeColor('#cccccc')
               .stroke();

            // Fondo gris claro para el encabezado del ticket
            doc.roundedRect(51, ticketBoxY + 1, 498, 40, 7)
               .fillColor('#f4f4f4')
               .fill();

            // Texto "ENTRADA GENERAL"
            doc.fillColor('#333333').fontSize(14).font('Helvetica-Bold')
               .text('ENTRADA GENERAL', 70, ticketBoxY + 15);

            // ID del Ticket
            doc.fillColor('#666666').fontSize(12).font('Helvetica')
               .text(`Ticket ID: #${ticket.ticketId}`, 350, ticketBoxY + 15, { align: 'right', width: 180 });

            // --- LADO IZQUIERDO: TEXTOS ---
            doc.fontSize(10).font('Helvetica').fillColor('#555555');
            doc.text('Válido para 1 persona', 70, ticketBoxY + 60);
            doc.text('Presenta este código QR en la entrada.', 70, ticketBoxY + 80);
            doc.text('No compartir este código con nadie.', 70, ticketBoxY + 95);
            
            // --- LADO DERECHO: CÓDIGO QR (Grande) ---
            if (ticket.qrCode) {
                try {
                    const base64Data = ticket.qrCode.replace(/^data:image\/\w+;base64,/, "");
                    const imgBuffer = Buffer.from(base64Data, 'base64');
                    
                    // Centramos el QR verticalmente dentro de la caja
                    doc.image(imgBuffer, 380, ticketBoxY + 55, { width: 130 });
                } catch (e) {
                    doc.text("Error QR", 400, ticketBoxY + 100);
                }
            }

            // ==========================================
            // 3. FOOTER (Pie de página)
            // ==========================================
            
            // Lo ponemos al final de la hoja A4 (aprox 841 pts de alto)
            doc.fontSize(8).fillColor('#aaaaaa');
            doc.text('Powered by EventLife App', 50, 780, { align: 'center', width: 500 });
            doc.text(`Página ${index + 1} de ${tickets.length}`, 50, 795, { align: 'center', width: 500 });

        });
        // --- FIN BUCLE ---

        doc.end();
    });
};
