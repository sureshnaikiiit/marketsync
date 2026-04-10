import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getOrCreateDemoUser } from '@/lib/trading';

export async function GET() {
  const user = await getOrCreateDemoUser();

  // ── Positions ────────────────────────────────────────────────────────────
  const positions = await prisma.position.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: 'desc' },
  });

  // For each position, grab the latest close price from candle cache
  const enriched = await Promise.all(positions.map(async (pos) => {
    const latest = await prisma.candle.findFirst({
      where:   { symbol: pos.symbol, market: pos.market },
      orderBy: { time: 'desc' },
      select:  { close: true, time: true },
    });
    const currentPrice  = latest?.close ?? pos.avgCost;
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
