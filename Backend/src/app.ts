import express from "express";
import morgan from "morgan";
import cors from "cors";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./config/swagger";
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
import promoterRoutes from "./promoter/promoter.routes"
import { adminRouter } from "./admin/admin.controller"

// Utilities
import { errorHandler } from "./common/middleware/errorHandler"
import { getMailerStatus } from "./common/services/mailer"
import { requestId } from "./common/services/requestId"
import { metricsMiddleware, metricsHandler } from "./common/services/metrics"
import { checkAuthToken } from "./common/middleware/authToken"
import { checkRoleAuth } from "./common/middleware/checkRole"
import { globalRateLimiter } from "./common/middleware/rateLimit"
import AppDataSource from "./db";
import { getRedis } from "./common/services/redis";
import { env } from "./config/env";

const app = express();

// Body parsing FIRST so invalid/large payloads are rejected before rate limiting/logging
app.use(express.urlencoded({ extended: false, limit: "100kb" }));
app.use(express.json({ limit: "1mb" }));

app.use(requestId)
app.use(metricsMiddleware)

// Security Middleware
app.use(helmet({
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'none'"],
            frameAncestors: ["'none'"],
        }
    },
}));

const allowedOriginsRaw = (env.CLIENT_URLS || env.CLIENT_URL || "")
    .split(",")
    .map(o => o.trim().replace(/\/+$/, "").toLowerCase())
    .filter(Boolean);

if (env.NODE_ENV === "production" && allowedOriginsRaw.length === 0) {
    throw new Error("CLIENT_URLS or CLIENT_URL must be set in production");
}

function isOriginAllowed(origin?: string) {
    if (!origin) return false;
    const o = origin.replace(/\/+$/, "").toLowerCase();
    return allowedOriginsRaw.includes(o);
}

app.use(cors({
    origin: (origin, cb) => cb(null, isOriginAllowed(origin) ? origin : false),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    optionsSuccessStatus: 204,
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Requested-With', 'X-Refresh-Token'],
    exposedHeaders: ['x-request-id']
}));

app.use(globalRateLimiter);

app.use(morgan(env.NODE_ENV === 'production' ? "combined" : "dev"));

// Healthcheck - minimal info to avoid information disclosure
app.get('/health', async (_req, res) => {
    try {
        let healthy = false;
        try {
            if (AppDataSource.isInitialized) {
                await AppDataSource.query("SELECT 1");
                healthy = true;
            }
        } catch {
            healthy = false;
        }
        res.status(healthy ? 200 : 503).json({ status: healthy ? 'ok' : 'error' });
    } catch {
        res.status(503).json({ status: 'error' });
    }
});

// Métricas Prometheus
const metricsMiddlewares = env.METRICS_PUBLIC === "true"
    ? []
    : [checkAuthToken, checkRoleAuth(["admin"])];
app.get('/metrics', ...metricsMiddlewares, metricsHandler)

// Swagger UI - disabled in production
if (env.NODE_ENV !== "production") {
    app.use('/api-docs', checkAuthToken, checkRoleAuth(["admin"]), swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
        explorer: true,
        customCss: '.swagger-ui .topbar { display: none }',
        customSiteTitle: 'EventLife API Docs'
    }));
}

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
app.use("/api/promoter", promoterRoutes)
app.use("/api/admin", adminRouter)

// Global error handler (must be after routes)
app.use(errorHandler)

export default app;
