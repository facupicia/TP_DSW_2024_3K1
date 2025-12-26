import { DataSource } from "typeorm"
import { User } from "./user/user.entity"
import { Event } from "./event/event.entity"
import { Ticket } from "./ticket/ticket.entity"
import { Category } from "./category/category.entity"
import { PaymentLog } from "./payment/payment.entity"
import { RoleAudit } from "./user/roleAudit.entity"
import dotenv from "dotenv";

dotenv.config();

const AppDataSource = new DataSource({
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
  extra: { ssl: { rejectUnauthorized: process.env.NODE_ENV === 'production' } }
});

export default AppDataSource;

