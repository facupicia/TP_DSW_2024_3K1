-- Database Check Constraints
-- Run this after TypeORM synchronize to enforce data integrity at the DB level.
-- These constraints complement the @Check decorators in entities.

-- Ticket
ALTER TABLE "ticket" DROP CONSTRAINT IF EXISTS chk_ticket_purchase_price;
ALTER TABLE "ticket" ADD CONSTRAINT chk_ticket_purchase_price CHECK ("purchasePrice" >= 0);

ALTER TABLE "ticket" DROP CONSTRAINT IF EXISTS chk_ticket_commission_pct;
ALTER TABLE "ticket" ADD CONSTRAINT chk_ticket_commission_pct CHECK ("promoterCommissionPercentage" IS NULL OR ("promoterCommissionPercentage" >= 0 AND "promoterCommissionPercentage" <= 100));

ALTER TABLE "ticket" DROP CONSTRAINT IF EXISTS chk_ticket_commission_amount;
ALTER TABLE "ticket" ADD CONSTRAINT chk_ticket_commission_amount CHECK ("promoterCommissionAmount" IS NULL OR "promoterCommissionAmount" >= 0);

-- TicketType
ALTER TABLE "ticket_type" DROP CONSTRAINT IF EXISTS chk_tt_capacity;
ALTER TABLE "ticket_type" ADD CONSTRAINT chk_tt_capacity CHECK ("capacity" > 0);

ALTER TABLE "ticket_type" DROP CONSTRAINT IF EXISTS chk_tt_price;
ALTER TABLE "ticket_type" ADD CONSTRAINT chk_tt_price CHECK ("price" >= 0);

ALTER TABLE "ticket_type" DROP CONSTRAINT IF EXISTS chk_tt_sold_count;
ALTER TABLE "ticket_type" ADD CONSTRAINT chk_tt_sold_count CHECK ("soldCount" >= 0 AND "soldCount" <= "capacity");

-- PaymentLog
ALTER TABLE "payment_log" DROP CONSTRAINT IF EXISTS chk_payment_quantity;
ALTER TABLE "payment_log" ADD CONSTRAINT chk_payment_quantity CHECK ("quantity" > 0);

ALTER TABLE "payment_log" DROP CONSTRAINT IF EXISTS chk_payment_total;
ALTER TABLE "payment_log" ADD CONSTRAINT chk_payment_total CHECK ("totalAmount" > 0);

ALTER TABLE "payment_log" DROP CONSTRAINT IF EXISTS chk_payment_unit_price;
ALTER TABLE "payment_log" ADD CONSTRAINT chk_payment_unit_price CHECK ("unitPrice" IS NULL OR "unitPrice" >= 0);

ALTER TABLE "payment_log" DROP CONSTRAINT IF EXISTS chk_payment_base_amount;
ALTER TABLE "payment_log" ADD CONSTRAINT chk_payment_base_amount CHECK ("baseAmount" >= 0);

ALTER TABLE "payment_log" DROP CONSTRAINT IF EXISTS chk_payment_discount_amount;
ALTER TABLE "payment_log" ADD CONSTRAINT chk_payment_discount_amount CHECK ("discountAmount" >= 0);

ALTER TABLE "payment_log" DROP CONSTRAINT IF EXISTS chk_payment_service_fee_percent;
ALTER TABLE "payment_log" ADD CONSTRAINT chk_payment_service_fee_percent CHECK ("serviceFeePercent" >= 0 AND "serviceFeePercent" <= 100);

ALTER TABLE "payment_log" DROP CONSTRAINT IF EXISTS chk_payment_service_fee_amount;
ALTER TABLE "payment_log" ADD CONSTRAINT chk_payment_service_fee_amount CHECK ("serviceFeeAmount" >= 0);

ALTER TABLE "payment_log" DROP CONSTRAINT IF EXISTS chk_payment_buyer_total;
ALTER TABLE "payment_log" ADD CONSTRAINT chk_payment_buyer_total CHECK ("buyerTotalAmount" > 0);

ALTER TABLE "payment_log" DROP CONSTRAINT IF EXISTS chk_payment_commission;
ALTER TABLE "payment_log" ADD CONSTRAINT chk_payment_commission CHECK ("commissionPercent" >= 0 AND "commissionPercent" <= 100);

ALTER TABLE "payment_log" DROP CONSTRAINT IF EXISTS chk_payment_refund;
ALTER TABLE "payment_log" ADD CONSTRAINT chk_payment_refund CHECK ("refundAmount" IS NULL OR "refundAmount" >= 0);

-- Coupon
ALTER TABLE "coupon" DROP CONSTRAINT IF EXISTS chk_coupon_discount;
ALTER TABLE "coupon" ADD CONSTRAINT chk_coupon_discount CHECK ("discountPercent" >= 0 AND "discountPercent" <= 100);

ALTER TABLE "coupon" DROP CONSTRAINT IF EXISTS chk_coupon_max_uses;
ALTER TABLE "coupon" ADD CONSTRAINT chk_coupon_max_uses CHECK ("maxUses" >= 0);

ALTER TABLE "coupon" DROP CONSTRAINT IF EXISTS chk_coupon_used_count;
ALTER TABLE "coupon" ADD CONSTRAINT chk_coupon_used_count CHECK ("usedCount" >= 0);

ALTER TABLE "coupon" DROP CONSTRAINT IF EXISTS chk_coupon_usage_limit;
ALTER TABLE "coupon" ADD CONSTRAINT chk_coupon_usage_limit CHECK ("usedCount" <= "maxUses" OR "maxUses" = 0);

-- SubscriptionPlan
ALTER TABLE "subscription_plan" DROP CONSTRAINT IF EXISTS chk_plan_monthly_price;
ALTER TABLE "subscription_plan" ADD CONSTRAINT chk_plan_monthly_price CHECK ("monthlyPrice" >= 0);

ALTER TABLE "subscription_plan" DROP CONSTRAINT IF EXISTS chk_plan_yearly_price;
ALTER TABLE "subscription_plan" ADD CONSTRAINT chk_plan_yearly_price CHECK ("yearlyPrice" >= 0);

ALTER TABLE "subscription_plan" DROP CONSTRAINT IF EXISTS chk_plan_commission;
ALTER TABLE "subscription_plan" ADD CONSTRAINT chk_plan_commission CHECK ("commissionPercent" >= 0 AND "commissionPercent" <= 100);

ALTER TABLE "subscription_plan" DROP CONSTRAINT IF EXISTS chk_plan_service_fee;
ALTER TABLE "subscription_plan" ADD CONSTRAINT chk_plan_service_fee CHECK ("serviceFeePercent" >= 0 AND "serviceFeePercent" <= 100);

ALTER TABLE "subscription_plan" DROP CONSTRAINT IF EXISTS chk_plan_minimum_service_fee;
ALTER TABLE "subscription_plan" ADD CONSTRAINT chk_plan_minimum_service_fee CHECK ("minimumServiceFee" >= 0);

ALTER TABLE "subscription_plan" DROP CONSTRAINT IF EXISTS chk_plan_max_events;
ALTER TABLE "subscription_plan" ADD CONSTRAINT chk_plan_max_events CHECK ("maxEventsPerMonth" >= -1);

ALTER TABLE "subscription_plan" DROP CONSTRAINT IF EXISTS chk_plan_max_types;
ALTER TABLE "subscription_plan" ADD CONSTRAINT chk_plan_max_types CHECK ("maxTicketTypesPerEvent" >= -1);

-- PromoterGroup
ALTER TABLE "promoter_group" DROP CONSTRAINT IF EXISTS chk_promoter_commission;
ALTER TABLE "promoter_group" ADD CONSTRAINT chk_promoter_commission CHECK ("commissionPercentage" >= 0 AND "commissionPercentage" <= 100);

-- PromoterEventAssignment
ALTER TABLE "promoter_event_assignment" DROP CONSTRAINT IF EXISTS chk_promoter_event_custom_commission;
ALTER TABLE "promoter_event_assignment" ADD CONSTRAINT chk_promoter_event_custom_commission CHECK ("customCommissionPercentage" IS NULL OR ("customCommissionPercentage" >= 0 AND "customCommissionPercentage" <= 100));

-- UserSubscription: unique partial index for one active subscription per user
DROP INDEX IF EXISTS uq_user_active_subscription;
CREATE UNIQUE INDEX uq_user_active_subscription ON "user_subscription" ("userId") WHERE status = 'active';
