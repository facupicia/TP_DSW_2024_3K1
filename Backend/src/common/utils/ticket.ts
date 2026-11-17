import { eventInstant } from './event-time';
/**
 * Ticket utilities shared across ticket and scanner modules
 */

export function sanitizeTicketCode(code: unknown): string {
    if (typeof code !== "string") return "";
    let cleanCode = code.trim();
    if (!cleanCode || cleanCode.length > 2048) return "";
    if (/^https?:\/\//i.test(cleanCode)) {
        try { cleanCode = new URL(cleanCode).pathname; }
        catch { return ""; }
    } else if (cleanCode.includes(":")) {
        return "";
    }
    cleanCode = cleanCode.split(/[?#]/, 1)[0].replace(/\/+$/, "").split("/").pop() || "";
    // Voucher identifiers are UUIDs; reject arbitrary/oversized lookups before SQL.
    return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(cleanCode)
        ? cleanCode.toLowerCase() : "";
}

export function getEventDateTime(event: { date: string | Date; time?: string | null; startDateTime?: Date | string | null; timeZone?: string }): Date {
    if (event.startDateTime) return new Date(event.startDateTime);
    return eventInstant(event.date, event.time || '00:00', event.timeZone);
}
