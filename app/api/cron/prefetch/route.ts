import { NextRequest, NextResponse } from 'next/server';
import https from 'node:https';
import { MARKETS } from '@/config/markets';
import { writeCandles, type Candle } from '@/lib/timescale';

// Upstox uses a cert chain not trusted by all Node.js runtimes; bypass for outbound calls only
const upstoxAgent = new https.Agent({ rejectUnauthorized: false });

// ── Security: Vercel signs cron requests with this secret ────────────────────
function isAuthorised(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // dev: no secret configured → allow
  return auth === `Bearer ${secret}`;
}

// ── Upstox fetch (India) — daily historical only ─────────────────────────────
function httpsGet(url: string, headers: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    https.get({ hostname: u.hostname, path: u.pathname + u.search, headers, agent: upstoxAgent }, (res) => {
      let body = '';
      res.on('data', (chunk: string) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) reject(new Error(`Upstox ${res.statusCode}`));
        else resolve(body);
      });
    }).on('error', reject);
  });
}

async function fetchUpstox(instrumentKey: string): Promise<Candle[]> {
  const token   = process.env.UPSTOX_ACCESS_TOKEN ?? '';
  const encoded = encodeURIComponent(instrumentKey);
  const today   = new Date().toISOString().split('T')[0];
  const from    = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const url     = `https://api.upstox.com/v2/historical-candle/${encoded}/day/${today}/${from}`;

  const body = await httpsGet(url, { Authorization: `Bearer ${token}`, Accept: 'application/json' });
  const raw  = JSON.parse(body) as { status: string; data: { candles: [string, number, number, number, number, number][] } };
  if (raw.status !== 'success') throw new Error('Upstox error status');

  return [...raw.data.candles].reverse().map(([ts, open, high, low, close, volume]) => ({
    time: Math.floor(new Date(ts).getTime() / 1000),
    open, high, low, close, volume,
  }));
}

// ── AllTick fetch (US / HK) ──────────────────────────────────────────────────
async function fetchAlltick(code: string, interval: string, limit: number): Promise<Candle[]> {
  const token = process.env.NEXT_PUBLIC_ALLTICK_TOKEN ?? '';
  const INTERVAL_MAP: Record<string, number> = { '1m': 1, '5m': 5, '15m': 15, '1h': 60, '1d': 1440 };
  const klineType = INTERVAL_MAP[interval];
  if (!klineType) return [];

  const query = encodeURIComponent(JSON.stringify({
    trace: `cron-${Date.now()}`,
    data:  { code, kline_type: klineType, kline_timestamp_end: 0, query_kline_num: limit, adjust_type: 0 },
  }));

  const url = `https://quote.alltick.co/quote-stock-b-api/kline?token=${token}&query=${query}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`AllTick ${res.status}`);

  const json = await res.json();
  const list: Record<string, string>[] = json?.data?.kline_list ?? [];

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
  }).filter(c => c.time > 0 && c.open > 0).sort((a, b) => a.time - b.time);
}

// ── Main cron handler ────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (!isAuthorised(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const results: { market: string; code: string; interval: string; inserted: number; error?: string }[] = [];
  const started = Date.now();

  // Intervals to pre-fetch per provider
  // India: daily only — Upstox intraday is fetched live via the intraday endpoint
  const INDIA_INTERVALS  = ['1d'];
  const ALLTICK_INTERVALS: Record<string, string[]> = {
    us: ['1d', '1h', '5m'],
    hk: ['5m', '15m'],
  };
  const ALLTICK_LIMITS: Record<string, number> = {
    '1m': 390, '5m': 300, '15m': 200, '1h': 168, '1d': 365,
  };

  for (const market of MARKETS.filter(m => m.enabled)) {
    for (const instrument of market.instruments) {
      const intervals = market.provider === 'upstox'
        ? INDIA_INTERVALS
        : (ALLTICK_INTERVALS[market.id] ?? ['1d', '5m']);

      for (const interval of intervals) {
        try {
          let candles: Candle[] = [];

          if (market.provider === 'upstox') {
            candles = await fetchUpstox(instrument.code);
          } else {
            const limit = ALLTICK_LIMITS[interval] ?? 300;
            candles = await fetchAlltick(instrument.code, interval, limit);
          }

          const inserted = candles.length > 0
            ? await writeCandles(market.id, instrument.code, interval, candles)
            : 0;

          results.push({ market: market.id, code: instrument.label, interval, inserted });
          console.log(`[prefetch] ${market.id}/${instrument.label}/${interval} → ${inserted} rows`);
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          results.push({ market: market.id, code: instrument.label, interval, inserted: 0, error });
          console.error(`[prefetch] ${market.id}/${instrument.label}/${interval} failed:`, error);
        }

        // Small delay between API calls to avoid rate limiting
        await new Promise(r => setTimeout(r, 200));
      }
    }
  }

  const totalInserted = results.reduce((s, r) => s + r.inserted, 0);
  const errors = results.filter(r => r.error);

  return NextResponse.json({
    ok: true,
    durationMs: Date.now() - started,
    totalInserted,
    errorCount: errors.length,
    results,
  });
}
