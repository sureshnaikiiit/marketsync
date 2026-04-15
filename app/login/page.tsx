'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import MarketSyncLogo from '@/app/components/MarketSyncLogo';
import type { PreviewStock } from '@/app/api/public/india-preview/route';

const FALLBACK_STOCKS: PreviewStock[] = [
  { symbol: 'RELIANCE',  name: 'Reliance Industries', price: 0, change: 0, pct: 0 },
  { symbol: 'TCS',       name: 'Tata Consultancy',    price: 0, change: 0, pct: 0 },
  { symbol: 'INFY',      name: 'Infosys',             price: 0, change: 0, pct: 0 },
  { symbol: 'HDFCBANK',  name: 'HDFC Bank',           price: 0, change: 0, pct: 0 },
  { symbol: 'ICICIBANK', name: 'ICICI Bank',          price: 0, change: 0, pct: 0 },
  { symbol: 'WIPRO',     name: 'Wipro',               price: 0, change: 0, pct: 0 },
  { symbol: 'ITC',       name: 'ITC Limited',         price: 0, change: 0, pct: 0 },
  { symbol: 'SBIN',      name: 'State Bank of India', price: 0, change: 0, pct: 0 },
];

function fmt(n: number) {
  return Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ── Decorative SVG candlestick chart ── */
function DecorativeChart() {
  return (
    <svg viewBox="0 0 320 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full opacity-30">
      {/* Grid lines */}
      {[20, 50, 80].map(y => (
        <line key={y} x1="0" y1={y} x2="320" y2={y} stroke="white" strokeOpacity="0.08" strokeWidth="1"/>
      ))}
      {/* Area fill */}
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#10b981" stopOpacity="0.3"/>
          <stop offset="1" stopColor="#10b981" stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path
        d="M0 95 L30 88 L55 78 L80 82 L105 65 L130 70 L160 48 L185 55 L210 38 L240 42 L265 28 L290 20 L320 15 L320 120 L0 120 Z"
        fill="url(#areaGrad)"
      />
      {/* Line */}
      <path
        d="M0 95 L30 88 L55 78 L80 82 L105 65 L130 70 L160 48 L185 55 L210 38 L240 42 L265 28 L290 20 L320 15"
        stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      />
      {/* Candles */}
      {[
        { x: 30,  lo: 78,  hi: 95,  open: 90, close: 82 },
        { x: 80,  lo: 62,  hi: 85,  open: 82, close: 68 },
        { x: 130, lo: 55,  hi: 78,  open: 70, close: 60 },
        { x: 185, lo: 42,  hi: 62,  open: 60, close: 50 },
        { x: 240, lo: 28,  hi: 50,  open: 48, close: 38 },
        { x: 290, lo: 12,  hi: 35,  open: 30, close: 18 },
      ].map(c => (
        <g key={c.x}>
          <line x1={c.x} y1={c.lo} x2={c.x} y2={c.hi} stroke="white" strokeOpacity="0.4" strokeWidth="1.5"/>
          <rect
            x={c.x - 5} y={Math.min(c.open, c.close)}
            width={10} height={Math.abs(c.open - c.close) || 2}
            rx="1.5"
            fill={c.close < c.open ? '#10b981' : '#f87171'}
            fillOpacity="0.85"
          />
        </g>
      ))}
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [success,  setSuccess]  = useState(false);
  const [stocks,    setStocks]    = useState<PreviewStock[]>(FALLBACK_STOCKS);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/public/india-preview')
      .then(r => r.json())
      .then((d: { stocks: PreviewStock[]; fetchedAt?: string }) => {
        if (d.stocks?.length > 0) {
          setStocks(d.stocks);
          if (d.fetchedAt) setFetchedAt(d.fetchedAt);
        }
      })
      .catch(() => { /* keep fallback */ });
  }, []);

  const fetchedLabel = fetchedAt
    ? new Date(fetchedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata', hour12: false }) + ' IST'
    : null;

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
      setSuccess(true);
      setTimeout(() => { router.push('/india'); router.refresh(); }, 1400);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex relative" style={{ background: 'linear-gradient(135deg, #0a0f1e 0%, #0d1f12 60%, #071a2e 100%)' }}>

      {/* ── Success overlay ── */}
      {success && (
        <div className="success-overlay absolute inset-0 z-50 flex flex-col items-center justify-center gap-5"
          style={{ background: 'linear-gradient(135deg, #0a0f1e 0%, #0d1f12 60%, #071a2e 100%)' }}>
          <div className="success-icon flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/20 ring-4 ring-emerald-500/40">
            <svg className="w-10 h-10 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-xl font-bold text-white">Welcome back!</p>
            <p className="text-sm text-zinc-400 mt-1">Taking you to your dashboard…</p>
          </div>
          <div className="w-48 h-1 rounded-full bg-white/10 overflow-hidden">
            <div className="progress-bar h-full rounded-full bg-emerald-500" />
          </div>
        </div>
      )}

      {/* ══════════ LEFT — Market showcase ══════════ */}
      <div className="hidden lg:flex lg:flex-1 relative overflow-hidden flex-col p-8 gap-4"
        style={{ background: 'linear-gradient(135deg, #0a0f1e 0%, #0d1f12 60%, #071a2e 100%)' }}
      >
        {/* Background glow blobs */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute top-[-80px] left-[-80px] w-[400px] h-[400px] rounded-full bg-emerald-500/10 blur-[100px]" />
          <div className="absolute bottom-[-60px] right-[-60px] w-[350px] h-[350px] rounded-full bg-blue-600/10 blur-[100px]" />
        </div>

        {/* Logo + tagline */}
        <div className="relative z-10">
          <MarketSyncLogo size={36} showName className="mb-5" />
          <h1 className="text-3xl font-bold text-white leading-tight max-w-sm">
            Trade smarter.<br />
            <span className="text-emerald-400">Track everything.</span>
          </h1>
          <p className="mt-2 text-zinc-400 text-xs max-w-xs leading-relaxed">
            Real-time NSE, NYSE &amp; HKEX data · Paper trading · Portfolio tracking · Price alerts
          </p>
        </div>

        {/* NSE stock ticker table — fills remaining space */}
        <div className="relative z-10 flex flex-col flex-1 min-h-0">
          <div className="flex items-center gap-2 mb-2">
            <span className={`h-1.5 w-1.5 rounded-full ${fetchedLabel ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} />
            <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">
              NSE · {fetchedLabel ? `Updated ${fetchedLabel}` : 'Loading…'}
            </span>
          </div>

          <div className="rounded-xl border border-white/[0.07] overflow-hidden divide-y divide-white/[0.05] flex-1"
            style={{ background: 'rgba(255,255,255,0.03)' }}
          >
            {stocks.map(s => {
              const pos     = s.pct >= 0;
              const hasData = s.price > 0;
              return (
                <div key={s.symbol} className="flex items-center justify-between px-3 py-0" style={{ height: '11.5%' }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono font-bold text-white text-xs w-[88px] shrink-0">{s.symbol}</span>
                    <span className="text-zinc-400 text-[11px] truncate">{s.name}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {hasData ? (
                      <>
                        <span className="font-mono text-xs text-white tabular-nums">₹{fmt(s.price)}</span>
                        <span className={`font-mono text-xs tabular-nums font-semibold w-14 text-right ${pos ? 'text-emerald-400' : 'text-red-400'}`}>
                          {pos ? '+' : ''}{s.pct.toFixed(2)}%
                        </span>
                        <span className={`text-[11px] tabular-nums font-mono w-12 text-right ${pos ? 'text-emerald-500' : 'text-red-500'}`}>
                          {pos ? '+' : ''}{fmt(s.change)}
                        </span>
                      </>
                    ) : (
                      <span className="text-zinc-700 text-[11px] font-mono">—</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="mt-1.5 text-center text-zinc-700 text-[10px]">
            {fetchedLabel ? 'Refreshed every 5 minutes' : 'Fetching latest session data…'}
          </p>
        </div>
      </div>

      {/* ══════════ RIGHT — Login form ══════════ */}
      <div className="flex flex-1 lg:max-w-md xl:max-w-lg items-center justify-center p-8 lg:border-l border-white/[0.06]">
        <div className="w-full max-w-sm space-y-6">

          {/* Logo (shown only on mobile; desktop shows it in left panel) */}
          <div className="flex flex-col items-center gap-4 lg:hidden">
            <div className="drop-shadow-[0_0_22px_rgba(16,185,129,0.5)]">
              <MarketSyncLogo size={52} />
            </div>
          </div>

          <div className="space-y-1">
            <h2 className="text-2xl font-bold text-white">Welcome back</h2>
            <p className="text-zinc-500 text-sm">Sign in to your MarketSync account</p>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-zinc-900 p-6 space-y-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs text-zinc-400 mb-1.5 block">Email</label>
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  required autoFocus placeholder="you@example.com"
                  className="w-full rounded-lg bg-zinc-800 border border-white/[0.08] px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 transition-shadow"
                />
              </div>

              <div>
                <label className="text-xs text-zinc-400 mb-1.5 block">Password</label>
                <input
                  type="password" value={password} onChange={e => setPassword(e.target.value)}
                  required placeholder="••••••••"
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
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
            </form>
          </div>

          <p className="text-center text-sm text-zinc-500">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="text-emerald-400 hover:text-emerald-300 font-semibold transition-colors">
              Sign up free
            </Link>
          </p>

          {/* Feature pills */}
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            {['₹1,00,000 virtual balance', 'Live NSE data', 'Multi-market'].map(f => (
              <span key={f} className="text-[10px] text-zinc-600 border border-white/[0.06] rounded-full px-2.5 py-1">
                {f}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
