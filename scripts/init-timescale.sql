-- ─────────────────────────────────────────────────────────────────────────────
-- TimescaleDB — Candle table initialisation for MarketSync
-- Run this ONCE against your TigerData / TimescaleDB instance.
--
-- Usage:
--   psql "<TIMESCALE_URL>" -f scripts/init-timescale.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Enable the extension (TigerData/Timescale Cloud has it pre-installed)
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- 2. Create the Candle table
CREATE TABLE IF NOT EXISTS "Candle" (
  market    VARCHAR(10)      NOT NULL,
  symbol    TEXT             NOT NULL,
  interval  VARCHAR(10)      NOT NULL,
  time      INTEGER          NOT NULL,   -- Unix timestamp in seconds (partition key)
  open      DOUBLE PRECISION NOT NULL,
  high      DOUBLE PRECISION NOT NULL,
  low       DOUBLE PRECISION NOT NULL,
  close     DOUBLE PRECISION NOT NULL,
  volume    DOUBLE PRECISION NOT NULL,
  "fetchedAt" TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  PRIMARY KEY (market, symbol, interval, time)
);

-- 3. Integer "now" function — required for integer time columns
CREATE OR REPLACE FUNCTION unix_now()
RETURNS INTEGER LANGUAGE SQL STABLE AS $$
  SELECT EXTRACT(EPOCH FROM NOW())::INTEGER;
$$;

-- 4. Convert to hypertable partitioned by time (30-day chunks)
SELECT create_hypertable(
  '"Candle"',
  'time',
  chunk_time_interval => 2592000,   -- 30 days in seconds
  migrate_data        => TRUE,
  if_not_exists       => TRUE
);

-- 5. Register integer_now so retention/compression policies work
SELECT set_integer_now_func('"Candle"', 'unix_now', replace_if_exists => TRUE);

-- 6. Supporting index for symbol+interval range scans
CREATE INDEX IF NOT EXISTS "Candle_symbol_interval_time_idx"
  ON "Candle" (symbol, interval, time DESC);

-- 7. Enable chunk compression (compress chunks older than 7 days)
ALTER TABLE "Candle" SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'market, symbol, interval'
);
SELECT add_compression_policy('"Candle"', compress_after => 604800, if_not_exists => TRUE);

-- 8. Optional: auto-drop candle data older than 2 years
-- SELECT add_retention_policy('"Candle"', drop_after => 63072000, if_not_exists => TRUE);

-- ── Verify ────────────────────────────────────────────────────────────────────
SELECT hypertable_name, num_chunks
FROM timescaledb_information.hypertables
WHERE hypertable_name = 'Candle';
