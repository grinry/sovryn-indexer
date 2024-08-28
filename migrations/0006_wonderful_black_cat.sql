ALTER TABLE "legacy_amm__apy_blocks" ALTER COLUMN "balance_btc" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "legacy_amm__apy_blocks" ALTER COLUMN "conversion_fee_btc" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "legacy_amm__apy_blocks" ALTER COLUMN "rewards_btc" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "legacy_amm__apy_days" ALTER COLUMN "balance_btc" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "legacy_amm__apy_days" ALTER COLUMN "btc_volume" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "legacy_amm__apy_blocks" ADD COLUMN "balance_usd" numeric(25, 18) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "legacy_amm__apy_blocks" ADD COLUMN "conversion_fee_usd" numeric(25, 18) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "legacy_amm__apy_blocks" ADD COLUMN "rewards_usd" numeric(25, 18) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "legacy_amm__apy_days" ADD COLUMN "balance_usd" numeric(25, 18) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "legacy_amm__apy_days" ADD COLUMN "usd_volume" numeric(25, 18) DEFAULT '0' NOT NULL;