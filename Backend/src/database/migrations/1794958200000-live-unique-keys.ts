import { MigrationInterface, QueryRunner, TableUnique } from 'typeorm';

const keys = [
    { table: 'user', columns: ['email'], index: 'uq_user_email_live' },
    { table: 'user', columns: ['mpUserId'], index: 'uq_user_mp_user_live' },
    { table: 'category', columns: ['name'], index: 'uq_category_name_live' },
    { table: 'ticket_type', columns: ['eventId', 'name'], index: 'uq_ticket_type_event_name_live' }
];

export class LiveUniqueKeys1794958200000 implements MigrationInterface {
    transaction = false;

    async up(q: QueryRunner): Promise<void> {
        await q.query(`SET lock_timeout='5s'`);
        try {
            // Build replacements before dropping any existing protection. Failed
            // concurrent builds can leave an invalid index, which must be rebuilt.
            for (const key of keys) {
                const [index] = await q.query(`SELECT i.indisvalid FROM pg_index i
                    JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace
                    WHERE c.relname=$1 AND n.nspname=current_schema()`, [key.index]);
                if (index && !index.indisvalid) await q.query(`DROP INDEX CONCURRENTLY "${key.index}"`);
                const columns = key.columns.map(column => `"${column}"`).join(', ');
                const predicate = `"deletedAt" IS NULL${key.columns[0] === 'mpUserId' ? ' AND "mpUserId" IS NOT NULL' : ''}`;
                await q.query(`CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "${key.index}" ON "${key.table}" (${columns}) WHERE ${predicate}`);
            }
            for (const key of keys) {
                const table = await q.getTable(key.table);
                if (!table) throw new Error('LIVE_UNIQUE_TABLE_REQUIRED');
                for (const unique of table.uniques.filter(unique => unique.columnNames.length === key.columns.length
                    && key.columns.every(column => unique.columnNames.includes(column)))) {
                    await q.dropUniqueConstraint(key.table, unique);
                }
            }
        } finally { await q.query('RESET lock_timeout'); }
    }

    async down(q: QueryRunner): Promise<void> {
        // Soft-deleted history may now share a natural key. Never delete rows or
        // change identities to make an old global constraint fit again.
        for (const key of keys) {
            const columns = key.columns.map(column => `"${column}"`).join(', ');
            const duplicates = await q.query(`SELECT 1 FROM "${key.table}" WHERE ${key.columns.map(column => `"${column}" IS NOT NULL`).join(' AND ')}
                GROUP BY ${columns} HAVING COUNT(*)>1 LIMIT 1`);
            if (duplicates.length) throw new Error('LIVE_UNIQUE_ROLLBACK_REQUIRES_REVIEW');
        }
        for (const key of keys) {
            const table = await q.getTable(key.table);
            const name = `${key.index}_global`;
            if (!table?.uniques.some(unique => unique.name === name)) {
                await q.createUniqueConstraint(key.table, new TableUnique({ name, columnNames: key.columns }));
            }
        }
        for (const key of keys) await q.query(`DROP INDEX CONCURRENTLY IF EXISTS "${key.index}"`);
    }
}
