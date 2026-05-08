import { BaseEntity, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from "typeorm";
import { User } from "./user.entity";

@Entity({ name: "role_audit" })
export class RoleAudit extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'adminId' })
  admin: User;

  @Column()
  @Index('idx_role_audit_admin')
  adminId: number;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'userId' })
  targetUser: User;

  @Column()
  @Index('idx_role_audit_user')
  userId: number;

  @Column()
  prevRole: string;

  @Column()
  newRole: string;

  @Column({ nullable: true })
  ip: string;

  @CreateDateColumn({ type: "timestamptz" })
  @Index('idx_role_audit_created')
  createdAt: Date;
}
