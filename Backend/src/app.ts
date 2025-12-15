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

const app = express();

app.use(express.urlencoded({ extended: false }))

// Security Middleware
app.use(helmet()); // Set secure HTTP headers
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
    origin: [
        'http://localhost:4200',                   // Para seguir desarrollando en tu PC
        'https://event-life.netlify.app',          // <-- ¡TU NUEVO FRONTEND!
        'https://www.event-life.netlify.app'       // Por si alguien entra con www
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    optionsSuccessStatus: 204
}));

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: "Too many requests from this IP, please try again later"
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

app.use("/api/category", categoryRoute)
app.use("/api/user", userRoute)
app.use("/api/event", userEvent)
app.use("/api/ticket", userTicket)
app.use("/api/payment", paymentRoute)

// Global error handler (must be after routes)
app.use(errorHandler)

export default app;
