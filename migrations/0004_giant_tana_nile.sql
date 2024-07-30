CREATE TABLE IF NOT EXISTS "swaps" (
	"id" serial PRIMARY KEY NOT NULL,
	"transactionHash" varchar,
	"chain_id" integer NOT NULL,
	"address" "char",
	"base_id" varchar NOT NULL,
	"quote_id" varchar NOT NULL,
	"pool_idx" varchar,
	"block" integer,
	"tick_at" timestamp DEFAULT now(),
	"is_buy" boolean,
	"is_base_qty" boolean,
	"qty" varchar,
	"limit_price" varchar,
	"min_out" varchar,
	"base_flow" varchar,
	"quote_flow" varchar,
	"call_index" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "swaps_comb_pkey" UNIQUE("base_id","quote_id","transactionHash","call_index")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "swaps" ADD CONSTRAINT "swaps_chain_id_chains_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."chains"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
