import { Migration, MigrationExecutor } from 'typeorm';

// These deployed migrations used calendar dates instead of Unix milliseconds.
// Correct only their ordering key; TypeORM's original timestamp/name must remain
// unchanged so existing ledger rows and migration:revert continue to match.
const LEGACY_ORDER: Readonly<Record<string, number>> = Object.freeze({
    AddTicketDeletedAt20260507170000: Date.UTC(2026, 4, 7, 17),
    AddBuyerServiceFeePricing20260508193000: Date.UTC(2026, 4, 8, 19, 30),
    AddPaymentLogItems20260521120000: Date.UTC(2026, 4, 21, 12),
    AddEventExtras20260521194600: Date.UTC(2026, 4, 21, 19, 46),
    // This data correction depends on columns created by AddEventExtras.
    FixProPlanExtras20260521150000: Date.UTC(2026, 4, 21, 19, 46) + 1,
    RemovePaymentLogUnitPrice20260522050000: Date.UTC(2026, 4, 22, 5),
    FixCriticalCascades20260526000000: Date.UTC(2026, 4, 26),
    AddEventStartDateTime20260529120000: Date.UTC(2026, 4, 29, 12),
    AddPaymentExternalRefIndex20260530194000: Date.UTC(2026, 4, 30, 19, 40),
});

export class OrderedMigrationExecutor extends MigrationExecutor {
    protected getMigrations(): Migration[] {
        const migrations = super.getMigrations();
        for (const migration of migrations) {
            // FixAudit embeds "2026" before its valid Unix timestamp. Keep this
            // existing name, while requiring an unambiguous suffix for new files.
            if (!Object.hasOwn(LEGACY_ORDER, migration.name)
                && migration.name !== 'FixAudit20261778783070689'
                && !/\D\d{13}$/.test(migration.name)) {
                throw new Error(`Migration ${migration.name} must end in a 13-digit Unix timestamp`);
            }
        }
        return migrations.sort((a, b) =>
            (LEGACY_ORDER[a.name] ?? a.timestamp) - (LEGACY_ORDER[b.name] ?? b.timestamp));
    }
}
