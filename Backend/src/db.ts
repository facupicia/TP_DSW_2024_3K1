import { DataSource } from "typeorm"
import { User } from "./user/user.entity"
import { Event } from "./event/event.entity"
import { Ticket } from "./ticket/ticket.entity"
import { Category } from "./category/category.entity"
import { PaymentLog } from "./payment/payment.entity"
import { RoleAudit } from "./user/roleAudit.entity"
import dotenv from "dotenv";

dotenv.config();

const usePostgres = !!(process.env.POSTGRES_URL || process.env.DATABASE_URL || process.env.PGHOST);

const AppDataSource = usePostgres
  ? new DataSource({
    type: "postgres",
    url: process.env.POSTGRES_URL || process.env.DATABASE_URL,
    host: process.env.PGHOST,
    port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
    username: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    ssl: true,
    synchronize: process.env.NODE_ENV !== 'production',
    logging: false,
    entities: [User, Event, Ticket, Category, PaymentLog, RoleAudit],
    extra: { ssl: { rejectUnauthorized: false } }
  })
  : new DataSource({
    type: "mysql",
    host: process.env.MYSQL_HOST || process.env.MYSQL_ADDON_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    username: process.env.MYSQL_USER || process.env.MYSQL_ADDON_USER || 'root',
    password: process.env.MYSQL_PASSWORD || process.env.MYSQL_ADDON_PASSWORD || 'patineta24',
    database: process.env.MYSQL_DATABASE || process.env.DB_NAME || 'eventlife',
    synchronize: process.env.NODE_ENV !== 'production',
    logging: false,
    entities: [User, Event, Ticket, Category, PaymentLog, RoleAudit],
  });

export default AppDataSource;

