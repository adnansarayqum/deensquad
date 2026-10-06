-- Shop: the parent hears about their order (placed, payment received, ready, cancelled) once each, and their
-- order page shows when it became ready and was collected.
-- Forward-only and nullable columns only, so each statement is a quick catalogue change under lock_timeout.
-- Existing orders keep nulls: emails go only when an order moves on from now, never for past steps.

-- When each email to the parent went (null = not sent). Claimed before sending and cleared again if it fails,
-- so a repeated tap or a second payment check never sends the same email twice.
alter table shop_orders add column placed_email_at timestamptz;
alter table shop_orders add column paid_email_at timestamptz;
alter table shop_orders add column ready_email_at timestamptz;
alter table shop_orders add column cancelled_email_at timestamptz;

-- When an admin marked the order ready to collect and handed it over, for the parent's timeline.
alter table shop_orders add column ready_at timestamptz;
alter table shop_orders add column collected_at timestamptz;
