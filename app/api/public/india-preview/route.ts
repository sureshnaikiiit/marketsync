import https from 'node:https';
import { NextResponse } from 'next/server';
import { tsPool } from '@/lib/timescale';
import { MARKETS } from '@/config/markets';

export interface PreviewStock {
  symbol: string;
  name:   string;
  price:  number;
  change: number;
  pct:    number;
}

// Reuse the same TLS-bypass agent as the cron prefetch
const upstoxAgent = new https.Agent({ rejectUnauthorized: false });

/**
 * Batch-fetch the Last Traded Price for all given instrument keys.
 * Returns {} on any error (token expired, market closed, network issue).
 */
function fetchLtps(instrumentKeys: string[]): Promise<Record<string, number>> {
  const token = (process.env.UPSTOX_ACCESS_TOKEN ?? '').trim();
  if (!token) return Promise.resolve({});

  const keyParam = instrumentKeys.map(k => encodeURIComponent(k)).join('%2C');
  const url = `https://api.upstox.com/v2/market-quote/ltp?instrument_key=${keyParam}`;

  return new Promise((resolve) => {
    const u = new URL(url);
    https.get(
      {
        hostname: u.hostname,
        path:     u.pathname + u.search,
        headers:  { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        agent:    upstoxAgent,
        rejectUnauthorized: false,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk: string) => { body += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body) as {
              status: string;
              data: Record<string, { last_price: number }>;
            };
            if (parsed.status !== 'success') { resolve({}); return; }
            const result: Record<string, number> = {};
            for (const [key, val] of Object.entries(parsed.data)) {
              result[key] = val.last_price;
            }
            resolve(result);
          } catch { resolve({}); }
        });
      },
    ).on('error', () => resolve({}));
  });
}

export async function GET() {
  const indiaMarket = MARKETS.find(m => m.id === 'india');
  if (!indiaMarket) return NextResponse.json({ stocks: [] });

  try {
    // 1. Fetch live LTPs from Upstox (empty map if token expired / market closed)
    const ltps = await fetchLtps(indiaMarket.instruments.map(i => i.code));
    const isLive = Object.keys(ltps).length > 0;

    // Today's midnight in IST (UTC+5:30). Any candle with time >= this is
    // today's in-progress partial candle — must be excluded from prev-close base.
    const istOffsetMs   = 5.5 * 60 * 60 * 1000;
    const todayUnixSecs = Math.floor(
      (Math.floor((Date.now() + istOffsetMs) / 86_400_000) * 86_400_000 - istOffsetMs) / 1000,
    );

    // 2. Read the last 3 daily candles per instrument (extra row in case today's partial is present)
    const stocks: (PreviewStock | null)[] = await Promise.all(
      indiaMarket.instruments.map(async (inst) => {
        const { rows } = await tsPool.query<{ time: number; close: number }>(
          `SELECT time, close FROM "Candle"
           WHERE market = 'india' AND symbol = $1 AND interval = '1d'
           ORDER BY time DESC LIMIT 3`,
          [inst.code],
        );

        if (rows.length === 0) return null;

        // Skip today's partial candle (Upstox returns it during market hours
        // with close ≈ current LTP, which would make change = 0).
        const completedRows = rows.filter(r => r.time < todayUnixSecs);
        const prevDayRow  = completedRows[0] ?? rows[0]; // most recent completed day
        const dayBeforeRow = completedRows[1] ?? prevDayRow; // day before that

        // If live LTP available: price = LTP, change vs prev completed day's close
        // If market closed / token expired: price = prev day's close, change vs day-before
        const price  = ltps[inst.code] ?? prevDayRow.close;
        const base   = isLive ? prevDayRow.close : dayBeforeRow.close;
        const change = price - base;
        const pct    = base > 0 ? (change / base) * 100 : 0;

        return { symbol: inst.label, name: inst.name, price, change, pct };
      }),
    );

    const valid = stocks.filter(Boolean) as PreviewStock[];

    return NextResponse.json(
      {
        stocks:    valid,
        fetchedAt: new Date(),
        isLive,   // true = prices are today's LTP; false = yesterday's close
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    console.error('[india-preview] error:', e);
    return NextResponse.json({ stocks: [] }, { status: 500 });
  }
}
