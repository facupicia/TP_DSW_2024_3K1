/**
 * Database Configuration
 * Centralized TypeORM DataSource configuration
 */
import { DataSource } from "typeorm"
import path from "path";
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
import { Coupon } from "../coupon/coupon.entity"
import { PromoterGroup, PromoterEventAssignment } from "../promoter/promoter.entity"
import { ScannerOrganizerAssignment } from "../scanner/scanner-organizer-assignment.entity"
import { WebhookLog } from "../payment/webhook-log.entity"
import { Product } from "../product/product.entity"
import { EventProduct } from "../extra/eventProduct.entity"
import { ExtraItem } from "../extra/extraItem.entity"
import { env } from "./env";

const connectionUrl = env.POSTGRES_URL || env.DATABASE_URL;
const isProduction = env.NODE_ENV === 'production';

const AppDataSource = new DataSource({
    type: "postgres",
    url: connectionUrl,
    host: !connectionUrl ? env.PGHOST : undefined,
    port: !connectionUrl && env.PGPORT ? Number(env.PGPORT) : undefined,
    username: !connectionUrl ? env.PGUSER : undefined,
    password: !connectionUrl ? env.PGPASSWORD : undefined,
    database: !connectionUrl ? env.PGDATABASE : undefined,
    synchronize: env.NODE_ENV === 'development' && env.DB_SYNC === 'true',
    logging: env.DB_LOGGING === 'true',
    entities: [User, Event, Ticket, TicketType, Category, PaymentLog, RoleAudit, SubscriptionPlan, UserSubscription, Coupon, PromoterGroup, PromoterEventAssignment, ScannerOrganizerAssignment, Role, RefreshToken, AccountClaimToken, WebhookLog, Product, EventProduct, ExtraItem],
    migrations: [path.join(__dirname, '..', 'database', 'migrations', '[0-9]*.{ts,js}')],
    migrationsRun: isProduction,
    extra: {
        ssl: {
            require: true,
            rejectUnauthorized: isProduction,
        },
        min: 1,
        max: env.DB_POOL_MAX,
        connectionTimeoutMillis: env.DB_CONN_TIMEOUT,
        idleTimeoutMillis: env.DB_IDLE_TIMEOUT,
        keepAlive: true,
        keepAliveInitialDelayMillis: 10000,
        application_name: `eventlife-api-${env.NODE_ENV}`,
        statement_timeout: env.DB_STATEMENT_TIMEOUT,
    },
});

export default AppDataSource;
