-- Query Optimization Indexes for EventLife

-- Indexes on Ticket Table
CREATE INDEX IF NOT EXISTS "idx_ticket_payment_log_id" ON "ticket" ("paymentLogId");
CREATE INDEX IF NOT EXISTS "idx_ticket_sold_by_promoter_id" ON "ticket" ("soldByPromoterId");
CREATE INDEX IF NOT EXISTS "idx_ticket_status" ON "ticket" ("status");
CREATE INDEX IF NOT EXISTS "idx_ticket_created_at" ON "ticket" ("createdAt");

-- Indexes on Payment Log Table
CREATE INDEX IF NOT EXISTS "idx_payment_log_mp_payment_id" ON "payment_log" ("mpPaymentId");
CREATE INDEX IF NOT EXISTS "idx_payment_log_organizer_id" ON "payment_log" ("organizerId");
CREATE INDEX IF NOT EXISTS "idx_payment_log_created_at" ON "payment_log" ("createdAt");

-- Indexes on Event Table
CREATE INDEX IF NOT EXISTS "idx_event_user_id" ON "event" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_event_active_deleted_at" ON "event" ("active", "deletedAt");
CREATE INDEX IF NOT EXISTS "idx_event_date_time" ON "event" ("date", "time");
