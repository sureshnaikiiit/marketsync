'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CandlestickSeries,
  TickMarkType,
  createChart,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
} from 'lightweight-charts';

const INTERVALS_ALLTICK = ['1m', '5m', '15m', '30m', '1h', '1d'] as const;
const INTERVALS_INDIA = ['1m', '5m', '15m', '30m', '1h', '1d'] as const;
const PERIODS = ['1w', '1m', '3m', '6m', '1y'] as const;

type Period = typeof PERIODS[number];

interface Props {
  provider: 'alltick' | 'upstox';
  market: string;
  intervals?: string[];
  code: string;
  label: string;
  name: string;
  currencySymbol: string;
  timezone: string;
  livePrice?: number | null;
  onClose: () => void;
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

function makeTimeFormatters(timezone: string) {
  const fmt = (ts: number, opts: Intl.DateTimeFormatOptions) =>
    new Date(ts * 1000).toLocaleString('en', { timeZone: timezone, ...opts });

  const timeFormatter = (time: Time): string => {
    if (typeof time !== 'number') return String(time);
    return fmt(time, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  const tickMarkFormatter = (time: Time, type: TickMarkType): string => {
    if (typeof time !== 'number') return String(time);

    switch (type) {
      case TickMarkType.Year:
        return fmt(time, { year: 'numeric' });
      case TickMarkType.Month:
        return fmt(time, { month: 'short', year: 'numeric' });
      case TickMarkType.DayOfMonth:
        return fmt(time, { month: 'short', day: 'numeric' });
      case TickMarkType.Time:
        return fmt(time, { hour: '2-digit', minute: '2-digit', hour12: false });
      case TickMarkType.TimeWithSeconds:
        return fmt(time, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      default:
        return fmt(time, { hour: '2-digit', minute: '2-digit', hour12: false });
    }
  };

  return { timeFormatter, tickMarkFormatter };
}

function toCandlestickData(candle: Candle): CandlestickData<Time> {
  return {
    time: Math.floor(candle.time) as Time,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
  };
}

function normaliseCandles(candles: Candle[]): Candle[] {
  const seen = new Set<number>();

  return candles
    .map((candle) => ({ ...candle, time: Math.floor(candle.time) }))
    .filter((candle) => {
      if (seen.has(candle.time)) return false;
      seen.add(candle.time);
      return true;
    })
    .sort((a, b) => a.time - b.time);
}

function fmtPrice(value: number, currencySymbol: string) {
  return currencySymbol + value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  });
}

function fmtVol(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(0);
}

export default function CandleChartModalV2({
  provider,
  market,
  intervals: intervalsProp,
  code,
  label,
  name,
  currencySymbol,
  timezone,
  livePrice,
  onClose,
}: Props) {
  const defaultIntervals = (provider === 'alltick' ? INTERVALS_ALLTICK : INTERVALS_INDIA) as readonly string[];
  const intervals = intervalsProp ?? defaultIntervals;
  const defaultInterval = intervals.includes('5m') ? '5m' : intervals[intervals.length - 1] ?? '1m';

  const [interval, setInterval] = useState<string>(defaultInterval);
  const [period, setPeriod] = useState<Period | null>(null);
  const [periodOpen, setPeriodOpen] = useState(false);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ohlc, setOhlc] = useState<OhlcDisplay | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const lastCandleRef = useRef<Candle | null>(null);
  const periodMenuRef = useRef<HTMLDivElement>(null);
  const fetchSeqRef = useRef(0);

  const fetchCandles = useCallback(async () => {
    const fetchSeq = ++fetchSeqRef.current;
    setLoading(true);
    setError(null);

    try {
      const periodParam = period ? `&period=${period}` : '';
      const url = provider === 'alltick'
        ? `/api/us/kline?code=${encodeURIComponent(code)}&interval=${interval}&limit=300&market=${market}${periodParam}`
        : `/api/india/kline?instrumentKey=${encodeURIComponent(code)}&interval=${interval}${periodParam}`;

      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = await res.json();
      if (fetchSeq !== fetchSeqRef.current) return;

      setCandles(Array.isArray(json?.candles) ? json.candles : []);
    } catch (err) {
      if (fetchSeq !== fetchSeqRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to load candles');
      setCandles([]);
    } finally {
      if (fetchSeq === fetchSeqRef.current) {
        setLoading(false);
      }
    }
  }, [provider, market, code, interval, period]);

  useEffect(() => {
    fetchCandles();
  }, [fetchCandles]);

  useEffect(() => {
    setInterval(defaultInterval);
    setPeriod(null);
  }, [provider, code]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function onMouseDown(event: MouseEvent) {
      if (periodMenuRef.current && !periodMenuRef.current.contains(event.target as Node)) {
        setPeriodOpen(false);
      }
    }

    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const { timeFormatter, tickMarkFormatter } = makeTimeFormatters(timezone);
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 420,
      layout: {
        background: { color: '#09090b' },
        textColor: '#a1a1aa',
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.04)' },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      crosshair: { mode: 1 },
      localization: { timeFormatter },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.08)' },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.08)',
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter,
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#34d399',
      downColor: '#f87171',
      borderUpColor: '#34d399',
      borderDownColor: '#f87171',
      wickUpColor: '#34d399',
      wickDownColor: '#f87171',
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const pts = normaliseCandles(candles);
    if (pts.length === 0) {
      series.setData([]);
      lastCandleRef.current = null;
      setOhlc(null);
    } else {
      series.setData(pts.map(toCandlestickData));
      lastCandleRef.current = pts[pts.length - 1] ?? null;
      requestAnimationFrame(() => chart.timeScale().fitContent());

      const last = lastCandleRef.current;
      if (last) {
        setOhlc({
          open: last.open,
          high: last.high,
          low: last.low,
          close: last.close,
          volume: last.volume,
        });
      }
    }

    chart.subscribeCrosshairMove((params: MouseEventParams<Time>) => {
      const bar = params.seriesData?.get(series) as CandlestickData<Time> | undefined;
      if (bar && 'open' in bar) {
        const time = typeof bar.time === 'number' ? bar.time : 0;
        const match = lastCandleRef.current?.time === time ? lastCandleRef.current : null;
        setOhlc({
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: match?.volume ?? 0,
        });
      } else if (!params.point && lastCandleRef.current) {
        const last = lastCandleRef.current;
        setOhlc({
          open: last.open,
          high: last.high,
          low: last.low,
          close: last.close,
          volume: last.volume,
        });
      }
    });

    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [timezone, code, interval, period, candles]);

  useEffect(() => {
    if (!seriesRef.current || livePrice == null || lastCandleRef.current == null) return;

    const last = lastCandleRef.current;
    const updated = {
      ...last,
      high: Math.max(last.high, livePrice),
      low: Math.min(last.low, livePrice),
      close: livePrice,
    };

    lastCandleRef.current = updated;
    seriesRef.current.update(toCandlestickData(updated));
    setOhlc((current) => current
      ? {
          ...current,
          high: Math.max(current.high, livePrice),
          low: Math.min(current.low, livePrice),
          close: livePrice,
        }
      : current);
  }, [livePrice]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

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
        className="relative mx-4 w-full max-w-5xl overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-950 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
          <div className="flex items-center gap-3">
            <div>
              <span className="font-mono text-lg font-bold text-white">{label}</span>
              <span className="ml-2 text-sm text-zinc-500">{name}</span>
            </div>
            {livePrice != null && (
              <span className="font-mono text-sm tabular-nums text-emerald-400">
                {fmtPrice(livePrice, currencySymbol)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="flex gap-1 rounded-lg bg-white/[0.04] p-1">
              {intervals.map((iv) => (
                <button
                  key={iv}
                  onClick={() => setInterval(iv)}
                  className={`rounded px-2.5 py-1 text-xs font-mono font-semibold transition-colors ${
                    interval === iv ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {iv}
                </button>
              ))}
            </div>

            <div className="h-5 w-px bg-white/[0.08]" />

            <div ref={periodMenuRef} className="relative">
              <button
                onClick={() => setPeriodOpen((open) => !open)}
                className={`flex items-center gap-1 rounded px-2.5 py-1 text-xs font-mono font-semibold transition-colors ${
                  period ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {period ? period.toUpperCase() : 'All'}
                <svg
                  className={`h-3 w-3 transition-transform ${periodOpen ? 'rotate-180' : ''}`}
                  viewBox="0 0 10 6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M1 1l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {periodOpen && (
                <div className="absolute right-0 top-full z-30 mt-1.5 min-w-[80px] overflow-hidden rounded-xl border border-white/[0.08] bg-zinc-900 shadow-2xl">
                  {([null, ...PERIODS] as (Period | null)[]).map((value) => (
                    <button
                      key={value ?? 'all'}
                      onClick={() => {
                        setPeriod(value);
                        setPeriodOpen(false);
                      }}
                      className={`block w-full px-4 py-2 text-left text-xs font-mono font-semibold transition-colors ${
                        period === value
                          ? 'bg-white/10 text-white'
                          : 'text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-100'
                      }`}
                    >
                      {value ? value.toUpperCase() : 'All'}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={onClose}
              aria-label="Close"
              className="flex h-7 w-7 items-center justify-center rounded-full text-sm text-zinc-500 transition-colors hover:bg-white/10 hover:text-white"
            >
              x
            </button>
          </div>
        </div>

        <div className="relative">
          {ohlc && !loading && (
            <div className="pointer-events-none absolute left-4 top-3 z-10 flex select-none items-center gap-4 font-mono text-xs tabular-nums">
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

          <div ref={containerRef} className="h-[420px] w-full" />

          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-zinc-950">
              <div className="shimmer text-sm text-zinc-500">Loading candles...</div>
            </div>
          )}

          {!loading && error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-zinc-950">
              <p className="text-sm text-red-400">{error}</p>
              <button onClick={fetchCandles} className="text-xs text-zinc-400 underline hover:text-white">
                Retry
              </button>
            </div>
          )}

          {!loading && !error && candles.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center bg-zinc-950">
              <p className="text-sm text-zinc-500">No candle data available for this interval</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
