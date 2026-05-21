import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    JoinColumn,
    BaseEntity,
    CreateDateColumn,
    UpdateDateColumn,
    Index,
    Check
} from "typeorm";
import { Event } from "../event/event.entity";
import { Product } from "../product/product.entity";

@Entity('event_product')
@Index('idx_event_product_event_active', ['eventId', 'isActive'])
@Check('"eventPrice" >= 0')
@Check('"stock" >= 0')
@Check('"soldCount" >= 0')
@Check('"maxPerOrder" >= 1')
export class EventProduct extends BaseEntity {

    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    eventId: number;

    @ManyToOne(() => Event, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'eventId' })
    event: Event;

    @Column()
    productId: number;

    @ManyToOne(() => Product, { onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'productId' })
    product: Product;

    @Column({ default: true })
    isActive: boolean;

    @Column({ type: 'numeric', precision: 12, scale: 2 })
    eventPrice: number;

    @Column({ default: false })
    hasStock: boolean;

    @Column({ default: 0 })
    stock: number;

    @Column({ default: 0 })
    soldCount: number;

    @Column({ default: 10 })
    maxPerOrder: number;

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt: Date;

    @UpdateDateColumn({ type: 'timestamptz' })
    updatedAt: Date;
}
