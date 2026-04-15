import { type NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserFromRequest, unauthorizedResponse } from '@/lib/session';
import { readCandles } from '@/lib/timescale';
import { MARKETS } from '@/config/markets';

export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) return unauthorizedResponse();

  // ── Positions ────────────────────────────────────────────────────────────
  const positions = await prisma.position.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: 'desc' },
  });

  // Build label→instrumentCode map for India positions stored with short labels
  const indiaMarket = MARKETS.find(m => m.id === 'india');
  const labelToCode: Record<string, string> = {};
  for (const inst of indiaMarket?.instruments ?? []) {
    labelToCode[inst.label] = inst.code;
  }

  // Resolve the canonical instrument code for a position
  function resolveCode(symbol: string, label: string): string {
    if (symbol.includes('|')) return symbol;
    return labelToCode[label] ?? labelToCode[symbol] ?? symbol;
  }

  // IST midnight (UTC+5:30) — used to skip today's in-progress partial candle
  const istOffsetMs   = 5.5 * 60 * 60 * 1000;
  const todayUnixSecs = Math.floor(
    (Math.floor((Date.now() + istOffsetMs) / 86_400_000) * 86_400_000 - istOffsetMs) / 1000,
  );

  // For each position, read the last completed daily candle close as the
  // baseline price. During market hours the client will overlay the live
  // WebSocket LTP on top of this; outside market hours this IS the price.
  const enriched = await Promise.all(positions.map(async (pos) => {
    let currentPrice = pos.avgCost;
    try {
      const code    = pos.market === 'india' ? resolveCode(pos.symbol, pos.label) : pos.symbol;
      const candles = await readCandles(pos.market, code, '1d', 2);
      // Prefer last completed candle (exclude today's in-progress partial)
      const completed = candles.filter(c => c.time < todayUnixSecs);
      const best = completed[completed.length - 1] ?? candles[candles.length - 1];
      if (best) currentPrice = best.close;
    } catch { /* fall back to avgCost */ }

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
  const totalMarketValue    = enriched.reduce((s, p) => s + p.marketValue, 0);
  const totalCostBasis      = enriched.reduce((s, p) => s + p.avgCost * p.quantity, 0);
  const totalUnrealizedPnl  = enriched.reduce((s, p) => s + p.unrealizedPnl, 0);
  const totalPortfolioValue = user.balance + totalMarketValue;

  return NextResponse.json({
    user: { id: user.id, name: user.name, balance: user.balance },
    summary: {
      cash:          user.balance,
      marketValue:   totalMarketValue,
      totalValue:    totalPortfolioValue,
      costBasis:     totalCostBasis,
      unrealizedPnl: totalUnrealizedPnl,
      realizedPnl:   totalRealizedPnl,
      totalPnl:      totalUnrealizedPnl + totalRealizedPnl,
    },
    positions: enriched,
    pnlEntries,
  });
}
