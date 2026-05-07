import { Request, Response, NextFunction } from "express";

type Stat = { count: number; totalMs: number };
const stats = new Map<string, Stat>();
const MAX_ROUTES = 200;

function normalizeKey(req: Request): string {
    const route = req.route?.path;
    if (route) return `${req.method} ${route}`;
    // For unmatched routes, bucket by status code to avoid unbounded growth
    return `${req.method} __unknown__`;
}

export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
    const start = Date.now();
    res.on("finish", () => {
        const key = normalizeKey(req);
        if (stats.size >= MAX_ROUTES && !stats.has(key)) {
            // Avoid unbounded growth; skip new unknown routes when at limit
            return;
        }
        const s = stats.get(key) || { count: 0, totalMs: 0 };
        s.count += 1;
        s.totalMs += Date.now() - start;
        stats.set(key, s);
    });
    next();
}

export function metricsHandler(_req: Request, res: Response) {
    let out = "";
    out += "# HELP http_requests_total Total HTTP requests\n";
    out += "# TYPE http_requests_total counter\n";
    for (const [k, v] of stats.entries()) {
        out += `http_requests_total{route="${k}"} ${v.count}\n`;
    }
    out += "# HELP http_request_duration_ms Total duration sum per route\n";
    out += "# TYPE http_request_duration_ms gauge\n";
    for (const [k, v] of stats.entries()) {
        out += `http_request_duration_ms{route="${k}"} ${v.totalMs}\n`;
    }
    res.setHeader("Content-Type", "text/plain; version=0.0.4");
    res.send(out);
}
