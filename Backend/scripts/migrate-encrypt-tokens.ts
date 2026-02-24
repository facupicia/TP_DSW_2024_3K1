/**
 * Migration Script: Encrypt existing MP tokens
 * 
 * Este script migra los tokens de MercadoPago existentes de texto plano
 * a formato encriptado.
 * 
 * Ejecutar UNA VEZ después del deploy:
 * npx ts-node scripts/migrate-encrypt-tokens.ts
 */

import { DataSource } from 'typeorm';
import { User } from '../src/user/user.entity';
import { encryptToString } from '../src/common/services/encryption';
import { logger } from '../src/common/services/logger';

// Configurar conexión a DB
const AppDataSource = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    host: process.env.PGHOST,
    port: parseInt(process.env.PGPORT || '5432'),
    username: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    entities: [User],
    synchronize: false,
});

async function migrateTokens() {
    try {
        await AppDataSource.initialize();
        logger.info('MIGRATION_START', { message: 'Starting token encryption migration' });

        const userRepo = AppDataSource.getRepository(User);
        
        // Buscar usuarios con tokens en texto plano
        // Los tokens encriptados empiezan con '{', los de texto plano no
        const users = await userRepo
            .createQueryBuilder('user')
            .where('user.mpAccessToken IS NOT NULL')
            .andWhere("user.mpAccessToken NOT LIKE '{%'")
            .getMany();

        logger.info('MIGRATION_FOUND_USERS', { count: users.length });

        let migrated = 0;
        let failed = 0;

        for (const user of users) {
            try {
                if (!user.mpAccessToken) continue;

                // Verificar si ya está encriptado
                if (user.mpAccessToken.startsWith('{')) {
                    logger.info('MIGRATION_ALREADY_ENCRYPTED', { userId: user.id });
                    continue;
                }

                // Encriptar tokens
                const encryptedAccess = encryptToString(user.mpAccessToken);
                const encryptedRefresh = user.mpRefreshToken 
                    ? encryptToString(user.mpRefreshToken)
                    : null;

                if (!encryptedAccess) {
                    throw new Error('Failed to encrypt access token');
                }

                // Actualizar usuario
                await userRepo.update(user.id, {
                    mpAccessToken: encryptedAccess,
                    mpRefreshToken: encryptedRefresh
                });

                migrated++;
                logger.info('MIGRATION_USER_SUCCESS', { userId: user.id });

            } catch (error: any) {
                failed++;
                logger.error('MIGRATION_USER_FAILED', { 
                    userId: user.id, 
                    error: error.message 
                });
            }
        }

        logger.info('MIGRATION_COMPLETE', { migrated, failed, total: users.length });

    } catch (error: any) {
        logger.error('MIGRATION_FATAL_ERROR', { error: error.message });
        process.exit(1);
    } finally {
        await AppDataSource.destroy();
    }
}

// Ejecutar si se llama directamente
if (require.main === module) {
    migrateTokens();
}

export { migrateTokens };
