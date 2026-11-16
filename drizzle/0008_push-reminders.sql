CREATE TABLE `push_reminder_delivery` (
	`subscription_id` text NOT NULL,
	`due_date` text NOT NULL,
	`lease_until` integer NOT NULL,
	`sent_at` integer,
	PRIMARY KEY(`subscription_id`, `due_date`),
	FOREIGN KEY (`subscription_id`) REFERENCES `push_subscription`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `push_subscription` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`session_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`days_before` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscription_endpoint_unique` ON `push_subscription` (`endpoint`);--> statement-breakpoint
CREATE INDEX `push_subscription_user_idx` ON `push_subscription` (`user_id`);--> statement-breakpoint
CREATE INDEX `push_subscription_session_idx` ON `push_subscription` (`session_id`);
