import { BaseEntity, Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity({ name: "role_audit" })
export class RoleAudit extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  adminId: number;

  @Column()
  userId: number;

  @Column()
  prevRole: string;

  @Column()
  newRole: string;

  @Column({ nullable: true })
  ip: string;

  @CreateDateColumn({ type: "timestamp" })
  createdAt: Date;
}
