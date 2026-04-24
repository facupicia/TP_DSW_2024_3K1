CREATE INDEX IF NOT EXISTS "idx_event_public_date"
    ON "event" ("active", "isPublic", "date");

CREATE INDEX IF NOT EXISTS "idx_event_user_active_date"
    ON "event" ("user_id", "active", "date");

CREATE INDEX IF NOT EXISTS "idx_event_category_active_date"
    ON "event" ("categoryId", "active", "date");

CREATE INDEX IF NOT EXISTS "idx_event_ciudad"
    ON "event" ("ciudad");

CREATE INDEX IF NOT EXISTS "idx_ticket_user_id"
    ON "ticket" ("userId");

CREATE INDEX IF NOT EXISTS "idx_ticket_user_created"
    ON "ticket" ("userId", "createdAt");

CREATE INDEX IF NOT EXISTS "idx_ticket_type_created"
    ON "ticket" ("ticketTypeId", "createdAt");

CREATE INDEX IF NOT EXISTS "idx_ticket_type_status"
    ON "ticket" ("ticketTypeId", "status");

CREATE INDEX IF NOT EXISTS "idx_ticket_promoter_created"
    ON "ticket" ("soldByPromoterId", "createdAt");

CREATE INDEX IF NOT EXISTS "idx_ticket_scanner_used"
    ON "ticket" ("scannedById", "usedAt");

CREATE INDEX IF NOT EXISTS "idx_ticket_status_created"
    ON "ticket" ("status", "createdAt");

CREATE INDEX IF NOT EXISTS "idx_ticket_type_event_status"
    ON "ticket_type" ("eventId", "status");

CREATE INDEX IF NOT EXISTS "idx_coupon_event_created"
    ON "coupon" ("eventId", "createdAt");

CREATE INDEX IF NOT EXISTS "idx_coupon_event_code_active"
    ON "coupon" ("eventId", "code", "isActive");

CREATE INDEX IF NOT EXISTS "idx_payment_user_created"
    ON "payment_log" ("userId", "createdAt");

CREATE INDEX IF NOT EXISTS "idx_payment_ticket_type_status_created"
    ON "payment_log" ("ticketTypeId", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "idx_promoter_group_organizer_active"
    ON "promoter_group" ("organizerId", "isActive");

CREATE INDEX IF NOT EXISTS "idx_promoter_group_promoter_active"
    ON "promoter_group" ("promoterId", "isActive");

CREATE INDEX IF NOT EXISTS "idx_promoter_group_organizer_promoter"
    ON "promoter_group" ("organizerId", "promoterId");

CREATE INDEX IF NOT EXISTS "idx_promoter_assignment_event_active"
    ON "promoter_event_assignment" ("eventId", "isActive");

CREATE INDEX IF NOT EXISTS "idx_promoter_assignment_group_active"
    ON "promoter_event_assignment" ("promoterGroupId", "isActive");

CREATE INDEX IF NOT EXISTS "idx_user_active_created"
    ON "user" ("active", "createdAt");

CREATE INDEX IF NOT EXISTS "idx_category_name"
    ON "category" ("name");
