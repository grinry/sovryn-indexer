CREATE TABLE IF NOT EXISTS "bins" (
	"id" serial PRIMARY KEY NOT NULL,
	"bin_id" varchar NOT NULL,
	"liquidity" varchar,
	"price_x" varchar,
	"price_y" varchar,
	"total_supply" varchar,
	"reserve_x" varchar,
	"reserve_y" varchar,
	"tick_at" timestamp DEFAULT now(),
	"block" integer,
	"address" "char",
	"chain_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "bins_comb_pkey" UNIQUE("bin_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bins" ADD CONSTRAINT "bins_chain_id_chains_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."chains"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
