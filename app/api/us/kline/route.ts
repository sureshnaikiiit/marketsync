import { type NextRequest, NextResponse } from 'next/server';
import { getNewestFetchedAt, readCandles, writeCandles, type Candle } from '@/lib/timescale';
import { getDataMode } from '@/lib/data-mode';

// AllTick kline_type codes (integers = minutes; daily = 1440)
const INTERVAL_MAP: Record<string, number> = {
  '1m':  1,
  '5m':  5,
  '15m': 15,
  '30m': 30,
  '1h':  60,
  '4h':  240,
  '1d':  1440,   // 1440 minutes = 1 day
};

const INTERVAL_MINUTES: Record<string, number> = {
  '1m':  1,
  '5m':  5,
  '15m': 15,
  '30m': 30,
  '1h':  60,
  '4h':  240,
  '1d':  1440,
};

const MAX_PROVIDER_CANDLES = 1500;

const FALLBACK_INTERVALS: Partial<Record<string, string[]>> = {
  '5m':  ['1m'],
  '15m': ['5m', '1m'],
  '30m': ['15m', '5m', '1m'],
  '1h':  ['15m', '5m', '1m'],
  '4h':  ['1h', '15m', '5m'],
  '1d':  ['1h', '15m', '5m'],
};

// How long cached data is considered fresh (ms)
const STALE_MS: Record<string, number> = {
  '1m':  1  * 60 * 1000,
  '5m':  5  * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h':  60 * 60 * 1000,
  '4h':  4  * 60 * 60 * 1000,
  '1d':  12 * 60 * 60 * 1000,
};

// Period → wall-clock ms (used to compute cutoff timestamp)
const PERIOD_MS: Record<string, number> = {
  '1w': 7   * 24 * 60 * 60 * 1000,
  '1m': 30  * 24 * 60 * 60 * 1000,
  '3m': 90  * 24 * 60 * 60 * 1000,
  '6m': 180 * 24 * 60 * 60 * 1000,
  '1y': 365 * 24 * 60 * 60 * 1000,
};

// Approximate trading days per period
const PERIOD_DAYS: Record<string, number> = {
  '1w': 5, '1m': 21, '3m': 63, '6m': 126, '1y': 252,
};

// Approximate candles per trading day by interval (US/HK ~6-6.5h sessions)
const CANDLES_PER_DAY: Record<string, number> = {
  '1m': 390, '5m': 78, '15m': 26, '30m': 13, '1h': 7, '4h': 2, '1d': 1,
};

function calcLimit(period: string | null, interval: string, defaultLimit: number): number {
  if (!period) return defaultLimit;
  const days   = PERIOD_DAYS[period]      ?? 21;
  const perDay = CANDLES_PER_DAY[interval] ?? 7;
  return Math.min(days * perDay, MAX_PROVIDER_CANDLES);
}


function calcFallbackLimit(targetLimit: number, targetInterval: string, sourceInterval: string): number {
  const targetMinutes = INTERVAL_MINUTES[targetInterval];
  const sourceMinutes = INTERVAL_MINUTES[sourceInterval];

  if (!targetMinutes || !sourceMinutes || sourceMinutes >= targetMinutes) {
    return targetLimit;
  }

  const ratio = Math.ceil(targetMinutes / sourceMinutes);
  return Math.min(targetLimit * ratio, MAX_PROVIDER_CANDLES);
}

function aggregateCandles(candles: Candle[], targetInterval: string, sourceInterval: string): Candle[] {
  const targetMinutes = INTERVAL_MINUTES[targetInterval];
  const sourceMinutes = INTERVAL_MINUTES[sourceInterval];

  if (!targetMinutes || !sourceMinutes || sourceMinutes >= targetMinutes) {
    return candles;
  }

  const bucketSizeSec = targetMinutes * 60;
  const buckets = new Map<number, Candle>();

  for (const candle of candles) {
    const bucketTime = Math.floor(candle.time / bucketSizeSec) * bucketSizeSec;
    const existing = buckets.get(bucketTime);

    if (!existing) {
      buckets.set(bucketTime, { ...candle, time: bucketTime });
      continue;
    }

    existing.high = Math.max(existing.high, candle.high);
    existing.low = Math.min(existing.low, candle.low);
    existing.close = candle.close;
    existing.volume += candle.volume;
  }

  return [...buckets.values()].sort((a, b) => a.time - b.time);
}

function hasExpectedCadence(candles: Candle[], interval: string): boolean {
  if (candles.length < 2) return candles.length > 0;

  const intervalMinutes = INTERVAL_MINUTES[interval];
  if (!intervalMinutes) return true;

  const expectedStepSec = intervalMinutes * 60;
  const deltas: number[] = [];

  for (let i = 1; i < candles.length; i += 1) {
    const delta = candles[i].time - candles[i - 1].time;
    if (delta <= 0) continue;

    // Ignore session breaks and weekend gaps; we only care about the in-session cadence.
    if (delta <= expectedStepSec * 6) {
      deltas.push(delta);
    }
  }

  if (deltas.length === 0) return false;

  deltas.sort((a, b) => a - b);
  const median = deltas[Math.floor(deltas.length / 2)];
  // Must be within ±50% of the expected cadence.
  // Without the lower bound, 1m data returned for a 15m request passes
  // (60 ≤ 900 × 1.5) and the fallback aggregation never triggers.
  return median >= expectedStepSec * 0.5 && median <= expectedStepSec * 1.5;
}

async function readCachedCandles(
  market: string,
  code: string,
  interval: string,
  limit: number,
  cutoffSec = 0,
): Promise<Candle[]> {
  const candles = await readCandles(market, code, interval, limit, cutoffSec);
  return hasExpectedCadence(candles, interval) ? candles : [];
}

async function fetchFromAlltick(code: string, interval: string, limit: number): Promise<Candle[]> {
  const token     = process.env.NEXT_PUBLIC_ALLTICK_TOKEN ?? '';
  const klineType = INTERVAL_MAP[interval] ?? 5;

  const query = encodeURIComponent(JSON.stringify({
    trace: `kline-${Date.now()}`,
    data: {
      code,
      kline_type:          klineType,
      kline_timestamp_end: 0,
      query_kline_num:     limit,
      adjust_type:         0,
    },
  }));

  const url = `https://quote.alltick.co/quote-stock-b-api/kline?token=${token}&query=${query}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`AllTick HTTP ${res.status}`);

  const json = await res.json();
  const list: Record<string, string>[] = json?.data?.kline_list ?? [];

  if (list.length === 0) {
    console.warn(`[AllTick kline] No candles for ${code}/${interval} kline_type=${klineType} ret=${json?.ret} msg=${json?.msg}`);
  }

  return list.map(k => {
    const ts = parseInt(k.timestamp, 10);
    return {
      time:   ts > 1e12 ? Math.floor(ts / 1000) : ts,
      open:   parseFloat(k.open_price),
      high:   parseFloat(k.high_price),
      low:    parseFloat(k.low_price),
      close:  parseFloat(k.close_price),
      volume: parseFloat(k.volume ?? '0'),
    };
  })
    .filter(c => c.time > 0 && c.open > 0)
    .sort((a, b) => a.time - b.time);
}

function getSourceIntervals(market: string, interval: string): string[] {
  if (market === 'hk' && interval === '5m') {
    return ['1m'];
  }

  if (market === 'hk' && interval === '15m') {
    return ['15m', '1m'];
  }

  return [interval, ...(FALLBACK_INTERVALS[interval] ?? [])];
}

async function fetchCandlesWithFallback(
  code: string,
  market: string,
  interval: string,
  limit: number,
): Promise<Candle[]> {
  for (const sourceInterval of getSourceIntervals(market, interval)) {
    try {
      const sourceLimit = sourceInterval === interval
        ? limit
        : calcFallbackLimit(limit, interval, sourceInterval);
      const sourceCandles = await fetchFromAlltick(code, sourceInterval, sourceLimit);
      if (sourceCandles.length === 0) continue;

      if (!hasExpectedCadence(sourceCandles, sourceInterval)) {
        console.warn(`[AllTick kline] Ignoring ${code}/${sourceInterval} because the returned cadence is too coarse`);
        continue;
      }

      if (sourceInterval === interval) {
        return sourceCandles;
      }

      const aggregated = aggregateCandles(sourceCandles, interval, sourceInterval);
      if (aggregated.length === 0) continue;
      if (!hasExpectedCadence(aggregated, interval)) continue;

      console.warn(`[AllTick kline] Falling back from ${interval} to ${sourceInterval} for ${code}`);
      return aggregated.slice(-limit);
    } catch (error) {
      const mode = sourceInterval === interval ? 'direct' : 'fallback';
      console.warn(`[AllTick kline] ${mode} ${sourceInterval} fetch failed for ${code}:`, error);
    }
  }

  return [];
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code     = searchParams.get('code');
  const interval = searchParams.get('interval') ?? '5m';
  const period   = searchParams.get('period') ?? null;
  const market   = searchParams.get('market') ?? 'us';   // 'us' | 'hk' | etc.
  const limit    = calcLimit(period, interval, parseInt(searchParams.get('limit') ?? '300', 10));

  if (!code) {
    return NextResponse.json({ error: 'code is required' }, { status: 400 });
  }

  const staleness  = STALE_MS[interval] ?? STALE_MS['5m'];
  const cutoffSec  = period ? Math.floor((Date.now() - PERIOD_MS[period]) / 1000) : 0;

  const dataMode = await getDataMode();

  // ── Check DB cache (only when no period is active) ────────────
  if (!period) {
    try {
      const fetchedAt = await getNewestFetchedAt(market, code, interval);
      const isFresh   = fetchedAt && (Date.now() - fetchedAt.getTime()) < staleness;

      if (isFresh) {
        const candles = await readCachedCandles(market, code, interval, limit);
        if (candles.length > 0) {
          return NextResponse.json({ candles, source: 'db', mode: dataMode });
        }
      }
    } catch (e) {
      console.error('[US kline] DB read error:', e);
    }
  }

  // ── Fetch from AllTick ────────────────────────────────────────
  let candles: Candle[];
  try {
    candles = await fetchCandlesWithFallback(code, market, interval, limit);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }

  if (candles.length === 0) {
    try {
      const cachedCandles = await readCachedCandles(market, code, interval, limit, cutoffSec);
      if (cachedCandles.length > 0) {
        return NextResponse.json({ candles: cachedCandles, source: 'db-fallback', mode: dataMode });
      }
    } catch (e) {
      console.error('[US kline] DB fallback read error:', e);
    }

    return NextResponse.json({ candles: [] });
  }

  // ── Persist to TimescaleDB ────────────────────────────────────
  try {
    const count = await writeCandles(market, code, interval, candles);
    console.log(`[${market.toUpperCase()} kline] Inserted ${count} new candles for ${code}/${interval}`);
  } catch (e) {
    console.error('[US kline] TimescaleDB write error:', e);
  }

  // ── db-first mode: read back from DB after writing ────────────
  if (dataMode === 'db-first' && !period) {
    try {
      const rows = await readCachedCandles(market, code, interval, limit, cutoffSec);
      if (rows.length > 0) {
        return NextResponse.json({ candles: rows, source: 'db', mode: dataMode });
      }
    } catch (e) {
      console.error('[US kline] DB read-back error (db-first mode):', e);
    }
  }

  const filtered = cutoffSec > 0 ? candles.filter(c => c.time >= cutoffSec) : candles;
  return NextResponse.json({ candles: filtered, source: 'live', mode: dataMode });
}
