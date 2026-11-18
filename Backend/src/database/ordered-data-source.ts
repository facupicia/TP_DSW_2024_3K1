import { DataSource, Migration } from 'typeorm';
import { CannotExecuteNotConnectedError } from 'typeorm/error/CannotExecuteNotConnectedError';
import { OrderedMigrationExecutor } from './ordered-migration-executor';

type MigrationOptions = { transaction?: 'all' | 'none' | 'each'; fake?: boolean };

// Keep TypeORM's public DataSource API, including its existing CLI commands.
export class OrderedDataSource extends DataSource {
    async runMigrations(options?: MigrationOptions): Promise<Migration[]> {
        if (!this.isInitialized) throw new CannotExecuteNotConnectedError(this.name);
        const executor = new OrderedMigrationExecutor(this);
        executor.transaction = options?.transaction || this.options.migrationsTransactionMode || 'all';
        executor.fake = options?.fake || false;
        return executor.executePendingMigrations();
    }

    async undoLastMigration(options?: MigrationOptions): Promise<void> {
        if (!this.isInitialized) throw new CannotExecuteNotConnectedError(this.name);
        const executor = new OrderedMigrationExecutor(this);
        executor.transaction = options?.transaction || this.options.migrationsTransactionMode || 'all';
        executor.fake = options?.fake || false;
        await executor.undoLastMigration();
    }

    async showMigrations(): Promise<boolean> {
        if (!this.isInitialized) throw new CannotExecuteNotConnectedError(this.name);
        return new OrderedMigrationExecutor(this).showMigrations();
    }
}
