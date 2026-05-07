import { BaseEntity, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Entity({ name: "role_audit" })
export class RoleAudit extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  @Index('idx_role_audit_admin')
  adminId: number;

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
