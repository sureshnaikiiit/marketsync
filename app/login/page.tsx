'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import MarketSyncLogo from '@/app/components/MarketSyncLogo';

export default function LoginPage() {
  const router = useRouter();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res  = await fetch('/api/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Login failed'); return; }
      router.push('/india');
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">

        {/* Logo */}
        <div className="flex flex-col items-center gap-4">
          <div className="drop-shadow-[0_0_22px_rgba(16,185,129,0.5)]">
            <MarketSyncLogo size={56} />
          </div>
          <div className="text-center space-y-1">
            <p className="text-2xl font-bold text-white tracking-tight">
              Market<span className="text-emerald-400">Sync</span>
            </p>
            <p className="text-zinc-500 text-sm">Sign in to your account</p>
          </div>
        </div>

        {/* Form */}
        <div className="rounded-2xl border border-white/[0.08] bg-zinc-900 p-6 space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs text-zinc-400 mb-1.5 block">Email</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                required autoFocus placeholder="you@example.com"
                className="w-full rounded-lg bg-zinc-800 border border-white/[0.08] px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
              />
            </div>

            <div>
              <label className="text-xs text-zinc-400 mb-1.5 block">Password</label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                required placeholder="••••••••"
                className="w-full rounded-lg bg-zinc-800 border border-white/[0.08] px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
              />
            </div>

            {error && (
              <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              type="submit" disabled={loading}
              className="w-full py-2.5 rounded-xl text-sm font-bold bg-emerald-500 hover:bg-emerald-400 text-white transition-colors disabled:opacity-50"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-zinc-500">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
