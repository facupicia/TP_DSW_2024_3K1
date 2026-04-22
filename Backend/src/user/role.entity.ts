import { Entity, Column, PrimaryGeneratedColumn, BaseEntity } from "typeorm"

@Entity('role')
export class Role extends BaseEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ unique: true })
    name: string;

    @Column({ nullable: true })
    description: string;
}

/**
 * Helper to extract role names from a User's roles relation.
 * Use this everywhere you previously accessed user.roles as string[].
 */
export const getRoleNames = (user: { roles?: Role[] }): string[] => {
    if (!user.roles) return [];
    if (Array.isArray(user.roles) && user.roles.length > 0 && typeof user.roles[0] === 'string') {
        // Defensive: handle any edge case where strings leak through
        return (user.roles as any) as string[];
    }
    return user.roles.map((r: Role) => r.name);
};

/**
 * Predefined role names for validation and seeding
 */
export const ROLE_NAMES = ['user', 'rrpp', 'scanner', 'organizer', 'admin'] as const;

/**
 * Find roles by their names. Creates missing roles if autoCreate is true.
 * Handles race conditions gracefully (e.g. two simultaneous signups).
 */
export const findRolesByNames = async (names: string[], autoCreate = true): Promise<Role[]> => {
    const roleRepo = Role.getRepository();
    const found: Role[] = [];
    for (const name of names) {
        let role = await roleRepo.findOne({ where: { name } });
        if (!role && autoCreate) {
            role = roleRepo.create({ name });
            try {
                await roleRepo.save(role);
            } catch (err: any) {
                // Race condition: another request created the role between findOne and save
                if (err.message?.includes('duplicate key')) {
                    role = await roleRepo.findOne({ where: { name } });
                } else {
                    throw err;
                }
            }
        }
        if (role) {
            found.push(role);
        }
    }
    return found;
};

/**
 * Ensure all predefined roles exist in the database.
 * Call this during app initialization or seeding.
 */
export const ensureRolesExist = async (): Promise<void> => {
    const roleRepo = Role.getRepository();
    for (const name of ROLE_NAMES) {
        const exists = await roleRepo.findOne({ where: { name } });
        if (!exists) {
            const role = roleRepo.create({ name });
            try {
                await roleRepo.save(role);
            } catch (err: any) {
                if (!err.message?.includes('duplicate key')) {
                    throw err;
                }
            }
        }
    }
};
