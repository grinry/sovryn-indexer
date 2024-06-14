CREATE TABLE IF NOT EXISTS "chains" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" varchar(256) NOT NULL,
	"stablecoin_address" char(42) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" varchar(24),
	"name" varchar(256),
	"decimals" integer DEFAULT 18,
	"chain_id" integer NOT NULL,
	"address" varchar(64),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "chain_address_pkey" UNIQUE("chain_id","address")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "prices" (
	"id" serial PRIMARY KEY NOT NULL,
	"base_token_id" integer NOT NULL,
	"quote_token_id" integer NOT NULL,
	"value" varchar(256) DEFAULT '0' NOT NULL,
	"tick_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "prices_comb_pkey" UNIQUE("base_token_id","quote_token_id","tick_at")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tokens" ADD CONSTRAINT "tokens_chain_id_chains_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."chains"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "prices" ADD CONSTRAINT "prices_base_token_id_tokens_id_fk" FOREIGN KEY ("base_token_id") REFERENCES "public"."tokens"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "prices" ADD CONSTRAINT "prices_quote_token_id_tokens_id_fk" FOREIGN KEY ("quote_token_id") REFERENCES "public"."tokens"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
