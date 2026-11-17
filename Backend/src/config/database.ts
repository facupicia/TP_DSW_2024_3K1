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

import { OutboxJob } from '../queue/outbox.entity';
import { CheckoutOrder } from '../payment/checkout-order.entity';
import { RefundRequest } from '../payment/refund-request.entity';
const connectionUrl = env.POSTGRES_URL || env.DATABASE_URL;
const isProduction = env.NODE_ENV === 'production';

// SSL: si DB_SSL está definido, usarlo; si no, habilitado por defecto
const sslEnabled = env.DB_SSL !== undefined ? env.DB_SSL === 'true' : true;

// DB_SYNC: si está en true, sincroniza el esquema (crear tablas) y NO corre migraciones
const shouldSync = env.DB_SYNC === 'true';
if (isProduction && shouldSync) throw new Error('DB_SYNC must be false in production; use migrations');

const AppDataSource = new DataSource({
    type: "postgres",
    url: connectionUrl,
    host: !connectionUrl ? env.PGHOST : undefined,
    port: !connectionUrl && env.PGPORT ? Number(env.PGPORT) : undefined,
    username: !connectionUrl ? env.PGUSER : undefined,
    password: !connectionUrl ? env.PGPASSWORD : undefined,
    database: !connectionUrl ? env.PGDATABASE : undefined,
    synchronize: shouldSync,
    logging: env.DB_LOGGING === 'true',
    entities: [OutboxJob, CheckoutOrder, RefundRequest, User, Event, Ticket, TicketType, Category, PaymentLog, RoleAudit, SubscriptionPlan, UserSubscription, Coupon, PromoterGroup, PromoterEventAssignment, ScannerOrganizerAssignment, Role, RefreshToken, AccountClaimToken, WebhookLog, Product, EventProduct, ExtraItem],
    // Load only timestamped migrations and only the extension of this runtime.
    // Old dist/ scripts must never be imported as migrations.
    migrations: [path.join(__dirname, '..', 'database', 'migrations', `[0-9]*.${__filename.endsWith('.ts') ? 'ts' : 'js'}`)],
    // Apply migrations explicitly in a release step, before starting replicas.
    migrationsRun: false,
    ssl: sslEnabled ? { rejectUnauthorized: isProduction } : false,
    extra: {
        ...(sslEnabled ? {
            ssl: {
                require: true,
                rejectUnauthorized: isProduction,
            },
        } : {}),
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
