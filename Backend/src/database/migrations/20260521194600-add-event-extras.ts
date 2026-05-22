import { MigrationInterface, QueryRunner } from "typeorm";

export class AddEventExtras20260521194600 implements MigrationInterface {
    name = "AddEventExtras20260521194600";

    public async up(queryRunner: QueryRunner): Promise<void> {
        // 1. Add new columns to subscription_plan
        await queryRunner.query(`
            ALTER TABLE "subscription_plan"
            ADD COLUMN IF NOT EXISTS "maxProductsInCatalog" integer NOT NULL DEFAULT 0
        `);
        await queryRunner.query(`
            ALTER TABLE "subscription_plan"
            ADD COLUMN IF NOT EXISTS "canSellExtras" boolean NOT NULL DEFAULT false
        `);

        // 2. Update existing FREE plan with new defaults
        await queryRunner.query(`
            UPDATE "subscription_plan"
            SET "maxProductsInCatalog" = 0, "canSellExtras" = false
            WHERE "name" = 'FREE'
        `);

        // 3. Create product table
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "product" (
                "id" SERIAL PRIMARY KEY,
                "name" character varying NOT NULL,
                "description" text,
                "category" character varying NOT NULL DEFAULT 'other',
                "basePrice" numeric(12,2) NOT NULL,
                "imageUrl" character varying,
                "organizerId" integer NOT NULL,
                "createdAt" timestamptz NOT NULL DEFAULT now(),
                "updatedAt" timestamptz NOT NULL DEFAULT now(),
                "deletedAt" timestamptz,
                CONSTRAINT "FK_product_organizer" FOREIGN KEY ("organizerId") REFERENCES "user"("id") ON DELETE CASCADE
            )
        `);
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "idx_product_organizer" ON "product" ("organizerId")
        `);

        // 4. Create event_product table
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "event_product" (
                "id" SERIAL PRIMARY KEY,
                "eventId" integer NOT NULL,
                "productId" integer NOT NULL,
                "isActive" boolean NOT NULL DEFAULT true,
                "eventPrice" numeric(12,2) NOT NULL,
                "hasStock" boolean NOT NULL DEFAULT false,
                "stock" integer NOT NULL DEFAULT 0,
                "soldCount" integer NOT NULL DEFAULT 0,
                "maxPerOrder" integer NOT NULL DEFAULT 10,
                "createdAt" timestamptz NOT NULL DEFAULT now(),
                "updatedAt" timestamptz NOT NULL DEFAULT now(),
                CONSTRAINT "FK_event_product_event" FOREIGN KEY ("eventId") REFERENCES "event"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_event_product_product" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE RESTRICT,
                CONSTRAINT "CHK_event_product_price" CHECK ("eventPrice" >= 0),
                CONSTRAINT "CHK_event_product_stock" CHECK ("stock" >= 0),
                CONSTRAINT "CHK_event_product_sold" CHECK ("soldCount" >= 0),
                CONSTRAINT "CHK_event_product_max" CHECK ("maxPerOrder" >= 1)
            )
        `);
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "idx_event_product_event_active" ON "event_product" ("eventId", "isActive")
        `);

        // 5. Create extra_item table
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "extra_item" (
                "id" SERIAL PRIMARY KEY,
                "codigo_unico" character varying NOT NULL UNIQUE,
                "qrCode" text NOT NULL,
                "eventProductId" integer NOT NULL,
                "userId" integer NOT NULL,
                "paymentLogId" integer,
                "quantity" integer NOT NULL DEFAULT 1,
                "status" character varying(20) NOT NULL DEFAULT 'active',
                "purchasePrice" numeric(12,2) NOT NULL,
                "usedAt" timestamptz,
                "scannedById" integer,
                "createdAt" timestamptz NOT NULL DEFAULT now(),
                "updatedAt" timestamptz NOT NULL DEFAULT now(),
                "deletedAt" timestamptz,
                CONSTRAINT "FK_extra_item_event_product" FOREIGN KEY ("eventProductId") REFERENCES "event_product"("id") ON DELETE RESTRICT,
                CONSTRAINT "FK_extra_item_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT,
                CONSTRAINT "FK_extra_item_payment_log" FOREIGN KEY ("paymentLogId") REFERENCES "payment_log"("id") ON DELETE SET NULL,
                CONSTRAINT "FK_extra_item_scanner" FOREIGN KEY ("scannedById") REFERENCES "user"("id") ON DELETE SET NULL,
                CONSTRAINT "CHK_extra_item_qty" CHECK ("quantity" >= 1),
                CONSTRAINT "CHK_extra_item_price" CHECK ("purchasePrice" >= 0)
            )
        `);
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "idx_extra_item_user_created" ON "extra_item" ("userId", "createdAt")
        `);
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "idx_extra_item_event_product" ON "extra_item" ("eventProductId", "status")
        `);
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "idx_extra_item_payment_log" ON "extra_item" ("paymentLogId")
        `);
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "idx_extra_item_status_created" ON "extra_item" ("status", "createdAt")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop tables in reverse order to avoid FK issues
        await queryRunner.query(`DROP TABLE IF EXISTS "extra_item"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "event_product"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "product"`);

        // Remove new columns from subscription_plan
        await queryRunner.query(`
            ALTER TABLE "subscription_plan"
            DROP COLUMN IF EXISTS "canSellExtras"
        `);
        await queryRunner.query(`
            ALTER TABLE "subscription_plan"
            DROP COLUMN IF EXISTS "maxProductsInCatalog"
        `);
    }
}
