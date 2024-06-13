CREATE TABLE IF NOT EXISTS "legacy_amm__pools" (
	"id" serial PRIMARY KEY NOT NULL,
	"chain_id" integer NOT NULL,
	"pool" char(42) NOT NULL,
	"token1_id" integer NOT NULL,
	"token2_id" integer NOT NULL,
	"token1_volume" numeric(50, 18) NOT NULL,
	"token2_volume" numeric(50, 18) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "lap__unq" UNIQUE("chain_id","pool")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "legacy_amm__pools" ADD CONSTRAINT "legacy_amm__pools_chain_id_chains_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."chains"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "legacy_amm__pools" ADD CONSTRAINT "legacy_amm__pools_token1_id_tokens_id_fk" FOREIGN KEY ("token1_id") REFERENCES "public"."tokens"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "legacy_amm__pools" ADD CONSTRAINT "legacy_amm__pools_token2_id_tokens_id_fk" FOREIGN KEY ("token2_id") REFERENCES "public"."tokens"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
