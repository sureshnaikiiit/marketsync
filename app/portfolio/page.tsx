'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TableSkeleton from '@/app/components/TableSkeleton';
import NavBar from '@/app/components/NavBar';
import { MARKETS } from '@/config/markets';
import { useUpstox } from '@/lib/upstox-tick-data';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Position {
  id:             string;
  symbol:         string;
  market:         string;
  label:          string;
  currencySymbol: string;
  quantity:       number;
  avgCost:        number;
  currentPrice:   number;
  marketValue:    number;
  unrealizedPnl:  number;
  unrealizedPct:  number;
}

interface PnlEntry {
  id:          string;
  label:       string;
  symbol:      string;
  market:      string;
  quantity:    number;
  costBasis:   number;
  salePrice:   number;
  realizedPnl: number;
  createdAt:   string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number, cs = '$') {
  return cs + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function pnlClass(v: number) { return v >= 0 ? 'text-emerald-400' : 'text-red-400'; }
function pnlSign(v: number)  { return v >= 0 ? '+' : '-'; }
function pctStr(v: number)   { return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`; }

function SummaryCard({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: 'green' | 'red' | 'none' }) {
  const color = highlight === 'green' ? 'text-emerald-400' : highlight === 'red' ? 'text-red-400' : 'text-white';
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-zinc-900 p-5">
      <p className="text-xs text-zinc-400 font-medium mb-1 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-mono font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-zinc-400 mt-1">{sub}</p>}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function PortfolioPage() {
  const [positions,  setPositions]  = useState<Position[]>([]);
  const [pnlEntries, setPnlEntries] = useState<PnlEntry[]>([]);
  const [cash,       setCash]       = useState(0);
  const [userName,   setUserName]   = useState('Demo Trader');
  const [tab,        setTab]        = useState<'positions' | 'realized'>('positions');
  const [marketFilter, setMF]       = useState<string>('india');
  const [loading,    setLoading]    = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    const res = await fetch('/api/portfolio');
    if (!res.ok) return;
    const data = await res.json();
    setUserName(data.user?.name ?? 'Demo Trader');
    setCash(data.user?.balance ?? 0);
    setPositions(data.positions ?? []);
    setPnlEntries(data.pnlEntries ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    pollRef.current = setInterval(fetchData, 60_000); // 60s — server only needed for candle fallback
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchData]);

  // ── Live price overlay via Upstox WebSocket ───────────────────────────────
  const { ticks: upstoxTicks, subscribe, status: wsStatus } = useUpstox();

  // Build label→instrumentCode map for India positions stored with short labels
  const { labelToCode } = useMemo(() => {
    const indiaMarket = MARKETS.find(m => m.id === 'india');
    const labelToCode: Record<string, string> = {};
    for (const inst of indiaMarket?.instruments ?? []) {
      labelToCode[inst.label] = inst.code;
    }
    return { labelToCode };
  }, []);

  // Resolve the Upstox instrument key for a position
  const resolveKey = useCallback((symbol: string, label: string): string => {
    if (symbol.includes('|')) return symbol;
    return labelToCode[label] ?? labelToCode[symbol] ?? '';
  }, [labelToCode]);

  // Subscribe to all India instruments once the WebSocket is connected
  useEffect(() => {
    if (wsStatus !== 'connected' || positions.length === 0) return;
    const keys = positions
      .filter(p => p.market === 'india')
      .map(p => resolveKey(p.symbol, p.label))
      .filter(k => k !== '');
    if (keys.length > 0) subscribe(keys, 'ltpc');
  }, [wsStatus, positions, subscribe, resolveKey]);

  // Merge live WebSocket LTPs into positions; recompute P&L on every tick
  const livePositions = useMemo(() => positions.map(pos => {
    if (pos.market !== 'india') return pos;
    const key = resolveKey(pos.symbol, pos.label);
    const ltp = key ? upstoxTicks[key]?.ltp : undefined;
    if (!ltp) return pos; // keep server-computed price (candle close or avgCost)
    const currentPrice  = ltp;
    const marketValue   = currentPrice * pos.quantity;
    const costValue     = pos.avgCost  * pos.quantity;
    const unrealizedPnl = marketValue - costValue;
    const unrealizedPct = costValue > 0 ? (unrealizedPnl / costValue) * 100 : 0;
    return { ...pos, currentPrice, marketValue, unrealizedPnl, unrealizedPct };
  }), [positions, upstoxTicks, resolveKey]);

  // ── Market-filtered data ──────────────────────────────────────────────────
  const selectedMarket  = MARKETS.find(m => m.id === marketFilter);
  const cs              = selectedMarket?.currencySymbol ?? '$';

  const filteredPositions  = marketFilter === 'all' ? livePositions  : livePositions.filter(p => p.market === marketFilter);
  const filteredPnlEntries = marketFilter === 'all' ? pnlEntries  : pnlEntries.filter(e => e.market === marketFilter);

  const totalMarketValue   = filteredPositions.reduce((s, p) => s + p.marketValue,            0);
  const totalCostBasis     = filteredPositions.reduce((s, p) => s + p.avgCost * p.quantity,   0);
  const totalUnrealizedPnl = filteredPositions.reduce((s, p) => s + p.unrealizedPnl,          0);
  const totalRealizedPnl   = filteredPnlEntries.reduce((s, e) => s + e.realizedPnl,           0);
  const totalPnl           = totalUnrealizedPnl + totalRealizedPnl;
  const totalPortfolioValue = (marketFilter === 'all' ? cash : 0) + totalMarketValue;

  const totalPnlSign = totalPnl >= 0;

  // Format summary values — for "all markets" prefix is mixed, use individual currency per row
  function fmtSum(n: number) {
    return marketFilter === 'all' ? `$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : fmt(n, cs).split('.')[0];
  }
  function fmtSumPnl(n: number) {
    return `${pnlSign(n)}${fmtSum(n).replace(/^[+\-]/, '')}`;
  }

  return (
    <>
    <NavBar />
    <main className="min-h-screen bg-[#161b27] p-6 text-zinc-100">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Portfolio Engine</h1>
            <p className="text-zinc-500 text-sm mt-0.5">{userName} — paper trading account</p>
          </div>
          <button onClick={fetchData} className="text-xs text-zinc-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg border border-white/[0.08]">
            Refresh
          </button>
        </div>

        {/* Market filter */}
        <div className="flex gap-1 p-1 rounded-xl bg-zinc-900 border border-white/[0.08] w-fit">
          {[{ id: 'all', flag: '🌐', name: 'All Markets' }, ...MARKETS.filter(m => m.enabled)].map(m => (
            <button key={m.id} onClick={() => setMF(m.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                marketFilter === m.id ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}>
              {m.flag} {m.name}
            </button>
          ))}
        </div>

        {loading ? (
          <TableSkeleton rows={5} cols={8} showCards cardCount={4} />
        ) : (
          <>
            {/* ── Summary Cards ── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {marketFilter === 'all' && (
                <SummaryCard label="Cash Balance" value={`$${cash.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
              )}
              <SummaryCard label="Market Value (Holdings)" value={fmtSum(totalMarketValue)} />
              {marketFilter === 'all' && (
                <SummaryCard label="Total Portfolio Value" value={fmtSum(totalPortfolioValue)} />
              )}
              <SummaryCard
                label="Unrealized P&L"
                value={fmtSumPnl(totalUnrealizedPnl)}
                highlight={totalUnrealizedPnl >= 0 ? 'green' : 'red'}
              />
              <SummaryCard
                label="Realized P&L"
                value={fmtSumPnl(totalRealizedPnl)}
                highlight={totalRealizedPnl >= 0 ? 'green' : 'red'}
              />
              <SummaryCard
                label="Total P&L"
                value={fmtSumPnl(totalPnl)}
                sub={totalCostBasis > 0 ? `${pctStr((totalPnl / totalCostBasis) * 100)} on invested` : undefined}
                highlight={totalPnlSign ? 'green' : 'red'}
              />
              <SummaryCard label="Invested (Cost Basis)" value={fmtSum(totalCostBasis)} />
              <SummaryCard label="Positions" value={String(filteredPositions.length)} />
            </div>

            {/* ── Allocation Bar ── */}
            {totalPortfolioValue > 0 && filteredPositions.length > 0 && (
              <div className="rounded-2xl border border-white/[0.08] bg-zinc-900 p-5">
                <p className="text-xs text-zinc-500 mb-3">Allocation</p>
                <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
                  {filteredPositions.map((p, i) => {
                    const base = marketFilter === 'all' ? totalPortfolioValue : totalMarketValue || 1;
                    const pct = (p.marketValue / base) * 100;
                    const colors = ['bg-blue-500', 'bg-violet-500', 'bg-emerald-500', 'bg-amber-500', 'bg-pink-500', 'bg-cyan-500', 'bg-orange-500', 'bg-indigo-500'];
                    return <div key={p.id} style={{ width: `${pct}%` }} className={`${colors[i % colors.length]} rounded-sm`} title={`${p.label} ${pct.toFixed(1)}%`} />;
                  })}
                  {marketFilter === 'all' && (
                    <div style={{ width: `${(cash / totalPortfolioValue) * 100}%` }} className="bg-zinc-700 rounded-sm" title={`Cash ${((cash / totalPortfolioValue) * 100).toFixed(1)}%`} />
                  )}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
                  {filteredPositions.map((p, i) => {
                    const base = marketFilter === 'all' ? totalPortfolioValue : totalMarketValue || 1;
                    const pct = (p.marketValue / base) * 100;
                    const colors = ['bg-blue-500', 'bg-violet-500', 'bg-emerald-500', 'bg-amber-500', 'bg-pink-500', 'bg-cyan-500', 'bg-orange-500', 'bg-indigo-500'];
                    return (
                      <span key={p.id} className="flex items-center gap-1.5 text-xs text-zinc-400">
                        <span className={`w-2 h-2 rounded-sm ${colors[i % colors.length]}`} />
                        {p.label} {pct.toFixed(1)}%
                      </span>
                    );
                  })}
                  {marketFilter === 'all' && (
                    <span className="flex items-center gap-1.5 text-xs text-zinc-400">
                      <span className="w-2 h-2 rounded-sm bg-zinc-700" />
                      Cash {((cash / totalPortfolioValue) * 100).toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* ── Tabs ── */}
            <div className="flex gap-1 p-1 rounded-xl bg-zinc-900 border border-white/[0.08] w-fit">
              {([['positions', 'Open Positions'], ['realized', 'Realized P&L']] as const).map(([key, label]) => (
                <button key={key} onClick={() => setTab(key)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${tab === key ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
                  {label}
                  <span className="ml-1.5 text-xs opacity-60">
                    {key === 'positions' ? filteredPositions.length : filteredPnlEntries.length}
                  </span>
                </button>
              ))}
            </div>

            {/* ── Positions Table ── */}
            {tab === 'positions' && (
              <div className="rounded-2xl border border-white/[0.08] bg-zinc-900 overflow-hidden">
                {filteredPositions.length === 0 ? (
                  <div className="flex items-center justify-center h-48 text-zinc-500 text-sm">No open positions</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/[0.06] text-xs text-zinc-300 uppercase tracking-widest">
                          {['Symbol', 'Market', 'Qty', 'Avg Cost', 'Current Price', 'Market Value', 'Unrealized P&L', 'Return %'].map(h => (
                            <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPositions.map(p => (
                          <tr key={p.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                            <td className="px-4 py-3 font-mono font-bold text-white">{p.label}</td>
                            <td className="px-4 py-3 text-xs text-zinc-400 uppercase">{p.market}</td>
                            <td className="px-4 py-3 font-mono text-zinc-200">{p.quantity}</td>
                            <td className="px-4 py-3 font-mono text-zinc-300">{fmt(p.avgCost, p.currencySymbol)}</td>
                            <td className="px-4 py-3 font-mono text-zinc-200">{fmt(p.currentPrice, p.currencySymbol)}</td>
                            <td className="px-4 py-3 font-mono text-zinc-200">{fmt(p.marketValue, p.currencySymbol)}</td>
                            <td className={`px-4 py-3 font-mono font-semibold ${pnlClass(p.unrealizedPnl)}`}>
                              {pnlSign(p.unrealizedPnl)}{fmt(p.unrealizedPnl, p.currencySymbol)}
                            </td>
                            <td className={`px-4 py-3 font-mono font-semibold ${pnlClass(p.unrealizedPct)}`}>
                              {pctStr(p.unrealizedPct)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ── Realized P&L Table ── */}
            {tab === 'realized' && (
              <div className="rounded-2xl border border-white/[0.08] bg-zinc-900 overflow-hidden">
                {filteredPnlEntries.length === 0 ? (
                  <div className="flex items-center justify-center h-48 text-zinc-500 text-sm">No realized trades yet</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/[0.06] text-xs text-zinc-300 uppercase tracking-widest">
                          {['Date', 'Symbol', 'Market', 'Qty Sold', 'Avg Cost', 'Sale Price', 'Realized P&L'].map(h => (
                            <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPnlEntries.map(e => {
                          const entryCurrency = MARKETS.find(m => m.id === e.market)?.currencySymbol ?? '$';
                          return (
                            <tr key={e.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                              <td className="px-4 py-3 text-zinc-400 text-xs">{new Date(e.createdAt).toLocaleDateString()}</td>
                              <td className="px-4 py-3 font-mono font-bold text-white">{e.label}</td>
                              <td className="px-4 py-3 text-xs text-zinc-500 uppercase">{e.market}</td>
                              <td className="px-4 py-3 font-mono text-zinc-200">{e.quantity}</td>
                              <td className="px-4 py-3 font-mono text-zinc-300">{entryCurrency}{e.costBasis.toFixed(2)}</td>
                              <td className="px-4 py-3 font-mono text-zinc-200">{entryCurrency}{e.salePrice.toFixed(2)}</td>
                              <td className={`px-4 py-3 font-mono font-semibold ${pnlClass(e.realizedPnl)}`}>
                                {pnlSign(e.realizedPnl)}{entryCurrency}{Math.abs(e.realizedPnl).toFixed(2)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </main>
    </>
  );
}
