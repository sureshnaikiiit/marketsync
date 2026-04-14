import { NextRequest, NextResponse } from 'next/server';
import { getDataMode, setDataMode, type DataMode } from '@/lib/data-mode';

export async function GET() {
  const mode = await getDataMode();
  return NextResponse.json({ mode });
}

export async function POST(req: NextRequest) {
  const { mode } = await req.json() as { mode: DataMode };
  if (mode !== 'cache-aside' && mode !== 'db-first') {
    return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });
  }
  await setDataMode(mode);
  return NextResponse.json({ mode });
}
