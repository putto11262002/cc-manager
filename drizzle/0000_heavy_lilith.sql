CREATE TABLE `ccr_run_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` text NOT NULL,
	`index` integer NOT NULL,
	`message_type` text NOT NULL,
	`message_json` text NOT NULL,
	`created_at` text
);
--> statement-breakpoint
CREATE TABLE `ccr_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`cwd` text NOT NULL,
	`session_id` text NOT NULL,
	`parent_session_id` text,
	`mode` text NOT NULL,
	`status` text NOT NULL,
	`prompt` text NOT NULL,
	`result_type` text,
	`result_json` text,
	`duration_ms` integer,
	`created_at` text
);
