CREATE TABLE `workflows` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`brief_id` text NOT NULL,
	`status` text NOT NULL,
	`revision` text NOT NULL,
	`metadata` text NOT NULL,
	`source_hash` text,
	`proof_key` text,
	`source_key` text,
	`result_key` text,
	`prompt` text NOT NULL,
	`quality` text NOT NULL,
	`local_proposal` text,
	`job_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
