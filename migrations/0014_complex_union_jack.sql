CREATE TABLE IF NOT EXISTS "pool-balance" (
	"id" serial PRIMARY KEY NOT NULL,
	"base_id" varchar NOT NULL,
	"quote_id" varchar NOT NULL,
	"ambient-liq" varchar,
	"user" char(42) NOT NULL,
	"time" varchar,
	"concLiq" varchar,
	"rewardLiq" varchar,
	"baseQty" varchar,
	"quoteQty" varchar,
	"aggregatedLiquidity" varchar,
	"aggregatedBaseFlow" varchar,
	"aggregatedQuoteFlow" varchar,
	"positionType" varchar,
	"bidTick" integer,
	"askTick" integer,
	"aprDuration" varchar,
	"aprPostLiq" varchar,
	"aprContributedLiq" varchar,
	"aprEst" varchar,
	"identifier" varchar,
	"chain_id" integer NOT NULL,
	"block" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "pool_balance_comb_pkey" UNIQUE("user","chain_id","identifier")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pool-balance" ADD CONSTRAINT "pool-balance_chain_id_chains_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."chains"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
