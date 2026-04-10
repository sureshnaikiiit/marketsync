'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  createChart,
  CandlestickSeries,
  TickMarkType,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type Time,
  type MouseEventParams,
} from 'lightweight-charts';

const INTERVALS_ALLTICK = ['1m', '5m', '15m', '30m', '1h', '1d'] as const;
const INTERVALS_INDIA   = ['1m', '5m', '15m', '30m', '1h', '1d'] as const;
const PERIODS           = ['1w', '1m', '3m', '6m', '1y'] as const;
type Period = typeof PERIODS[number];

interface Props {
  provider: 'alltick' | 'upstox';
  /** Market ID passed to the kline API as the DB partition key (e.g. 'us', 'hk') */
  market: string;
  /** Override the default interval buttons — use to restrict unsupported intervals per market */
  intervals?: string[];
  code: string;
  label: string;
  name: string;
  currencySymbol: string;
  timezone: string;       // IANA timezone for x-axis & crosshair display
  livePrice?: number | null;
  onClose: () => void;
}

/** Build timezone-aware formatters for the chart */
function makeTimeFormatters(timezone: string) {
  const fmt = (ts: number, opts: Intl.DateTimeFormatOptions) =>
    new Date(ts * 1000).toLocaleString('en', { timeZone: timezone, ...opts });

  const timeFormatter = (time: Time): string => {
    if (typeof time !== 'number') return String(time);
    return fmt(time, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const tickMarkFormatter = (time: Time, type: TickMarkType): string => {
    if (typeof time !== 'number') return String(time);
    switch (type) {
      case TickMarkType.Year:          return fmt(time, { year: 'numeric' });
      case TickMarkType.Month:         return fmt(time, { month: 'short', year: 'numeric' });
      case TickMarkType.DayOfMonth:    return fmt(time, { month: 'short', day: 'numeric' });
      case TickMarkType.Time:          return fmt(time, { hour: '2-digit', minute: '2-digit', hour12: false });
      case TickMarkType.TimeWithSeconds: return fmt(time, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      default:                         return fmt(time, { hour: '2-digit', minute: '2-digit', hour12: false });
    }
  };

  return { timeFormatter, tickMarkFormatter };
}

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface OhlcDisplay {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function toCandlestickData(c: Candle): CandlestickData<Time> {
  return { time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close };
}

function fmtPrice(v: number, currencySymbol: string) {
  return currencySymbol + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 });
}

function fmtVol(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(1)}K`;
  return v.toFixed(0);
}

export default function CandleChartModal({ provider, market, intervals: intervalsProp, code, label, name, currencySymbol, timezone, livePrice, onClose }: Props) {
  const defaultIntervals = (provider === 'alltick' ? INTERVALS_ALLTICK : INTERVALS_INDIA) as readonly string[];
  const intervals        = intervalsProp ?? defaultIntervals;
  const defaultInterval  = intervals.includes('5m') ? '5m' : intervals[intervals.length - 1] ?? '1m';

  const [interval, setInterval]     = useState<string>(defaultInterval);
  const [period, setPeriod]         = useState<Period | null>(null);
  const [periodOpen, setPeriodOpen] = useState(false);
  const [candles, setCandles]       = useState<Candle[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [ohlc, setOhlc]             = useState<OhlcDisplay | null>(null);

  const containerRef   = useRef<HTMLDivElement>(null);
  const chartRef       = useRef<IChartApi | null>(null);
  const seriesRef      = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const lastCandleRef  = useRef<Candle | null>(null);
  const periodMenuRef  = useRef<HTMLDivElement>(null);

  // ── Create chart once ──────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const { timeFormatter, tickMarkFormatter } = makeTimeFormatters(timezone);

    const chart = createChart(containerRef.current, {
      width:  containerRef.current.clientWidth,
      height: 420,
      layout: {
        background: { color: '#09090b' },
        textColor:  '#a1a1aa',
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.04)' },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      crosshair: { mode: 1 },
      localization: { timeFormatter },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.08)' },
      timeScale: {
        borderColor:      'rgba(255,255,255,0.08)',
        timeVisible:      true,
        secondsVisible:   false,
        tickMarkFormatter,
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor:         '#34d399',
      downColor:       '#f87171',
      borderUpColor:   '#34d399',
      borderDownColor: '#f87171',
      wickUpColor:     '#34d399',
      wickDownColor:   '#f87171',
    });

    chartRef.current  = chart;
    seriesRef.current = series;

    // ── OHLC legend via crosshair ──────────────────────────────
    chart.subscribeCrosshairMove((params: MouseEventParams<Time>) => {
      if (!seriesRef.current) return;
      const bar = params.seriesData?.get(seriesRef.current) as CandlestickData<Time> | undefined;
      if (bar && 'open' in bar) {
        const t = typeof bar.time === 'number' ? bar.time : 0;
        const match = lastCandleRef.current?.time === t ? lastCandleRef.current : null;
        setOhlc({ open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: match?.volume ?? 0 });
      } else if (!params.point) {
        if (lastCandleRef.current) {
          const lc = lastCandleRef.current;
          setOhlc({ open: lc.open, high: lc.high, low: lc.low, close: lc.close, volume: lc.volume });
        }
      }
    });

    const ro = new ResizeObserver(() => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current  = null;
      seriesRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Close period dropdown on outside click ─────────────────────
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (periodMenuRef.current && !periodMenuRef.current.contains(e.target as Node)) {
        setPeriodOpen(false);
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  // ── Fetch candles ──────────────────────────────────────────────
  const fetchCandles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const periodParam = period ? `&period=${period}` : '';
      const url = provider === 'alltick'
        ? `/api/us/kline?code=${encodeURIComponent(code)}&interval=${interval}&limit=300&market=${market}${periodParam}`
        : `/api/india/kline?instrumentKey=${encodeURIComponent(code)}&interval=${interval}${periodParam}`;

      const res  = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      const data: Candle[] = json?.candles ?? [];
      setCandles(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load candles');
    } finally {
      setLoading(false);
    }
  }, [provider, code, interval, period]);

  useEffect(() => { fetchCandles(); }, [fetchCandles]);

  // Reset interval and period when code/provider changes
  useEffect(() => {
    setInterval(defaultInterval);
    setPeriod(null);
  }, [provider, code]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Feed candles to chart ──────────────────────────────────────
  useEffect(() => {
    if (!seriesRef.current) return;
    if (candles.length === 0) {
      seriesRef.current.setData([]);
      lastCandleRef.current = null;
      setOhlc(null);
      return;
    }

    const seen = new Set<number>();
    const pts  = candles
      .filter(c => { if (seen.has(c.time)) return false; seen.add(c.time); return true; })
      .sort((a, b) => a.time - b.time);

    lastCandleRef.current = pts[pts.length - 1] ?? null;
    seriesRef.current.setData(pts.map(toCandlestickData));
    chartRef.current?.timeScale().fitContent();

    const lc = lastCandleRef.current;
    if (lc) setOhlc({ open: lc.open, high: lc.high, low: lc.low, close: lc.close, volume: lc.volume });
  }, [candles]);

  // ── Live price → update last candle ───────────────────────────
  useEffect(() => {
    if (!seriesRef.current || livePrice == null || lastCandleRef.current === null) return;
    const last    = lastCandleRef.current;
    const updated = { ...last, high: Math.max(last.high, livePrice), low: Math.min(last.low, livePrice), close: livePrice };
    lastCandleRef.current = updated;
    seriesRef.current.update(toCandlestickData(updated));
    setOhlc(o => o ? { ...o, high: Math.max(o.high, livePrice), low: Math.min(o.low, livePrice), close: livePrice } : o);
  }, [livePrice]);

  // ── ESC key ────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isUp = ohlc ? ohlc.close >= ohlc.open : true;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl mx-4 rounded-2xl border border-white/[0.08] bg-zinc-950 shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div>
              <span className="font-mono font-bold text-white text-lg">{label}</span>
              <span className="ml-2 text-zinc-500 text-sm">{name}</span>
            </div>
            {livePrice != null && (
              <span className="font-mono text-sm text-emerald-400 tabular-nums">
                {fmtPrice(livePrice, currencySymbol)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Interval buttons */}
            <div className="flex gap-1 p-1 rounded-lg bg-white/[0.04]">
              {intervals.map(iv => (
                <button
                  key={iv}
                  onClick={() => setInterval(iv)}
                  className={`px-2.5 py-1 rounded text-xs font-mono font-semibold transition-colors ${
                    interval === iv ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {iv}
                </button>
              ))}
            </div>

            {/* Divider */}
            <div className="w-px h-5 bg-white/[0.08]" />

            {/* Period dropdown */}
            <div ref={periodMenuRef} className="relative">
              <button
                onClick={() => setPeriodOpen(o => !o)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-mono font-semibold transition-colors ${
                  period
                    ? 'bg-white/10 text-white'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {period ? period.toUpperCase() : 'All'}
                <svg
                  className={`w-3 h-3 transition-transform ${periodOpen ? 'rotate-180' : ''}`}
                  viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="1.5"
                >
                  <path d="M1 1l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {periodOpen && (
                <div className="absolute right-0 top-full mt-1.5 z-30 min-w-[80px] rounded-xl border border-white/[0.08] bg-zinc-900 shadow-2xl overflow-hidden">
                  {([null, ...PERIODS] as (Period | null)[]).map(p => (
                    <button
                      key={p ?? 'all'}
                      onClick={() => { setPeriod(p); setPeriodOpen(false); }}
                      className={`block w-full px-4 py-2 text-left text-xs font-mono font-semibold transition-colors ${
                        period === p
                          ? 'bg-white/10 text-white'
                          : 'text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-100'
                      }`}
                    >
                      {p ? p.toUpperCase() : 'All'}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Close */}
            <button
              onClick={onClose}
              aria-label="Close"
              className="flex items-center justify-center w-7 h-7 rounded-full text-zinc-500 hover:text-white hover:bg-white/10 transition-colors text-sm"
            >
              ✕
            </button>
          </div>
        </div>

        {/* ── Chart area ── */}
        <div className="relative">
          {/* OHLC legend — top-left overlay inside chart */}
          {ohlc && !loading && (
            <div className="absolute top-3 left-4 z-10 flex items-center gap-4 font-mono text-xs tabular-nums pointer-events-none select-none">
              <span className="text-zinc-500">
                O <span className="text-white">{fmtPrice(ohlc.open, currencySymbol)}</span>
              </span>
              <span className="text-zinc-500">
                H <span className="text-emerald-400">{fmtPrice(ohlc.high, currencySymbol)}</span>
              </span>
              <span className="text-zinc-500">
                L <span className="text-red-400">{fmtPrice(ohlc.low, currencySymbol)}</span>
              </span>
              <span className="text-zinc-500">
                C <span className={isUp ? 'text-emerald-400' : 'text-red-400'}>{fmtPrice(ohlc.close, currencySymbol)}</span>
              </span>
              {ohlc.volume > 0 && (
                <span className="text-zinc-500">
                  Vol <span className="text-zinc-300">{fmtVol(ohlc.volume)}</span>
                </span>
              )}
            </div>
          )}

          {/* Chart container — always mounted so lightweight-charts can attach */}
          <div ref={containerRef} className="w-full" />

          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-zinc-950">
              <div className="shimmer text-zinc-500 text-sm">Loading candles…</div>
            </div>
          )}

          {!loading && error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950 gap-2">
              <p className="text-red-400 text-sm">{error}</p>
              <button onClick={fetchCandles} className="text-xs text-zinc-400 underline hover:text-white">
                Retry
              </button>
            </div>
          )}

          {!loading && !error && candles.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center bg-zinc-950">
              <p className="text-zinc-500 text-sm">No candle data available for this interval</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
