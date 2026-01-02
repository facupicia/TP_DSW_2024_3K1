
import puppeteer from 'puppeteer';
import { Ticket } from '../ticket/ticket.entity';

export class TicketImageService {

    async generateTicketImage(ticket: Ticket): Promise<Buffer> {
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();

        // Viewport size
        await page.setViewport({ width: 400, height: 600, deviceScaleFactor: 2 });

        // Safely access event properties
        const eventDate = ticket.event && ticket.event.date ? new Date(ticket.event.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) : 'FECHA';
        const eventLocation = ticket.event && ticket.event.location ? ticket.event.location : 'Ubicación desconocida';
        const eventTitle = ticket.titleEvent || 'Evento';
        const qrCode = ticket.qrCode;
        // Use a placeholder if no image
        const eventImage = (ticket.event && ticket.event.image) ? ticket.event.image : 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30';

        const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <script src="https://cdn.tailwindcss.com"></script>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap" rel="stylesheet">
            <style>
                body { font-family: 'Inter', sans-serif; }
            </style>
        </head>
        <body class="bg-transparent flex justify-center items-center h-screen p-4">
            <div id="ticket-card" class="relative w-[300px] h-[500px] rounded-[30px] shadow-2xl overflow-hidden bg-gray-900 border border-white/20">
                <!-- Background Image -->
                <img src="${eventImage}" class="absolute inset-0 w-full h-full object-cover opacity-60 mix-blend-overlay">
                <div class="absolute inset-0 bg-gradient-to-br from-black/80 via-black/40 to-transparent"></div>
                
                <!-- Content -->
                <div class="absolute inset-0 p-6 flex flex-col justify-between z-30 text-white">
                    <div class="flex justify-between items-start">
                        <div class="bg-white/10 backdrop-blur-md border border-white/10 px-2 py-1 rounded-full text-[10px] font-bold tracking-widest shadow-lg">
                            EventLife
                        </div>
                    </div>

                    <div>
                        <h2 class="text-3xl font-black leading-none mb-3 text-white drop-shadow-md tracking-tight">
                            ${eventTitle}
                        </h2>

                        <div class="inline-flex items-center gap-3 px-3 py-1.5">
                            <div class="flex items-center gap-1.5 text-blue-200">
                                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                <span class="text-xs font-bold uppercase tracking-wider">${eventDate}</span>
                            </div>
                            <div class="w-px h-3 bg-white/20"></div>
                            <div class="flex items-center gap-1.5 text-gray-200 min-w-0">
                                <svg class="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                <span class="text-xs font-medium truncate max-w-[140px]">${eventLocation}</span>
                            </div>
                        </div>
                    </div>

                    <div class="space-y-4">
                        <div class="relative bg-white p-3 rounded-xl shadow-xl">
                            <img src="${qrCode}" class="w-full h-auto aspect-square object-contain mix-blend-multiply">
                        </div>
                        <p class="text-[10px] text-center text-gray-400 font-mono mt-2 tracking-widest uppercase">
                            ${ticket.codigo_unico}
                        </p>
                    </div>
                </div>
            </div>
        </body>
        </html>
        `;

        try {
            await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
            const element = await page.$('#ticket-card');
            if (!element) throw new Error("Ticket element not found");

            // Screenshot with transparent background
            const imageBuffer = await element.screenshot({ type: 'png', omitBackground: true });

            await browser.close();
            return Buffer.from(imageBuffer);
        } catch (error) {
            await browser.close();
            console.error("Error generating ticket image:", error);
            throw new Error("Failed to generate ticket image");
        }
    }
}
