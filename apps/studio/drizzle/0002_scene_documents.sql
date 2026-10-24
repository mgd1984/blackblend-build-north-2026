CREATE TABLE `scenes` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`title` text NOT NULL,
	`version` integer NOT NULL,
	`document` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `scene_owner_updated` ON `scenes` (`owner`,`updated_at`);