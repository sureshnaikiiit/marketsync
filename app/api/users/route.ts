import { NextResponse } from 'next/server';
import { getOrCreateDemoUser, seedDemoData } from '@/lib/trading';

export async function GET() {
  const user = await getOrCreateDemoUser();
  return NextResponse.json(user);
}

export async function POST() {
  const user = await seedDemoData();
  return NextResponse.json(user);
}
