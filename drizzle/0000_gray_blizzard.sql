CREATE TABLE "events" (
	"id" text NOT NULL,
	"event" text NOT NULL,
	"space" text NOT NULL,
	"expire" bigint NOT NULL,
	CONSTRAINT "events_id_event_pk" PRIMARY KEY("id","event")
);
--> statement-breakpoint
CREATE TABLE "_metadatas" (
	"id" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscribers" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "subscribers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"owner" text NOT NULL,
	"url" text NOT NULL,
	"method" text DEFAULT 'POST' NOT NULL,
	"space" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created" bigint DEFAULT (extract(epoch from now()))::bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"guild" text NOT NULL,
	"channel" text NOT NULL,
	"space" text NOT NULL,
	"mention" text NOT NULL,
	"events" jsonb DEFAULT '["proposal/start"]'::jsonb NOT NULL,
	"created" bigint NOT NULL,
	"updated" bigint NOT NULL,
	CONSTRAINT "subscriptions_guild_channel_space_pk" PRIMARY KEY("guild","channel","space")
);
--> statement-breakpoint
CREATE TABLE "xmtp" (
	"address" text PRIMARY KEY NOT NULL,
	"status" boolean NOT NULL
);
--> statement-breakpoint
CREATE INDEX "events_expire_idx" ON "events" USING btree ("expire");--> statement-breakpoint
CREATE UNIQUE INDEX "subscribers_url_space_idx" ON "subscribers" USING btree ("url","space");--> statement-breakpoint
CREATE INDEX "subscribers_space_idx" ON "subscribers" USING btree ("space") WHERE "subscribers"."active";--> statement-breakpoint
CREATE INDEX "xmtp_status_idx" ON "xmtp" USING btree ("status");