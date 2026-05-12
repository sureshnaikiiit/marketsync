import { NextResponse } from 'next/server';
import { COOKIE_NAME } from '@/lib/auth';
import { apiHandler } from '@/lib/api-handler';

export const POST = apiHandler(async () => {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, '', {
    maxAge: 0,
    path: '/',
  });
  return res;
});