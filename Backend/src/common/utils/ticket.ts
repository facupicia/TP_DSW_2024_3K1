import { eventInstant } from './event-time';
/**
 * Ticket utilities shared across ticket and scanner modules
 */

export function sanitizeTicketCode(code: unknown): string {
    if (typeof code !== "string") return "";
    let cleanCode = code.trim().replace(/\/+$/, "");
    if (cleanCode.includes("/") || cleanCode.includes("http")) {
        const parts = cleanCode.split("/");
        cleanCode = parts[parts.length - 1];
    }
    return cleanCode.trim();
}

export function getEventDateTime(event: { date: string | Date; time?: string | null; startDateTime?: Date | string | null; timeZone?: string }): Date {
    if (event.startDateTime) return new Date(event.startDateTime);
    return eventInstant(event.date, event.time || '00:00', event.timeZone);
}
