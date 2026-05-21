import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    JoinColumn,
    BaseEntity,
    CreateDateColumn,
    UpdateDateColumn,
    DeleteDateColumn,
    Index,
    Check
} from "typeorm";
import { User } from "../user/user.entity";
import { EventProduct } from "./eventProduct.entity";
import { PaymentLog } from "../payment/payment.entity";

export enum ExtraItemStatus {
    ACTIVE = 'active',
    USED = 'used',
    CANCELLED = 'cancelled'
}

@Entity('extra_item')
@Index('idx_extra_item_user_created', ['userId', 'createdAt'])
@Index('idx_extra_item_event_product', ['eventProductId', 'status'])
@Index('idx_extra_item_payment_log', ['paymentLogId'])
@Index('idx_extra_item_status_created', ['status', 'createdAt'])
@Check('"quantity" >= 1')
@Check('"purchasePrice" >= 0')
export class ExtraItem extends BaseEntity {

    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: 'varchar', unique: true })
    codigo_unico: string;

    @Column({ type: 'text' })
    qrCode: string;

    @ManyToOne(() => EventProduct, { nullable: false, onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'eventProductId' })
    eventProduct: EventProduct;

    @Column()
    eventProductId: number;

    @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'userId' })
    user: User;

    @Column()
    userId: number;

    @ManyToOne(() => PaymentLog, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'paymentLogId' })
    paymentLog: PaymentLog | null;

    @Column({ nullable: true })
    paymentLogId: number | null;

    @Column({ default: 1 })
    quantity: number;

    @Column({
        type: 'varchar',
        length: 20,
        default: ExtraItemStatus.ACTIVE
    })
    status: ExtraItemStatus;

    @Column({ type: 'numeric', precision: 12, scale: 2 })
    purchasePrice: number;

    @Column({ type: 'timestamptz', nullable: true })
    usedAt: Date | null;

    @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'scannedById' })
    scannedBy: User | null;

    @Column({ nullable: true })
    scannedById: number | null;

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt: Date;

    @UpdateDateColumn({ type: 'timestamptz' })
    updatedAt: Date;

    @DeleteDateColumn({ type: 'timestamptz', nullable: true })
    deletedAt: Date | null;
}
