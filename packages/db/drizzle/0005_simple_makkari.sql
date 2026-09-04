ALTER TABLE "campaigns" ADD COLUMN "invite_token" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_invite_token_unique" UNIQUE("invite_token");