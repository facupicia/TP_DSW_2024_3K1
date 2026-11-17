import { DateTime, IANAZone } from 'luxon';
export const DEFAULT_EVENT_ZONE = 'America/Argentina/Buenos_Aires';
export function eventInstant(date: string | Date, time: string = '00:00', zone: string = DEFAULT_EVENT_ZONE): Date {
    const day = date instanceof Date ? date.toISOString().slice(0,10) : String(date).slice(0,10);
    if (!IANAZone.isValidZone(zone)) throw new Error('INVALID_TIME_ZONE');
    const instant = DateTime.fromISO(`${day}T${time}`, { zone });
    if (!instant.isValid) throw new Error('INVALID_EVENT_DATETIME');
    return instant.toJSDate();
}
