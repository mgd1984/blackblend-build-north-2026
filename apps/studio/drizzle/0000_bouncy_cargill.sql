CREATE TABLE `briefs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`request_id` text NOT NULL,
	`title` text NOT NULL,
	`track` text NOT NULL,
	`audience` text NOT NULL,
	`goal` text NOT NULL,
	`source` text NOT NULL,
	`fidelity` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `brief_owner_request` ON `briefs` (`owner`,`request_id`);