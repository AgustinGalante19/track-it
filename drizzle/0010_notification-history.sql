CREATE TABLE `notification_delivery` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`at` integer NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`device` text NOT NULL,
	`provider` text NOT NULL,
	`http_status` integer,
	`receipt` text,
	`receipt_at` integer,
	FOREIGN KEY (`run_id`) REFERENCES `notification_run`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notification_delivery_run_idx` ON `notification_delivery` (`run_id`,`at`);--> statement-breakpoint
CREATE TABLE `notification_run` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`reason` text,
	`sent` integer DEFAULT 0 NOT NULL,
	`expired` integer DEFAULT 0 NOT NULL,
	`failed` integer DEFAULT 0 NOT NULL,
	`skipped` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notification_run_started_idx` ON `notification_run` (`started_at`,`id`);