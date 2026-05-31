ALTER TABLE `meal_groups` ADD `effective_from` text DEFAULT '2000-01-01' NOT NULL;--> statement-breakpoint
ALTER TABLE `meal_groups` ADD `removed_from` text;