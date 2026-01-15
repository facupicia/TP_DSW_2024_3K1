import { Entity, PrimaryGeneratedColumn, Column, BaseEntity, OneToMany } from 'typeorm';
import { Event } from '../event/event.entity';
@Entity()
export class Category extends BaseEntity{
  
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    name: string;

    @OneToMany(() => Event, event => event.category)
    events: Event[];
}
