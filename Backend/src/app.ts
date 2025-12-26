import express from "express";
import morgan from "morgan";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import userRoute from "./routers/user.routes"
import userEvent from "./routers/event.routes"
import userTicket from "./routers/ticket.routes"
import categoryRoute from "./routers/category.routes"
import paymentRoute from "./payment/payment.routes"
import { errorHandler } from "./middlewares/errorHandler"
import { getMailerStatus } from "./lib/mailer"
import { setupSwagger } from "./docs/swagger"
import { requestId } from "./lib/requestId"
import { metricsMiddleware, metricsHandler } from "./lib/metrics"

const app = express();

app.use(express.urlencoded({ extended: false }))
app.use(requestId)
app.use(metricsMiddleware)

// Security Middleware
app.use(helmet({ crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" } })); // Allow Google OAuth popups
const allowedOriginsRaw = (process.env.CLIENT_URLS || process.env.CLIENT_URL || "http://localhost:4200")
    .split(",")
    .map(o => o.trim().replace(/\/+$/, "").toLowerCase());
function isOriginAllowed(origin?: string) {
    if (!origin) return true;
    const o = origin.replace(/\/+$/, "").toLowerCase();
    if (allowedOriginsRaw.includes(o)) return true;
    return false;
}
app.use(cors({
    origin: (origin, cb) => cb(null, isOriginAllowed(origin) ? origin : false),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    optionsSuccessStatus: 204,
    allowedHeaders: ['Authorization', 'Content-Type', 'token', 'X-Requested-With'],
    exposedHeaders: ['x-request-id']
}));

const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res, _next, options) => {
        const reset = res.getHeader('ratelimit-reset') || res.getHeader('x-ratelimit-reset');
        res.status(options.statusCode).json({
            code: "RATE_LIMITED",
            message: "Demasiadas solicitudes desde este cliente. Intenta de nuevo más tarde.",
            retryAfter: reset ?? null
        });
    }
});
app.use(limiter);

app.use(morgan(process.env.NODE_ENV === 'production' ? "combined" : "dev"));
app.use(express.json());

// Swagger Docs
setupSwagger(app);

// Healthcheck
app.get('/health', async (_req, res) => {
    try {
        let db = 'unknown';
        try {
            if ((await import("./db")).default.isInitialized) {
                await (await import("./db")).default.query("SELECT 1");
                db = 'up';
            } else {
                db = 'down';
            }
        } catch {
            db = 'down';
        }
        const mail = getMailerStatus();
        res.status(200).json({ status: 'ok', uptime: process.uptime(), db, mail });
    } catch {
        res.status(500).json({ status: 'error' });
    }
});

// Métricas Prometheus
app.get('/metrics', metricsHandler)

app.use("/api/category", categoryRoute)
app.use("/api/user", userRoute)
app.use("/api/event", userEvent)
app.use("/api/ticket", userTicket)
app.use("/api/payment", paymentRoute)

// Global error handler (must be after routes)
app.use(errorHandler)

export default app;
