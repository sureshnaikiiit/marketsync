-- Drop existing primary key and unique constraint
ALTER TABLE "Candle" DROP CONSTRAINT IF EXISTS "Candle_pkey";
ALTER TABLE "Candle" DROP CONSTRAINT IF EXISTS "Candle_market_symbol_interval_time_key";
DROP INDEX IF EXISTS "Candle_market_symbol_interval_time_idx";

-- Drop the surrogate id column
ALTER TABLE "Candle" DROP COLUMN IF EXISTS "id";

-- Remove updatedAt behaviour (fetchedAt is now insert-only for hypertable rows)
ALTER TABLE "Candle" ALTER COLUMN "fetchedAt" SET DEFAULT now();

-- Add composite primary key (required by TimescaleDB: time must be in every unique constraint)
ALTER TABLE "Candle" ADD CONSTRAINT "Candle_pkey" PRIMARY KEY ("market", "symbol", "interval", "time");

-- Recreate supporting index
CREATE INDEX IF NOT EXISTS "Candle_symbol_interval_time_idx" ON "Candle" ("symbol", "interval", "time" DESC);
