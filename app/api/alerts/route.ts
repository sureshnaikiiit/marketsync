import { type NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getOrCreateDemoUser } from '@/lib/trading';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const status = searchParams.get('status') ?? 'ACTIVE';
  const user   = await getOrCreateDemoUser();

  const alerts = await prisma.priceAlert.findMany({
    where:   { userId: user.id, ...(status !== 'all' ? { status } : {}) },
    orderBy: { createdAt: 'desc' },
    take:    200,
  });
  return NextResponse.json({ alerts });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { symbol, market, label, currencySymbol, condition, targetPrice, action, quantity } = body;

  if (!symbol || !condition || !targetPrice || !action) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  if (!['ABOVE', 'BELOW', 'EQUAL'].includes(condition)) return NextResponse.json({ error: 'Invalid condition' }, { status: 400 });
  if (!['NOTIFY', 'BUY', 'SELL'].includes(action)) return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  const user  = await getOrCreateDemoUser();
  const alert = await prisma.priceAlert.create({
    data: {
      userId: user.id, symbol, market, label, currencySymbol: currencySymbol ?? '$',
      condition, targetPrice: Number(targetPrice),
      action, quantity: quantity ? Number(quantity) : null,
    },
  });
  return NextResponse.json({ alert });
}
