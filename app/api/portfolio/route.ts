import https from 'node:https';
import { type NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserFromRequest, unauthorizedResponse } from '@/lib/session';
import { readCandles } from '@/lib/timescale';
import { MARKETS } from '@/config/markets';

// Reuse the same TLS-bypass agent as india-preview
const upstoxAgent = new https.Agent({ rejectUnauthorized: false });

/** Batch-fetch Last Traded Prices for India instruments from Upstox. */
function fetchUpstoxLtps(instrumentKeys: string[]): Promise<Record<string, number>> {
  const token = (process.env.UPSTOX_ACCESS_TOKEN ?? '').trim();
  if (!token || instrumentKeys.length === 0) return Promise.resolve({});

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

export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  // ── Positions ────────────────────────────────────────────────────────────
  const positions = await prisma.position.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: 'desc' },
  });

  // Batch-fetch live LTPs for ALL India instruments (covers positions
  // stored with either full instrument key or short label as symbol)
  const indiaMarket = MARKETS.find(m => m.id === 'india');
  const allIndiaKeys = indiaMarket?.instruments.map(i => i.code) ?? [];
  const indiaLtps = await fetchUpstoxLtps(allIndiaKeys);

  // Build label→LTP and label→instrumentCode maps for positions stored
  // with short labels (e.g. "SBIN") instead of full instrument keys
  const labelToLtp: Record<string, number> = {};
  const labelToCode: Record<string, string> = {};
  if (indiaMarket) {
    for (const inst of indiaMarket.instruments) {
      labelToCode[inst.label] = inst.code;
      const ltp = indiaLtps[inst.code];
      if (ltp) labelToLtp[inst.label] = ltp;
    }
  }

  // Resolve the canonical instrument code for an India position
  // (handles both full-key and short-label stored symbols)
  function resolveIndiaCode(pos: { symbol: string; label: string }): string {
    if (pos.symbol.includes('|')) return pos.symbol;           // already a full key
    return labelToCode[pos.label] ?? labelToCode[pos.symbol] ?? pos.symbol;
  }

  // For each position, use live LTP (India) or latest candle close (US/HK).
  // When market is closed (LTP empty), fall back to the candle cache so we
  // still show P&L vs the last known close rather than vs avgCost.
  const enriched = await Promise.all(positions.map(async (pos) => {
    let currentPrice = pos.avgCost;
    if (pos.market === 'india') {
      // 1. Try live LTP (works during market hours)
      const ltp = indiaLtps[pos.symbol] ?? labelToLtp[pos.label] ?? labelToLtp[pos.symbol];
      if (ltp) {
        currentPrice = ltp;
      } else {
        // 2. Market closed / token expired — use last candle close from cache
        try {
          const code = resolveIndiaCode(pos);
          const candles = await readCandles('india', code, '1d', 2);
          // Skip today's in-progress partial candle (same logic as india-preview)
          const istOffsetMs = 5.5 * 60 * 60 * 1000;
          const todayUnixSecs = Math.floor(
            (Math.floor((Date.now() + istOffsetMs) / 86_400_000) * 86_400_000 - istOffsetMs) / 1000,
          );
          const completed = candles.filter(c => c.time < todayUnixSecs);
          const best = completed[completed.length - 1] ?? candles[candles.length - 1];
          if (best) currentPrice = best.close;
        } catch { /* remain at avgCost */ }
      }
    } else {
      try {
        const candles = await readCandles(pos.market, pos.symbol, '1d', 1);
        if (candles.length > 0) currentPrice = candles[candles.length - 1].close;
      } catch { /* fall back to avgCost */ }
    }
    const marketValue   = currentPrice * pos.quantity;
    const costValue     = pos.avgCost  * pos.quantity;
    const unrealizedPnl = marketValue - costValue;
    const unrealizedPct = costValue > 0 ? (unrealizedPnl / costValue) * 100 : 0;

    return { ...pos, currentPrice, marketValue, unrealizedPnl, unrealizedPct };
  }));

  // ── Realized P&L ─────────────────────────────────────────────────────────
  const pnlEntries = await prisma.pnlEntry.findMany({
    where:   { userId: user.id },
    orderBy: { createdAt: 'desc' },
  });
  const totalRealizedPnl = pnlEntries.reduce((sum, e) => sum + e.realizedPnl, 0);

  // ── Summary ───────────────────────────────────────────────────────────────
  const totalMarketValue   = enriched.reduce((s, p) => s + p.marketValue, 0);
  const totalCostBasis     = enriched.reduce((s, p) => s + p.avgCost * p.quantity, 0);
  const totalUnrealizedPnl = enriched.reduce((s, p) => s + p.unrealizedPnl, 0);
  const totalPortfolioValue = user.balance + totalMarketValue;

  return NextResponse.json({
    user: { id: user.id, name: user.name, balance: user.balance },
    summary: {
      cash:              user.balance,
      marketValue:       totalMarketValue,
      totalValue:        totalPortfolioValue,
      costBasis:         totalCostBasis,
      unrealizedPnl:     totalUnrealizedPnl,
      realizedPnl:       totalRealizedPnl,
      totalPnl:          totalUnrealizedPnl + totalRealizedPnl,
    },
    positions: enriched,
    pnlEntries,
  });
}
