CREATE TABLE `agent_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`request_id` text NOT NULL,
	`input_hash` text NOT NULL,
	`status` text NOT NULL,
	`reply` text,
	`error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_owner_request` ON `agent_requests` (`owner`,`request_id`);--> statement-breakpoint
CREATE INDEX `agent_owner_created` ON `agent_requests` (`owner`,`created_at`);