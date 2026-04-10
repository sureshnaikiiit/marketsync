'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { enabledMarkets } from '@/config/markets';

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
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-lg shadow-emerald-500/20">
              <span className="text-xs font-black text-white">M</span>
            </div>
            <span className="text-sm font-semibold tracking-tight text-white">MarketSync</span>
          </div>

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

        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
