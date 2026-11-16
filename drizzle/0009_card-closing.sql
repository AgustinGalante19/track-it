CREATE TABLE `__new_push_reminder_delivery` (
	`subscription_id` text NOT NULL,
	`due_date` text NOT NULL,
	`lease_until` integer NOT NULL,
	`sent_at` integer,
	`kind` text DEFAULT 'recurring' NOT NULL,
	PRIMARY KEY(`subscription_id`, `due_date`, `kind`),
	FOREIGN KEY (`subscription_id`) REFERENCES `push_subscription`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_push_reminder_delivery`(`subscription_id`, `due_date`, `lease_until`, `sent_at`)
SELECT `subscription_id`, `due_date`, `lease_until`, `sent_at` FROM `push_reminder_delivery`;--> statement-breakpoint
DROP TABLE `push_reminder_delivery`;--> statement-breakpoint
ALTER TABLE `__new_push_reminder_delivery` RENAME TO `push_reminder_delivery`;--> statement-breakpoint
ALTER TABLE `finance_account` ADD `closing_day` integer;
