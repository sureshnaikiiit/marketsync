'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import MarketSyncLogo from '@/app/components/MarketSyncLogo';

const FEATURES = [
  { icon: '₹', title: '₹1,00,000 Virtual Balance', desc: 'Start paper trading instantly with no real money at risk.' },
  { icon: '📈', title: 'Live NSE · NYSE · HKEX',    desc: 'Real-time price feeds across three global exchanges.' },
  { icon: '🔔', title: 'Smart Price Alerts',         desc: 'Auto-execute trades when your target price is hit.' },
  { icon: '📊', title: 'Portfolio & P&L Tracking',   desc: 'Track unrealized gains and realized profits in real time.' },
];

export default function SignupPage() {
  const router = useRouter();
  const [name,     setName]     = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (password.length < 6)  { setError('Password must be at least 6 characters'); return; }
    setLoading(true);
    try {
      const res  = await fetch('/api/auth/signup', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Signup failed'); return; }
      router.push('/india');
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex bg-zinc-950">

      {/* ══════════ LEFT — Features showcase ══════════ */}
      <div className="hidden lg:flex lg:flex-1 relative overflow-hidden flex-col justify-between p-10"
        style={{ background: 'linear-gradient(135deg, #0a0f1e 0%, #0d1f12 60%, #071a2e 100%)' }}
      >
        {/* Background glow blobs */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute top-[-80px] left-[-80px] w-[400px] h-[400px] rounded-full bg-emerald-500/10 blur-[100px]" />
          <div className="absolute bottom-[-60px] right-[-60px] w-[350px] h-[350px] rounded-full bg-blue-600/10 blur-[100px]" />
        </div>

        {/* Top: Logo + headline */}
        <div className="relative z-10">
          <MarketSyncLogo size={40} showName className="mb-8" />
          <h1 className="text-4xl font-bold text-white leading-tight max-w-sm">
            Your trading<br />
            <span className="text-emerald-400">journey starts here.</span>
          </h1>
          <p className="mt-3 text-zinc-400 text-sm max-w-xs leading-relaxed">
            Practice with real market data across India, US, and Hong Kong — completely risk-free.
          </p>
        </div>

        {/* Feature cards */}
        <div className="relative z-10 space-y-3 my-6">
          {FEATURES.map(f => (
            <div key={f.title}
              className="flex items-start gap-4 rounded-xl border border-white/[0.06] px-4 py-3.5"
              style={{ background: 'rgba(255,255,255,0.03)' }}
            >
              <span className="text-xl mt-0.5 shrink-0">{f.icon}</span>
              <div>
                <p className="text-sm font-semibold text-white">{f.title}</p>
                <p className="text-xs text-zinc-500 mt-0.5">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom: Social proof / trust badge */}
        <div className="relative z-10">
          <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
            <div className="h-8 w-8 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-semibold text-emerald-400">Zero risk · Real experience</p>
              <p className="text-xs text-zinc-500">All trades use virtual money. No credit card required.</p>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════ RIGHT — Signup form ══════════ */}
      <div className="flex flex-1 lg:max-w-md xl:max-w-lg items-center justify-center p-8 lg:border-l border-white/[0.06]">
        <div className="w-full max-w-sm space-y-6">

          {/* Logo (mobile only) */}
          <div className="flex flex-col items-center gap-4 lg:hidden">
            <div className="drop-shadow-[0_0_22px_rgba(16,185,129,0.5)]">
              <MarketSyncLogo size={52} />
            </div>
          </div>

          <div className="space-y-1">
            <h2 className="text-2xl font-bold text-white">Create your account</h2>
            <p className="text-zinc-500 text-sm">Start paper trading with ₹1,00,000 instantly</p>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-zinc-900 p-6 space-y-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs text-zinc-400 mb-1.5 block">Full Name</label>
                <input
                  type="text" value={name} onChange={e => setName(e.target.value)}
                  required autoFocus placeholder="John Doe"
                  className="w-full rounded-lg bg-zinc-800 border border-white/[0.08] px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 transition-shadow"
                />
              </div>

              <div>
                <label className="text-xs text-zinc-400 mb-1.5 block">Email</label>
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  required placeholder="you@example.com"
                  className="w-full rounded-lg bg-zinc-800 border border-white/[0.08] px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 transition-shadow"
                />
              </div>

              <div>
                <label className="text-xs text-zinc-400 mb-1.5 block">Password</label>
                <input
                  type="password" value={password} onChange={e => setPassword(e.target.value)}
                  required placeholder="Min. 6 characters"
                  className="w-full rounded-lg bg-zinc-800 border border-white/[0.08] px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 transition-shadow"
                />
              </div>

              <div>
                <label className="text-xs text-zinc-400 mb-1.5 block">Confirm Password</label>
                <input
                  type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                  required placeholder="Re-enter password"
                  className="w-full rounded-lg bg-zinc-800 border border-white/[0.08] px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 transition-shadow"
                />
              </div>

              {error && (
                <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>
              )}

              <button
                type="submit" disabled={loading}
                className="w-full py-2.5 rounded-xl text-sm font-bold bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-white transition-colors disabled:opacity-50 mt-1"
              >
                {loading ? 'Creating account…' : 'Create Free Account'}
              </button>
            </form>
          </div>

          <p className="text-center text-sm text-zinc-500">
            Already have an account?{' '}
            <Link href="/login" className="text-emerald-400 hover:text-emerald-300 font-semibold transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
