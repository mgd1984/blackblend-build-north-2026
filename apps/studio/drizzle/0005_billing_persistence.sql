CREATE TABLE `billing_accounts` (
	`owner` text PRIMARY KEY NOT NULL,
	`environment` text NOT NULL,
	`stripe_account_id` text NOT NULL,
	`stripe_customer_id` text NOT NULL,
	`metronome_customer_id` text NOT NULL,
	`metronome_contract_id` text NOT NULL,
	`usage_configured` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_stripe_customer` ON `billing_accounts` (`stripe_account_id`,`stripe_customer_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `billing_metronome_customer` ON `billing_accounts` (`metronome_customer_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `billing_metronome_contract` ON `billing_accounts` (`metronome_contract_id`);--> statement-breakpoint
CREATE TABLE `billing_dispatch_leases` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `billing_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`event_id` text NOT NULL,
	`owner` text NOT NULL,
	`payload` text NOT NULL,
	`received_at` text NOT NULL,
	`processed_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_notification_event` ON `billing_notifications` (`provider`,`event_id`);--> statement-breakpoint
CREATE INDEX `billing_notification_owner` ON `billing_notifications` (`owner`,`received_at`);--> statement-breakpoint
ALTER TABLE `usage_events` ADD `delivery_attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `usage_events` ADD `next_attempt_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `usage_events` ADD `delivery_error` text;