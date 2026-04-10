'use client';

import { useEffect, useRef, useState } from 'react';
import { useTickData } from '@/lib/tick-data';
import type { OrderBook } from '@/lib/tick-data';
import type { MarketConfig, Instrument } from '@/config/markets';
import { instrumentMap } from '@/config/markets';
import MiniChart from './MiniChart';
import CandleChartModal from './CandleChartModal';

function fmt(p: number) {
  return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
}
function fmtVol(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}K`;
  return v.toString();
}
function formatTime(ms: number, timezone: string) {
  return new Date(ms).toLocaleTimeString('en-US', { hour12: false, timeZone: timezone });
}

interface TickRowProps {
  book: OrderBook;
  instrument: Instrument;
  prevMid: number | null;
  history: { time: number; value: number }[];
  currencySymbol: string;
  timezone: string;
  onClick: () => void;
}

function TickRow({ book, instrument, prevMid, history, currencySymbol, timezone, onClick }: TickRowProps) {
  const bestBid = book.bids[0];
  const bestAsk = book.asks[0];
  const mid     = bestBid && bestAsk ? (bestBid.price + bestAsk.price) / 2 : null;
  const spread  = bestBid && bestAsk ? bestAsk.price - bestBid.price : null;
  const up      = mid !== null && prevMid !== null && mid > prevMid;
  const down    = mid !== null && prevMid !== null && mid < prevMid;

  return (
    <tr
      onClick={onClick}
      className={`group border-b border-white/[0.04] transition-colors cursor-pointer hover:bg-white/[0.03] ${
        up ? 'flash-up' : down ? 'flash-down' : ''
      }`}
    >
      {/* Symbol */}
      <td className="px-5 py-3">
        <div className="font-mono font-bold text-white text-sm">{instrument.label}</div>
        <div className="text-xs text-zinc-600 mt-0.5">{instrument.name}</div>
      </td>

      {/* Bid */}
      <td className="px-4 py-3 font-mono tabular-nums text-right">
        <div className="text-emerald-400 font-semibold text-sm">
          {bestBid ? `${currencySymbol}${fmt(bestBid.price)}` : '—'}
        </div>
        {bestBid && <div className="text-xs text-emerald-700 mt-0.5">{fmtVol(bestBid.volume)}</div>}
      </td>

      {/* Ask */}
      <td className="px-4 py-3 font-mono tabular-nums text-right">
        <div className="text-red-400 font-semibold text-sm">
          {bestAsk ? `${currencySymbol}${fmt(bestAsk.price)}` : '—'}
        </div>
        {bestAsk && <div className="text-xs text-red-700 mt-0.5">{fmtVol(bestAsk.volume)}</div>}
      </td>

      {/* Mid */}
      <td className={`px-4 py-3 font-mono tabular-nums text-right font-bold text-sm ${
        up ? 'text-emerald-400' : down ? 'text-red-400' : 'text-white'
      }`}>
        {mid !== null ? `${currencySymbol}${fmt(mid)}` : '—'}
      </td>

      {/* Spread */}
      <td className="px-4 py-3 font-mono tabular-nums text-right text-zinc-500 text-xs">
        {spread !== null ? spread.toFixed(3) : '—'}
      </td>

      {/* Sparkline */}
      <td className="px-4 py-3 w-32">
        {history.length >= 2
          ? <MiniChart data={history} positive={!down} />
          : <div className="h-[52px] shimmer rounded bg-white/5" />}
      </td>

      {/* Updated */}
      <td className="px-5 py-3 text-right text-zinc-600 text-xs font-mono">
        {formatTime(book.tickTime, timezone)}
      </td>
    </tr>
  );
}

interface SelectedSymbol {
  instrument: Instrument;
  livePrice: number | null;
}

interface Props {
  market: MarketConfig;
}

export default function WatchList({ market }: Props) {
  const { orderBooks, getHistory, subscribe } = useTickData();
  const prevMids  = useRef<Record<string, number>>({});
  const [selected, setSelected] = useState<SelectedSymbol | null>(null);

  const codes   = market.instruments.map(i => i.code);
  const iMap    = instrumentMap(market);

  useEffect(() => { subscribe(codes); }, [subscribe, codes.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = codes.map(code => orderBooks[code]).filter(Boolean);

  const livePrice = selected
    ? (() => {
        const book = orderBooks[selected.instrument.code];
        const b = book?.bids[0]; const a = book?.asks[0];
        return b && a ? (b.price + a.price) / 2 : null;
      })()
    : null;

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] shadow-xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06]">
              {['Symbol', 'Best Bid', 'Best Ask', 'Mid', 'Spread', 'Chart', 'Updated'].map((h, i) => (
                <th
                  key={h}
                  className={`px-${i === 0 || i === 6 ? 5 : 4} py-3 text-xs font-medium uppercase tracking-widest text-zinc-600 ${
                    i === 0 ? 'text-left' : 'text-right'
                  }`}
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
                  <div className="text-zinc-600 text-sm">Waiting for market data…</div>
                  <div className="text-zinc-700 text-xs mt-1">{market.name} hours: {market.hours}</div>
                </td>
              </tr>
            ) : (
              rows.map(book => {
                const instrument = iMap[book.code];
                if (!instrument) return null;
                const bestBid = book.bids[0];
                const bestAsk = book.asks[0];
                const mid     = bestBid && bestAsk ? (bestBid.price + bestAsk.price) / 2 : null;
                const prev    = prevMids.current[book.code] ?? null;
                if (mid !== null) prevMids.current[book.code] = mid;
                return (
                  <TickRow
                    key={book.code}
                    book={book}
                    instrument={instrument}
                    prevMid={prev}
                    history={getHistory(book.code)}
                    currencySymbol={market.currencySymbol}
                    timezone={market.timezone}
                    onClick={() => setSelected({ instrument, livePrice: mid })}
                  />
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <CandleChartModal
          provider="alltick"
          market={market.id}
          intervals={market.klineIntervals}
          code={selected.instrument.code}
          label={selected.instrument.label}
          name={selected.instrument.name}
          currencySymbol={market.currencySymbol}
          timezone={market.timezone}
          livePrice={livePrice}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
