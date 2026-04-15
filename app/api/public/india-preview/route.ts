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

export async function GET() {
  const indiaMarket = MARKETS.find(m => m.id === 'india');
  if (!indiaMarket) return NextResponse.json({ stocks: [] });

  try {
    // Fetch the last 2 daily candles for each instrument so we can compute change
    let latestFetchedAt: Date | null = null;

    const stocks: (PreviewStock | null)[] = await Promise.all(
      indiaMarket.instruments.map(async (inst) => {
        const { rows } = await tsPool.query<{ time: number; close: number; fetchedAt: Date }>(
          `SELECT time, close, "fetchedAt" FROM "Candle"
           WHERE market = 'india' AND symbol = $1 AND interval = '1d'
           ORDER BY time DESC LIMIT 2`,
          [inst.code],
        );

        if (rows.length === 0) return null;

        const latest = rows[0];
        const prev   = rows[1] ?? rows[0];
        const price  = latest.close;
        const change = price - prev.close;
        const pct    = prev.close > 0 ? (change / prev.close) * 100 : 0;

        if (!latestFetchedAt || latest.fetchedAt > latestFetchedAt) {
          latestFetchedAt = latest.fetchedAt;
        }

        return { symbol: inst.label, name: inst.name, price, change, pct };
      }),
    );

    const valid = stocks.filter(Boolean) as PreviewStock[];

    return NextResponse.json(
      { stocks: valid, fetchedAt: latestFetchedAt ?? new Date() },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    console.error('[india-preview] DB error:', e);
    return NextResponse.json({ stocks: [] }, { status: 500 });
  }
}
