CREATE TABLE IF NOT EXISTS "pools" (
	"id" serial PRIMARY KEY NOT NULL,
	"chain_id" integer NOT NULL,
	"type" varchar(64) NOT NULL,
	"identifier" varchar(256) NOT NULL,
	"base_id" integer NOT NULL,
	"quote_id" integer NOT NULL,
	"highlighted" boolean DEFAULT false,
	"price" varchar(256) DEFAULT '0',
	"fee" varchar(256) DEFAULT '0',
	"apr" varchar(256) DEFAULT '0',
	"base_liquidity" varchar(256) DEFAULT '0',
	"quote_liquidity" varchar(256) DEFAULT '0',
	"base_volume" varchar(256) DEFAULT '0',
	"quote_volume" varchar(256) DEFAULT '0',
	"daily_volume" varchar(256) DEFAULT '0',
	"daily_quote_volume" varchar(256) DEFAULT '0',
	"extra" jsonb DEFAULT '{}'::jsonb,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "pools_idx_comb" UNIQUE("chain_id","type","identifier"),
	CONSTRAINT "pools_search_comb" UNIQUE("chain_id","identifier")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pools" ADD CONSTRAINT "pools_chain_id_chains_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."chains"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pools" ADD CONSTRAINT "pools_base_id_tokens_id_fk" FOREIGN KEY ("base_id") REFERENCES "public"."tokens"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pools" ADD CONSTRAINT "pools_quote_id_tokens_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."tokens"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
