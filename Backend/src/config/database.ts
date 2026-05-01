/**
 * Database Configuration
 * Centralized TypeORM DataSource configuration
 */
import { DataSource } from "typeorm"
import { User } from "../user/user.entity"
import { Event } from "../event/event.entity"
import { Ticket } from "../ticket/ticket.entity"
import { TicketType } from "../ticketType/ticketType.entity"
import { Category } from "../category/category.entity"
import { PaymentLog } from "../payment/payment.entity"
import { RoleAudit } from "../user/roleAudit.entity"
import { Role } from "../user/role.entity"
import { RefreshToken } from "../user/refreshToken.entity"
import { AccountClaimToken } from "../user/accountClaimToken.entity"
import { SubscriptionPlan } from "../subscription/subscription_plan.entity"
import { UserSubscription } from "../subscription/user_subscription.entity"
import dotenv from "dotenv";
import { Coupon } from "../coupon/coupon.entity"
import { PromoterGroup, PromoterEventAssignment } from "../promoter/promoter.entity"
import { ScannerOrganizerAssignment } from "../scanner/scanner-organizer-assignment.entity"

dotenv.config();

const connectionUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;

const AppDataSource = new DataSource({
    type: "postgres",
    url: connectionUrl,
    host: !connectionUrl ? process.env.PGHOST : undefined,
    port: !connectionUrl && process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
    username: !connectionUrl ? process.env.PGUSER : undefined,
    password: !connectionUrl ? process.env.PGPASSWORD : undefined,
    database: !connectionUrl ? process.env.PGDATABASE : undefined,
    synchronize: process.env.NODE_ENV !== 'production' && process.env.DB_SYNC === 'true',
    logging: process.env.DB_LOGGING === 'true',
    entities: [User, Event, Ticket, TicketType, Category, PaymentLog, RoleAudit, SubscriptionPlan, UserSubscription, Coupon, PromoterGroup, PromoterEventAssignment, ScannerOrganizerAssignment, Role, RefreshToken, AccountClaimToken],
    // Connection pool tuning + SSL config for Neon PostgreSQL
    extra: {
        ...(connectionUrl ? { ssl: { rejectUnauthorized: false } } : {}),
        max: parseInt(process.env.DB_POOL_MAX || '10', 10),
        connectionTimeoutMillis: parseInt(process.env.DB_CONN_TIMEOUT || '15000', 10),
        idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10),
    },
});

export default AppDataSource;
