import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { signToken, COOKIE_NAME } from '@/lib/auth';
import { transporter } from '@/lib/mail';

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password)
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !user.passwordHash)
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid)
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });

    const token = await signToken({ sub: user.id, email: user.email, name: user.name });
    await transporter.sendMail({
        from: process.env.SMTP_USER,
        to: user.email,
        subject: 'MarketSync Login Successful!',
        html: `
          <h2>MarketSync Login Successful</h2>
          <p>Hello ${user.name || 'User'},</p>
          <p>Your account was logged in successfully.</p>
        `,
      });

    const res = NextResponse.json({ ok: true, user: { id: user.id, name: user.name, email: user.email } });
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });
    return res;
  } catch (e) {
    console.error('[login]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
