CREATE TABLE IF NOT EXISTS "prices_usd_daily" (
	"id" serial PRIMARY KEY NOT NULL,
	"token_id" integer NOT NULL,
	"value" varchar(256) DEFAULT '0' NOT NULL,
	"low" varchar(256) DEFAULT '0' NOT NULL,
	"high" varchar(256) DEFAULT '0' NOT NULL,
	"tick_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "prices_usd_daily_comb" UNIQUE("token_id","tick_at")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "prices_usd_hourly" (
	"id" serial PRIMARY KEY NOT NULL,
	"token_id" integer NOT NULL,
	"value" varchar(256) DEFAULT '0' NOT NULL,
	"low" varchar(256) DEFAULT '0' NOT NULL,
	"high" varchar(256) DEFAULT '0' NOT NULL,
	"tick_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "prices_usd_hourly_comb" UNIQUE("token_id","tick_at")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "prices_usd" (
	"id" serial PRIMARY KEY NOT NULL,
	"token_id" integer NOT NULL,
	"value" varchar(256) DEFAULT '0' NOT NULL,
	"low" varchar(256) DEFAULT '0' NOT NULL,
	"high" varchar(256) DEFAULT '0' NOT NULL,
	"tick_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "prices_usd_comb" UNIQUE("token_id","tick_at")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "prices_usd_daily" ADD CONSTRAINT "prices_usd_daily_token_id_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."tokens"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "prices_usd_hourly" ADD CONSTRAINT "prices_usd_hourly_token_id_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."tokens"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "prices_usd" ADD CONSTRAINT "prices_usd_token_id_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."tokens"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
