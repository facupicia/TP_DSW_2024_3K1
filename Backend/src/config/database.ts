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
import { SubscriptionPlan } from "../subscription/subscription_plan.entity"
import { UserSubscription } from "../subscription/user_subscription.entity"
import dotenv from "dotenv";

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
    ssl: connectionUrl ? true : false,
    extra: connectionUrl ? { ssl: { rejectUnauthorized: false } } : undefined,
    synchronize: true,
    logging: false,
    entities: [User, Event, Ticket, TicketType, Category, PaymentLog, RoleAudit, SubscriptionPlan, UserSubscription],
});

export default AppDataSource;
