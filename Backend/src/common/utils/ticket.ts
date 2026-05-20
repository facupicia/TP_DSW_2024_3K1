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

export function getEventDateTime(event: { date: string | Date; time?: string | null }): Date {
    const date = String(event.date).split("T")[0];
    const time = event.time || "00:00";
    return new Date(`${date}T${time}`);
}
