'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { enabledMarkets } from '@/config/markets';
import MarketSyncLogo from './MarketSyncLogo';

const MARKET_TABS = enabledMarkets().map(m => ({
  href:  `/${m.id}`,
  label: `${m.flag} ${m.name}`,
}));

const TOOL_TABS = [
  { href: '/orders',    label: '📋 Orders'    },
  { href: '/portfolio', label: '📊 Portfolio' },
  { href: '/alerts',   label: '🔔 Alerts'    },
];

export default function NavBar({ actions }: { actions?: ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();
  const [initials, setInitials] = useState('');

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.name) {
          setInitials(
            d.name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)
          );
        }
      })
      .catch(() => {});
  }, []);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  function navLink(href: string, label: string) {
    const active = pathname.startsWith(href);
    return (
      <Link
        key={href}
        href={href}
        className={`relative rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all duration-150 ${
          active ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
        }`}
      >
        {active && <span className="absolute inset-0 rounded-lg bg-white/10" />}
        <span className="relative">{label}</span>
      </Link>
    );
  }

  return (
    <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-zinc-950/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        {/* Logo */}
        <div className="flex items-center gap-6">
          <MarketSyncLogo size={28} showName />

          {/* Market dashboards */}
          <nav className="flex items-center gap-0.5">
            {MARKET_TABS.map(t => navLink(t.href, t.label))}
          </nav>

          {/* Divider */}
          <div className="h-5 w-px bg-white/[0.08]" />

          {/* Trading tools */}
          <nav className="flex items-center gap-0.5">
            {TOOL_TABS.map(t => navLink(t.href, t.label))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {actions}
          {/* Profile avatar link */}
          <Link href="/profile"
            className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all ${
              pathname.startsWith('/profile')
                ? 'bg-emerald-500 text-white ring-2 ring-emerald-400/40'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white border border-white/[0.08]'
            }`}
            title="Profile"
          >
            {initials || '?'}
          </Link>
          <button onClick={logout}
            className="text-xs text-zinc-500 hover:text-zinc-300 px-3 py-1.5 rounded-lg border border-white/[0.06] hover:border-white/[0.12] transition-colors">
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
