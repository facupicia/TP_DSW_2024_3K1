CREATE TABLE IF NOT EXISTS "scanner_organizer_assignment" (
    "id" SERIAL PRIMARY KEY,
    "organizerId" integer NOT NULL,
    "scannerId" integer NOT NULL,
    "assignedById" integer,
    "isActive" boolean NOT NULL DEFAULT true,
    "createdAt" timestamp NOT NULL DEFAULT now(),
    "updatedAt" timestamp NOT NULL DEFAULT now(),
    CONSTRAINT "uq_scanner_organizer_assignment" UNIQUE ("organizerId", "scannerId"),
    CONSTRAINT "fk_scanner_organizer_assignment_organizer" FOREIGN KEY ("organizerId") REFERENCES "user"("id") ON DELETE CASCADE,
    CONSTRAINT "fk_scanner_organizer_assignment_scanner" FOREIGN KEY ("scannerId") REFERENCES "user"("id") ON DELETE CASCADE,
    CONSTRAINT "fk_scanner_organizer_assignment_assigned_by" FOREIGN KEY ("assignedById") REFERENCES "user"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "idx_scanner_organizer_active"
    ON "scanner_organizer_assignment" ("organizerId", "isActive");

CREATE INDEX IF NOT EXISTS "idx_scanner_user_active"
    ON "scanner_organizer_assignment" ("scannerId", "isActive");
