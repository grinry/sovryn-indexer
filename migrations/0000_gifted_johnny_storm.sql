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
