import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const userCount = await prisma.user.count();
    return NextResponse.json({ ok: true, userCount, dbUrl: process.env.DATABASE_URL ? 'set' : 'MISSING' });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e), dbUrl: process.env.DATABASE_URL ? 'set' : 'MISSING' }, { status: 500 });
  }
}
