import { Request } from 'express';

export const getClientIP = (req: Request): string => {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        return (typeof forwarded === 'string' ? forwarded : forwarded[0]).split(',')[0].trim();
    }
    return req.socket.remoteAddress || '127.0.0.1';
};

export const getReadableLocationFromIP = (ip: string) => {
    // Placeholder implementation
    // TODO: Integrate with a real GeoIP service (e.g., maxmind, ipapi)
    return {
        pais: '',
        provincia: '',
        ciudad: ''
    };
};
