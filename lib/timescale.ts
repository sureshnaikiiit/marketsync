import { Pool } from 'pg';

// Singleton — avoids creating multiple pools during Next.js hot reload
const globalForTs = globalThis as unknown as { tsPool?: Pool };

function createPool() {
  const url = process.env.TIMESCALE_URL;
  if (!url) throw new Error('TIMESCALE_URL environment variable is not set');
  return new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    max: 5,
  });
}

export const tsPool: Pool = globalForTs.tsPool ?? createPool();

if (process.env.NODE_ENV !== 'production') {
  globalForTs.tsPool = tsPool;
}

// ── Candle helpers ────────────────────────────────────────────────────────────

export interface Candle {
  time: number; open: number; high: number; low: number; close: number; volume: number;
}

/** Returns the fetchedAt timestamp of the most recently stored candle, or null. */
export async function getNewestFetchedAt(
  market: string, symbol: string, interval: string,
): Promise<Date | null> {
  const { rows } = await tsPool.query<{ fetchedAt: Date }>(
    `SELECT "fetchedAt" FROM "Candle"
     WHERE market = $1 AND symbol = $2 AND interval = $3
     ORDER BY "fetchedAt" DESC LIMIT 1`,
    [market, symbol, interval],
  );
  return rows[0]?.fetchedAt ?? null;
}

/** Reads candles from TimescaleDB ordered ascending. */
export async function readCandles(
  market: string, symbol: string, interval: string,
  limit: number, cutoffSec = 0,
): Promise<Candle[]> {
  const { rows } = await tsPool.query<Candle>(
    `SELECT time, open, high, low, close, volume FROM "Candle"
     WHERE market = $1 AND symbol = $2 AND interval = $3
       AND ($5::integer = 0 OR time >= $5)
     ORDER BY time DESC LIMIT $4`,
    [market, symbol, interval, limit, cutoffSec],
  );
  return rows.reverse();
}

/** Bulk-inserts candles into TimescaleDB, skipping duplicates. */
export async function writeCandles(
  market: string, symbol: string, interval: string, candles: Candle[],
): Promise<number> {
  if (candles.length === 0) return 0;

  const times   = candles.map(c => c.time);
  const opens   = candles.map(c => c.open);
  const highs   = candles.map(c => c.high);
  const lows    = candles.map(c => c.low);
  const closes  = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);

  const { rowCount } = await tsPool.query(
    `INSERT INTO "Candle" (market, symbol, interval, time, open, high, low, close, volume, "fetchedAt")
     SELECT $1::varchar, $2::text, $3::varchar,
            unnest($4::integer[]), unnest($5::float8[]), unnest($6::float8[]),
            unnest($7::float8[]), unnest($8::float8[]), unnest($9::float8[]),
            NOW()
     ON CONFLICT (market, symbol, interval, time) DO NOTHING`,
    [market, symbol, interval, times, opens, highs, lows, closes, volumes],
  );
  return rowCount ?? 0;
}
