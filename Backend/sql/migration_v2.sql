-- Migration V2: Refactor Ticket Logic
-- Date: 2026-01-09

-- 1. Create TicketType table
CREATE TABLE IF NOT EXISTS "ticket_type" (
    "id" SERIAL PRIMARY KEY,
    "eventId" INTEGER NOT NULL,
    "name" VARCHAR NOT NULL,
    "description" VARCHAR,
    "price" DECIMAL(12,2) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "soldCount" INTEGER DEFAULT 0 NOT NULL,
    "active" BOOLEAN DEFAULT true NOT NULL,
    "createdAt" TIMESTAMP DEFAULT now() NOT NULL,
    "updatedAt" TIMESTAMP DEFAULT now() NOT NULL,
    CONSTRAINT "FK_ticket_type_event" FOREIGN KEY ("eventId") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE INDEX IF NOT EXISTS "idx_ticket_type_eventId" ON "ticket_type"("eventId");

-- 2. Modify Ticket table
ALTER TABLE "ticket" ADD COLUMN IF NOT EXISTS "ticketTypeId" INTEGER;
ALTER TABLE "ticket" ADD COLUMN IF NOT EXISTS "status" VARCHAR DEFAULT 'active' NOT NULL;
ALTER TABLE "ticket" ADD COLUMN IF NOT EXISTS "purchasePrice" DECIMAL(12,2);
ALTER TABLE "ticket" ADD COLUMN IF NOT EXISTS "usedAt" TIMESTAMP;
ALTER TABLE "ticket" ADD COLUMN IF NOT EXISTS "scannedById" INTEGER;

-- Add constraints
ALTER TABLE "ticket" ADD CONSTRAINT "FK_ticket_ticketType" FOREIGN KEY ("ticketTypeId") REFERENCES "ticket_type"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "ticket" ADD CONSTRAINT "FK_ticket_scannedBy" FOREIGN KEY ("scannedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- 3. Modify PaymentLog table
ALTER TABLE "payment_log" ADD COLUMN IF NOT EXISTS "ticketTypeId" INTEGER;

-- 4. Clean up Event table
-- Remove columns if they exist (PostgreSQL doesn't support IF EXISTS for DROP COLUMN in all versions cleanly without DO block, but assuming standard PG)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'event' AND column_name = 'price') THEN
        ALTER TABLE "event" DROP COLUMN "price";
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'event' AND column_name = 'stock') THEN
        ALTER TABLE "event" DROP COLUMN "stock";
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'event' AND column_name = 'soldCount') THEN
        ALTER TABLE "event" DROP COLUMN "soldCount";
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'event' AND column_name = 'capacity') THEN
        ALTER TABLE "event" DROP COLUMN "capacity";
    END IF;
END $$;
