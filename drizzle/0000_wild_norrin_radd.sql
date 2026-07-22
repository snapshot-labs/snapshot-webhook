CREATE TABLE "events" (
	"id" varchar(256) NOT NULL,
	"event" varchar(64) NOT NULL,
	"space" varchar(256) NOT NULL,
	"expire" bigint NOT NULL,
	CONSTRAINT "events_id_event_pk" PRIMARY KEY("id","event")
);
--> statement-breakpoint
CREATE TABLE "_metadatas" (
	"id" varchar(20) PRIMARY KEY NOT NULL,
	"value" varchar(128) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscribers" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner" varchar(256) NOT NULL,
	"url" text NOT NULL,
	"method" varchar(5) DEFAULT 'POST' NOT NULL,
	"space" varchar(256) NOT NULL,
	"active" integer DEFAULT 1 NOT NULL,
	"created" bigint DEFAULT (extract(epoch from now()))::bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"guild" varchar(64) NOT NULL,
	"channel" varchar(64) NOT NULL,
	"space" varchar(256) NOT NULL,
	"mention" varchar(64) NOT NULL,
	"events" jsonb DEFAULT '["proposal/start"]'::jsonb NOT NULL,
	"created" varchar(64) NOT NULL,
	"updated" varchar(64) NOT NULL,
	CONSTRAINT "subscriptions_guild_channel_space_pk" PRIMARY KEY("guild","channel","space")
);
--> statement-breakpoint
CREATE TABLE "xmtp" (
	"address" varchar(256) PRIMARY KEY NOT NULL,
	"status" integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX "events_space_idx" ON "events" USING btree ("space");--> statement-breakpoint
CREATE INDEX "events_expire_idx" ON "events" USING btree ("expire");--> statement-breakpoint
CREATE UNIQUE INDEX "subscribers_url_space_idx" ON "subscribers" USING btree ("url","space");--> statement-breakpoint
CREATE INDEX "subscribers_owner_idx" ON "subscribers" USING btree ("owner");--> statement-breakpoint
CREATE INDEX "subscribers_space_idx" ON "subscribers" USING btree ("space");--> statement-breakpoint
CREATE INDEX "subscribers_active_idx" ON "subscribers" USING btree ("active");--> statement-breakpoint
CREATE INDEX "subscribers_created_idx" ON "subscribers" USING btree ("created");--> statement-breakpoint
CREATE INDEX "subscriptions_created_idx" ON "subscriptions" USING btree ("created");--> statement-breakpoint
CREATE INDEX "subscriptions_updated_idx" ON "subscriptions" USING btree ("updated");--> statement-breakpoint
CREATE INDEX "xmtp_status_idx" ON "xmtp" USING btree ("status");