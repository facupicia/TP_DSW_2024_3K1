import express from "express";
import morgan from "morgan";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

// Routes from modules
import userRoutes from "./user/user.routes"
import eventRoutes from "./event/event.routes"
import ticketRoutes from "./ticket/ticket.routes"
import ticketTypeRoutes from "./ticketType/ticketType.routes"
import categoryRoutes from "./category/category.routes"
import scannerRoutes from "./scanner/scanner.routes"
import paymentRoutes from "./payment/payment.routes"
import subscriptionRoutes from "./subscription/subscription.routes"
import couponRoutes from "./coupon/coupon.routes"

// Utilities
import { paymentWebhook } from "./payment/payment.controller"
import { errorHandler } from "./common/middleware/errorHandler"
import { getMailerStatus } from "./common/services/mailer"
import { requestId } from "./common/services/requestId"
import { metricsMiddleware, metricsHandler } from "./common/services/metrics"

const app = express();

app.use(express.urlencoded({ extended: false }))
app.use(requestId)
app.use(metricsMiddleware)

// Security Middleware
// Configuración crítica para Google OAuth en navegadores modernos y Safari
// Permite que la ventana emergente de Google (popup) se comunique con la ventana principal
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

/* ==================== API ROUTES ==================== */
app.use("/api/category", categoryRoutes)
app.use("/api/user", userRoutes)
app.use("/api/event", eventRoutes)
app.use("/api/ticket", ticketRoutes)
app.use("/api/ticketType", ticketTypeRoutes)
app.use("/api/scanner", scannerRoutes)
app.use("/api/payment", paymentRoutes)
app.use("/api/subscription", subscriptionRoutes)
app.use("/api/coupon", couponRoutes)

// Fallback para webhooks configurados al dominio raíz (MP envía ?topic=payment&id=...)
app.post("/", paymentWebhook)
app.get("/", paymentWebhook)

// Global error handler (must be after routes)
app.use(errorHandler)

export default app;
