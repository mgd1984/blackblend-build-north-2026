CREATE TABLE `generation_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`workflow_id` text NOT NULL,
	`request_id` text NOT NULL,
	`input_hash` text NOT NULL,
	`input` text NOT NULL,
	`status` text NOT NULL,
	`remote_id` text,
	`error` text,
	`duration_ms` integer NOT NULL,
	`base_estimate_cents` integer NOT NULL,
	`result_key` text,
	`processing_ms` integer,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`approved_at` text,
	`updated_at` text NOT NULL,
	`poll_after` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `generation_owner_request` ON `generation_jobs` (`owner`,`request_id`);--> statement-breakpoint
CREATE INDEX `generation_owner_approved` ON `generation_jobs` (`owner`,`approved_at`);--> statement-breakpoint
CREATE TABLE `usage_events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL,
	`delivered_at` text
);
--> statement-breakpoint
ALTER TABLE `workflows` ADD `generation_id` text;