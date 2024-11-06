CREATE TABLE IF NOT EXISTS "swaps_v2" (
	"id" serial PRIMARY KEY NOT NULL,
	"chain_id" integer NOT NULL,
	"transaction_hash" char(66) NOT NULL,
	"base_amount" varchar(256) DEFAULT '0' NOT NULL,
	"quote_amount" varchar(256) DEFAULT '0' NOT NULL,
	"fees" varchar(256) DEFAULT '0',
	"price" varchar(256) DEFAULT '0',
	"call_index" integer NOT NULL,
	"user" char(42) NOT NULL,
	"base_id" integer NOT NULL,
	"quote_id" integer NOT NULL,
	"pool_id" integer,
	"type" varchar(64),
	"block" integer NOT NULL,
	"tick_at" timestamp NOT NULL,
	"extra" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "swaps_idx_comb" UNIQUE("chain_id","transaction_hash","call_index")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "swaps_v2" ADD CONSTRAINT "swaps_v2_chain_id_chains_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."chains"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "swaps_v2" ADD CONSTRAINT "swaps_v2_base_id_tokens_id_fk" FOREIGN KEY ("base_id") REFERENCES "public"."tokens"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "swaps_v2" ADD CONSTRAINT "swaps_v2_quote_id_tokens_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."tokens"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "swaps_v2" ADD CONSTRAINT "swaps_v2_pool_id_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."pools"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
