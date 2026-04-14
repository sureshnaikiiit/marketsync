'use client';

import { useEffect, useRef, useState } from 'react';
import { useUpstox, DEFAULT_INSTRUMENT_KEYS, INSTRUMENT_LABEL, NSE_INSTRUMENTS } from '@/lib/upstox-tick-data';
import type { UpstoxTick } from '@/lib/upstox-tick-data';
import MiniChart from './MiniChart';
import CandleChartModal from './CandleChartModalV2';

const NAME_MAP: Record<string, string> = Object.fromEntries(
  NSE_INSTRUMENTS.map(i => [i.key, i.name])
);

function fmt(p: number) {
  return p.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtVol(v: number) {
  if (v >= 10_000_000) return `${(v / 10_000_000).toFixed(1)}Cr`;
  if (v >= 100_000)    return `${(v / 100_000).toFixed(1)}L`;
  if (v >= 1_000)      return `${(v / 1_000).toFixed(0)}K`;
  return v.toString();
}
function formatTime(ms: number) {
  return new Date(ms).toLocaleTimeString('en-IN', { hour12: false, timeZone: 'Asia/Kolkata' });
}

function TickRow({ tick, prevLtp, history, onClick }: {
  tick: UpstoxTick;
  prevLtp: number | null;
  history: { time: number; value: number }[];
  onClick: () => void;
}) {
  const up   = prevLtp !== null && tick.ltp > prevLtp;
  const down = prevLtp !== null && tick.ltp < prevLtp;
  const label = INSTRUMENT_LABEL[tick.instrumentKey] ?? tick.instrumentKey;
  const name  = NAME_MAP[tick.instrumentKey] ?? '';
  const positive = tick.changePct >= 0;

  const changeCls = positive ? 'text-emerald-400' : 'text-red-400';
  const ltpCls    = up ? 'text-emerald-400' : down ? 'text-red-400' : 'text-white';

  return (
    <tr
      onClick={onClick}
      className={`group border-b border-white/[0.04] transition-colors cursor-pointer hover:bg-white/[0.03] ${up ? 'flash-up' : down ? 'flash-down' : ''}`}
    >
      {/* Symbol */}
      <td className="px-5 py-3">
        <div className="font-mono font-bold text-white text-sm">{label}</div>
        <div className="text-xs text-zinc-600 mt-0.5">{name}</div>
      </td>

      {/* LTP */}
      <td className={`px-4 py-3 font-mono tabular-nums text-right font-bold text-sm ${ltpCls}`}>
        ₹{fmt(tick.ltp)}
      </td>

      {/* Change % */}
      <td className={`px-4 py-3 font-mono tabular-nums text-right text-sm font-semibold ${changeCls}`}>
        <span className="inline-flex items-center gap-0.5">
          {positive ? '▲' : '▼'} {Math.abs(tick.changePct).toFixed(2)}%
        </span>
      </td>

      {/* Change abs */}
      <td className={`px-4 py-3 font-mono tabular-nums text-right text-sm ${changeCls}`}>
        {tick.change >= 0 ? '+' : ''}{fmt(tick.change)}
      </td>

      {/* Volume */}
      <td className="px-4 py-3 font-mono tabular-nums text-right text-zinc-500 text-xs">
        {fmtVol(tick.vtt)}
      </td>

      {/* Sparkline / chart icon */}
      <td className="px-4 py-3 w-32">
        {history.length >= 2
          ? <MiniChart data={history} positive={positive} />
          : (
            <div className="h-[52px] flex items-center justify-center rounded bg-white/[0.03] border border-white/[0.06] group-hover:border-zinc-600 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-zinc-600 group-hover:text-zinc-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 17l4-8 4 4 4-6 4 5" />
                <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth={1.2} />
              </svg>
            </div>
          )}
      </td>

      {/* Updated */}
      <td className="px-5 py-3 text-right text-zinc-600 text-xs font-mono">
        {formatTime(tick.tickTime)}
      </td>
    </tr>
  );
}

interface SelectedInstrument {
  key: string;
  label: string;
  name: string;
}

export default function IndiaWatchList() {
  const { ticks, isAuthenticated, status, subscribe, getHistory } = useUpstox();
  const prevLtps    = useRef<Record<string, number>>({});
  const lastChecked = useRef<Record<string, number>>({});
  const [selected, setSelected] = useState<SelectedInstrument | null>(null);

  useEffect(() => {
    if (isAuthenticated && status === 'connected') {
      subscribe(DEFAULT_INSTRUMENT_KEYS, 'full');
    }
  }, [isAuthenticated, status, subscribe]);

  // ── Alert check on every tick ────────────────────────────────────────────
  useEffect(() => {
    for (const key of DEFAULT_INSTRUMENT_KEYS) {
      const tick = ticks[key];
      if (!tick) continue;
      const price = tick.ltp;
      const prev  = lastChecked.current[key];
      if (prev !== undefined && Math.abs(price - prev) / prev < 0.0001) continue;
      lastChecked.current[key] = price;
      fetch('/api/alerts/check', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ symbol: key, market: 'india', price }),
      }).catch(() => {});
    }
  }, [ticks]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isAuthenticated) {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-6 py-20 text-center">
        <div className="text-3xl mb-4">🔌</div>
        <p className="text-zinc-300 text-sm font-medium mb-1">Connect your Upstox account</p>
        <p className="text-zinc-600 text-xs">Click "Connect" in the top-right corner to start streaming live NSE data</p>
      </div>
    );
  }

  if (status !== 'connected') {
    return (
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-6 py-20 text-center">
        <div className="shimmer text-zinc-500 text-sm">
          {status === 'connecting' ? 'Connecting to NSE feed…' : 'Reconnecting…'}
        </div>
      </div>
    );
  }

  const rows = DEFAULT_INSTRUMENT_KEYS
    .map(key => ticks[key])
    .filter((t): t is UpstoxTick => !!t);

  const livePrice = selected ? ticks[selected.key]?.ltp ?? null : null;

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] shadow-xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06]">
              {['Symbol', 'LTP (₹)', 'Change %', 'Change', 'Volume', 'Chart', 'Updated (IST)'].map((h, i) => (
                <th
                  key={h}
                  className={`px-${i === 0 || i === 6 ? 5 : 4} py-3 text-xs font-medium uppercase tracking-widest text-zinc-600 ${i === 0 ? 'text-left' : 'text-right'}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-16 text-center">
                  <div className="shimmer text-zinc-600 text-sm">Waiting for tick data…</div>
                  <div className="text-zinc-700 text-xs mt-1">NSE hours: 9:15 AM – 3:30 PM IST</div>
                </td>
              </tr>
            ) : (
              rows.map(tick => {
                const prev = prevLtps.current[tick.instrumentKey] ?? null;
                prevLtps.current[tick.instrumentKey] = tick.ltp;
                return (
                  <TickRow
                    key={tick.instrumentKey}
                    tick={tick}
                    prevLtp={prev}
                    history={getHistory(tick.instrumentKey)}
                    onClick={() => setSelected({
                      key:   tick.instrumentKey,
                      label: INSTRUMENT_LABEL[tick.instrumentKey] ?? tick.instrumentKey,
                      name:  NAME_MAP[tick.instrumentKey] ?? '',
                    })}
                  />
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <CandleChartModal
          provider="upstox"
          market="india"
          code={selected.key}
          label={selected.label}
          name={selected.name}
          currencySymbol="₹"
          timezone="Asia/Kolkata"
          livePrice={livePrice}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
