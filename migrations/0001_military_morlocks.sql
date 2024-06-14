CREATE TABLE IF NOT EXISTS "legacy_amm__apy_blocks" (
	"id" serial PRIMARY KEY NOT NULL,
	"chain_id" integer NOT NULL,
	"pool_token" char(42) NOT NULL,
	"pool" char(42) NOT NULL,
	"block" integer NOT NULL,
	"block_timestamp" timestamp NOT NULL,
	"balance_btc" numeric(25, 18) NOT NULL,
	"conversion_fee_btc" numeric(25, 18) NOT NULL,
	"rewards" numeric(25, 18) NOT NULL,
	"rewards_currency" varchar(64) NOT NULL,
	"rewards_btc" numeric(25, 18) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "lamab__unq" UNIQUE("chain_id","pool","block")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "legacy_amm__apy_days" (
	"id" serial PRIMARY KEY NOT NULL,
	"chain_id" integer NOT NULL,
	"date" timestamp NOT NULL,
	"pool_token" char(42) NOT NULL,
	"pool" char(42) NOT NULL,
	"balance_btc" numeric(25, 18) NOT NULL,
	"fee_apy" numeric(25, 18) NOT NULL,
	"rewards_apy" numeric(25, 18) NOT NULL,
	"total_apy" numeric(25, 18) NOT NULL,
	"btc_volume" numeric(25, 18) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "lamad__unq" UNIQUE("chain_id","date","pool_token")
);
--> statement-breakpoint
ALTER TABLE "tokens" ALTER COLUMN "address" SET DATA TYPE char(42);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "legacy_amm__apy_blocks" ADD CONSTRAINT "legacy_amm__apy_blocks_chain_id_chains_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."chains"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "legacy_amm__apy_days" ADD CONSTRAINT "legacy_amm__apy_days_chain_id_chains_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."chains"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
