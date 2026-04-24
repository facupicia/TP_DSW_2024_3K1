import { Entity, PrimaryGeneratedColumn, Column, BaseEntity, OneToMany, Index } from 'typeorm';
import { Event } from '../event/event.entity';
@Entity()
export class Category extends BaseEntity{
  
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    @Index('idx_category_name')
    name: string;

    @OneToMany(() => Event, event => event.category)
    events: Event[];
}
