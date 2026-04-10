import { type NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { fillLimitOrder } from '@/lib/trading';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const { id }  = await ctx.params;
  const body     = await request.json();
  const { action, fillPrice } = body;

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  if (action === 'cancel') {
    if (order.status !== 'PENDING') return NextResponse.json({ error: 'Only PENDING orders can be cancelled' }, { status: 422 });
    const updated = await prisma.order.update({ where: { id }, data: { status: 'CANCELLED' } });
    return NextResponse.json({ order: updated });
  }

  if (action === 'fill') {
    if (!fillPrice) return NextResponse.json({ error: 'fillPrice required' }, { status: 400 });
    try {
      await fillLimitOrder(id, Number(fillPrice));
      const updated = await prisma.order.findUnique({ where: { id } });
      return NextResponse.json({ order: updated });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 422 });
    }
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

export async function DELETE(_: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const order  = await prisma.order.findUnique({ where: { id } });
  if (!order)                  return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (order.status !== 'PENDING') return NextResponse.json({ error: 'Only PENDING orders can be deleted' }, { status: 422 });
  await prisma.order.update({ where: { id }, data: { status: 'CANCELLED' } });
  return NextResponse.json({ ok: true });
}
