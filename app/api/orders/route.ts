import { type NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { placeOrder, getOrCreateDemoUser } from '@/lib/trading';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const status = searchParams.get('status');
    const symbol = searchParams.get('symbol');
    const user   = await getOrCreateDemoUser();

    const orders = await prisma.order.findMany({
      where: {
        userId: user.id,
        ...(status && status !== 'all' ? { status } : {}),
        ...(symbol ? { symbol } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return NextResponse.json({ orders });
  } catch (e) {
    console.error('[GET /api/orders]', e);
    return NextResponse.json({ error: 'Internal server error', detail: String(e) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });

    const { symbol, market, label, currencySymbol, side, orderType, quantity, price, notes } = body;

    if (!symbol)    return NextResponse.json({ error: 'symbol is required' },    { status: 400 });
    if (!side)      return NextResponse.json({ error: 'side is required' },      { status: 400 });
    if (!orderType) return NextResponse.json({ error: 'orderType is required' }, { status: 400 });
    if (!quantity)  return NextResponse.json({ error: 'quantity is required' },  { status: 400 });
    if (!price && orderType === 'LIMIT') return NextResponse.json({ error: 'price is required for LIMIT orders' }, { status: 400 });

    if (!['BUY', 'SELL'].includes(side))         return NextResponse.json({ error: 'side must be BUY or SELL' },           { status: 400 });
    if (!['MARKET', 'LIMIT'].includes(orderType)) return NextResponse.json({ error: 'orderType must be MARKET or LIMIT' }, { status: 400 });

    const user = await getOrCreateDemoUser();

    const order = await placeOrder({
      userId:         user.id,
      symbol,
      market:         market  ?? 'us',
      label:          label   ?? symbol,
      currencySymbol: currencySymbol ?? '$',
      side,
      orderType,
      quantity: Number(quantity),
      price:    Number(price ?? 0),
      notes:    notes ?? undefined,
    });

    return NextResponse.json({ order });
  } catch (e) {
    console.error('[POST /api/orders]', e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 422 });
  }
}
