import { type NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const alert  = await prisma.priceAlert.findUnique({ where: { id } });
  if (!alert) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await prisma.priceAlert.update({ where: { id }, data: { status: 'CANCELLED' } });
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body   = await request.json();
  const alert  = await prisma.priceAlert.update({ where: { id }, data: body });
  return NextResponse.json({ alert });
}
