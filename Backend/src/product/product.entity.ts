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
    Index
} from "typeorm";
import { User } from "../user/user.entity";

export enum ProductCategory {
    DRINK = 'drink',
    FOOD = 'food',
    PARKING = 'parking',
    MERCH = 'merch',
    COMBO = 'combo',
    OTHER = 'other'
}

@Entity('product')
@Index('idx_product_organizer', ['organizerId'])
export class Product extends BaseEntity {

    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    name: string;

    @Column({ type: 'text', nullable: true })
    description: string;

    @Column({
        type: 'enum',
        enum: ProductCategory,
        default: ProductCategory.OTHER
    })
    category: ProductCategory;

    @Column({ type: 'numeric', precision: 12, scale: 2 })
    basePrice: number;

    @Column({ type: 'varchar', nullable: true })
    imageUrl: string;

    @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'organizerId' })
    organizer: User;

    @Column({ nullable: true })
    organizerId: number;

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt: Date;

    @UpdateDateColumn({ type: 'timestamptz' })
    updatedAt: Date;

    @DeleteDateColumn({ type: 'timestamptz', nullable: true })
    deletedAt: Date | null;
}
