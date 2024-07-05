CREATE TABLE IF NOT EXISTS "legacy_tvls" (
	"id" serial PRIMARY KEY NOT NULL,
	"chain_id" integer NOT NULL,
	"date" timestamp NOT NULL,
	"group" varchar(64) NOT NULL,
	"pool" char(42) NOT NULL,
	"token_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"balance" numeric(50, 18) NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "ltvl__unq" UNIQUE("chain_id","date","group","pool","token_id")
);
--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "ignored" boolean DEFAULT false;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "legacy_tvls" ADD CONSTRAINT "legacy_tvls_chain_id_chains_id_fk" FOREIGN KEY ("chain_id") REFERENCES "public"."chains"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "legacy_tvls" ADD CONSTRAINT "legacy_tvls_token_id_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."tokens"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
