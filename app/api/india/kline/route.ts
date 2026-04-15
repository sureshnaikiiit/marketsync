import { type NextRequest, NextResponse } from 'next/server';
import { getNewestFetchedAt, readCandles, writeCandles } from '@/lib/timescale';
import { getDataMode } from '@/lib/data-mode';

const HISTORICAL_INTERVAL_MAP: Record<string, string> = {
  '1d':  'day',
  '1w':  'week',
  '1mo': 'month',
};

const INTRADAY_INTERVAL_MAP: Record<string, string> = {
  '1m':  '1minute',
  '5m':  '5minute',
  '15m': '15minute',
  '30m': '30minute',
  '1h':  '60minute',
};

const STALE_MS: Record<string, number> = {
  '1m':  1  * 60 * 1000,
  '5m':  5  * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h':  60 * 60 * 1000,
  '1d':  12 * 60 * 60 * 1000,
};

const PERIOD_MS: Record<string, number> = {
  '1w': 7   * 24 * 60 * 60 * 1000,
  '1m': 30  * 24 * 60 * 60 * 1000,
  '3m': 90  * 24 * 60 * 60 * 1000,
  '6m': 180 * 24 * 60 * 60 * 1000,
  '1y': 365 * 24 * 60 * 60 * 1000,
};

interface Candle {
  time: number; open: number; high: number; low: number; close: number; volume: number;
}

type UpstoxRawCandle = [string, number, number, number, number, number, number];

function toDate(d: Date) {
  return d.toISOString().split('T')[0];
}

async function fetchFromUpstox(instrumentKey: string, interval: string, period: string | null): Promise<Candle[]> {
  const token   = process.env.UPSTOX_ACCESS_TOKEN ?? '';
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  const encoded = encodeURIComponent(instrumentKey);

  let url: string;

  if (HISTORICAL_INTERVAL_MAP[interval]) {
    // Daily / weekly / monthly — always use historical with date range
    const unit      = HISTORICAL_INTERVAL_MAP[interval];
    const toDate_   = toDate(new Date());
    const fromDate  = toDate(new Date(Date.now() - (PERIOD_MS[period ?? '1y'] ?? PERIOD_MS['1y'])));
    url = `https://api.upstox.com/v2/historical-candle/${encoded}/${unit}/${toDate_}/${fromDate}`;
  } else if (INTRADAY_INTERVAL_MAP[interval]) {
    const unit = INTRADAY_INTERVAL_MAP[interval];
    if (period) {
      // Specific period requested — use historical endpoint with date range
      const toDate_  = toDate(new Date());
      const fromDate = toDate(new Date(Date.now() - PERIOD_MS[period]));
      url = `https://api.upstox.com/v2/historical-candle/${encoded}/${unit}/${toDate_}/${fromDate}`;
    } else {
      // No period — use intraday endpoint (today's session only)
      url = `https://api.upstox.com/v2/historical-candle/intraday/${encoded}/${unit}`;
    }
  } else {
    throw new Error(`Unsupported interval: ${interval}`);
  }

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upstox HTTP ${res.status}: ${text}`);
  }

  const raw = await res.json() as { status: string; data: { candles: UpstoxRawCandle[] } };
  if (raw.status !== 'success') throw new Error('Upstox returned error status');

  // Upstox returns newest-first → reverse to ascending
  return [...raw.data.candles].reverse().map(([ts, open, high, low, close, volume]) => ({
    time:   Math.floor(new Date(ts).getTime() / 1000),
    open, high, low, close, volume,
  }));
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const instrumentKey = searchParams.get('instrumentKey');
  const interval      = searchParams.get('interval') ?? '1d';
  const period        = searchParams.get('period') ?? null;

  if (!instrumentKey) {
    return NextResponse.json({ error: 'instrumentKey is required' }, { status: 400 });
  }

  const staleness  = STALE_MS[interval] ?? STALE_MS['1d'];
  const cutoffSec  = period ? Math.floor((Date.now() - PERIOD_MS[period]) / 1000) : 0;

  const dataMode = await getDataMode();

  // ── Check DB cache ────────────────────────────────────────────
  // Skip DB cache for intraday+period: cached data may only cover today,
  // but the period request needs multi-day historical data.
  const skipDbCache = !!(period && INTRADAY_INTERVAL_MAP[interval]);

  if (!skipDbCache) {
    try {
      const fetchedAt = await getNewestFetchedAt('india', instrumentKey, interval);
      const isFresh   = fetchedAt && (Date.now() - fetchedAt.getTime()) < staleness;

      if (isFresh) {
        const rows = await readCandles('india', instrumentKey, interval, 2000, cutoffSec);
        return NextResponse.json({ candles: rows, source: 'db', mode: dataMode });
      }
    } catch (e) {
      console.error('[India kline] DB read error:', e);
    }
  }

  // ── Fetch from Upstox ─────────────────────────────────────────
  let candles: Candle[];
  try {
    candles = await fetchFromUpstox(instrumentKey, interval, period);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }

  if (candles.length === 0) {
    return NextResponse.json({ candles: [] });
  }

  // ── Persist to TimescaleDB ────────────────────────────────────
  try {
    await writeCandles('india', instrumentKey, interval, candles);
  } catch (e) {
    console.error('[India kline] TimescaleDB write error:', e);
  }

  // ── db-first mode: read back from DB after writing ────────────
  if (dataMode === 'db-first' && !skipDbCache) {
    try {
      const rows = await readCandles('india', instrumentKey, interval, 2000, cutoffSec);
      if (rows.length > 0) {
        return NextResponse.json({ candles: rows, source: 'db', mode: dataMode });
      }
    } catch (e) {
      console.error('[India kline] DB read-back error (db-first mode):', e);
    }
  }

  const filtered = cutoffSec > 0 ? candles.filter(c => c.time >= cutoffSec) : candles;
  return NextResponse.json({ candles: filtered, source: 'live', mode: dataMode });
}
