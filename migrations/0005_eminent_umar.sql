CREATE TABLE IF NOT EXISTS "flags" (
	"key" varchar(32) PRIMARY KEY NOT NULL,
	"value" varchar(256),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
