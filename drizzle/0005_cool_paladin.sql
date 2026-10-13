CREATE TABLE `category_state` (
	`user_id` text PRIMARY KEY NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `category` ADD `budget_ars` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `category` ADD `budget_usd` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `category` ADD `version` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
INSERT INTO `category_state` (`user_id`) SELECT DISTINCT `user_id` FROM `category`;
