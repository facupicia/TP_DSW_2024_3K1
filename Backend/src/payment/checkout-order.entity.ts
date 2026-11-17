import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('checkout_order')
export class CheckoutOrder {
    @PrimaryColumn() externalReference: string;
    @Column() @Index() userId: number;
    @Column() organizerId: number;
    @Column() eventId: number;
    @Column({ select: false }) statusTokenHash: string;
    @Column({ type: 'jsonb' }) snapshot: Record<string, any>;
    @Column({ default: 'pending' }) status: string;
    @Column({ nullable: true }) preferenceId: string | null;
    @Column({ type: 'timestamptz' }) expiresAt: Date;
    @Column({ type:'timestamptz',nullable:true }) @Index() reservationExpiresAt: Date | null;
    @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}
