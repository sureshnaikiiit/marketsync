import { type NextRequest, NextResponse } from 'next/server';
import { checkAlerts } from '@/lib/trading';

export async function POST(request: NextRequest) {
  const { symbol, market, price } = await request.json();
  if (!symbol || !market || price == null) {
    return NextResponse.json({ error: 'symbol, market and price required' }, { status: 400 });
  }
  const triggered = await checkAlerts(symbol, market, Number(price));
  return NextResponse.json({ triggered: triggered.length, alerts: triggered });
}
