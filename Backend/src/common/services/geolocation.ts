import { Request } from 'express';
import geoip from 'geoip-lite';

export const getClientIP = (req: Request): string => {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        return (typeof forwarded === 'string' ? forwarded : forwarded[0]).split(',')[0].trim();
    }
    return req.socket.remoteAddress || '127.0.0.1';
};

export const getReadableLocationFromIP = (ip: string) => {
    try {
        // geoip-lite may not resolve private/local IPs
        const lookup = geoip.lookup(ip);
        if (lookup) {
            return {
                pais: lookup.country || '',
                provincia: lookup.region || '',
                ciudad: lookup.city || ''
            };
        }
    } catch {
        // geoip-lite not available or failed
    }
    return {
        pais: '',
        provincia: '',
        ciudad: ''
    };
};
