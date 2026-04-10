import { type NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

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
  return Math.min(days * perDay, 1500);
}

interface Candle {
  time: number; open: number; high: number; low: number; close: number; volume: number;
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
  }).filter(c => c.time > 0 && c.open > 0);
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

  // ── Check DB cache (only when no period is active) ────────────
  // For period requests we always fetch from AllTick so the provider
  // returns exactly `limit` candles going back from now, rather than
  // serving a shorter cached slice that doesn't cover the full range.
  if (!period) {
    try {
      const newest = await prisma.candle.findFirst({
        where: { market, symbol: code, interval },
        orderBy: { fetchedAt: 'desc' },
        select: { fetchedAt: true },
      });

      const isFresh = newest && (Date.now() - newest.fetchedAt.getTime()) < staleness;

      if (isFresh) {
        const rows = await prisma.candle.findMany({
          where: { market, symbol: code, interval },
          orderBy: { time: 'asc' },
          take: limit,
          select: { time: true, open: true, high: true, low: true, close: true, volume: true },
        });
        return NextResponse.json({ candles: rows, source: 'db' });
      }
    } catch (e) {
      console.error('[US kline] DB read error:', e);
    }
  }

  // ── Fetch from AllTick ────────────────────────────────────────
  let candles: Candle[];
  try {
    candles = await fetchFromAlltick(code, interval, limit);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }

  if (candles.length === 0) {
    return NextResponse.json({ candles: [] });
  }

  // ── Persist to DB ─────────────────────────────────────────────
  try {
    const result = await prisma.candle.createMany({
      data: candles.map(c => ({ market, symbol: code, interval, ...c })),
      skipDuplicates: true,
    });
    console.log(`[${market.toUpperCase()} kline] Inserted ${result.count} new candles for ${code}/${interval}`);
  } catch (e) {
    console.error('[US kline] DB write error:', e);
  }

  // Filter by period cutoff before returning live data
  const filtered = cutoffSec > 0 ? candles.filter(c => c.time >= cutoffSec) : candles;
  return NextResponse.json({ candles: filtered, source: 'live' });
}
