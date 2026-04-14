'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MARKETS } from '@/config/markets';
import NavBar from '@/app/components/NavBar';

// ── Types ────────────────────────────────────────────────────────────────────

interface Order {
  id:            string;
  symbol:        string;
  market:        string;
  label:         string;
  currencySymbol:string;
  side:          string;
  orderType:     string;
  status:        string;
  quantity:      number;
  price:         number;
  avgFillPrice:  number | null;
  filledQty:     number;
  createdAt:     string;
  filledAt:      string | null;
  notes:         string | null;
}

interface User { id: string; name: string; balance: number }

// ── Flat instrument list (all markets) ───────────────────────────────────────

const ALL_INSTRUMENTS = MARKETS.flatMap(m =>
  m.instruments.map(i => ({
    code:           i.code,
    label:          i.label,
    name:           i.name,
    market:         m.id,
    currencySymbol: m.currencySymbol,
  }))
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number, cs = '$') {
  return cs + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000)    return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000)return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString();
}

const STATUS_PILL: Record<string, string> = {
  PENDING:   'bg-amber-500/15 text-amber-400',
  FILLED:    'bg-emerald-500/15 text-emerald-400',
  PARTIAL:   'bg-blue-500/15 text-blue-400',
  CANCELLED: 'bg-zinc-500/15 text-zinc-400',
  REJECTED:  'bg-red-500/15 text-red-400',
};

// ── Component ────────────────────────────────────────────────────────────────

export default function OrdersPage() {
  const [user, setUser]         = useState<User | null>(null);
  const [orders, setOrders]     = useState<Order[]>([]);
  const [tab, setTab]           = useState<'active' | 'history'>('active');
  const [marketFilter, setMF]   = useState<string>('india');
  const [submitting, setSub]    = useState(false);
  const [formMsg, setFormMsg]   = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const pollRef                 = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Form state ───────────────────────────────────────────────────────────
  const [selected, setSelected]     = useState(ALL_INSTRUMENTS[0]);
  const [side, setSide]             = useState<'BUY' | 'SELL'>('BUY');
  const [orderType, setOType]       = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [quantity, setQty]          = useState('1');
  const [price, setPrice]           = useState('');
  const [priceAutoFilled, setPriceAutoFilled] = useState(false);
  const [notes, setNotes]           = useState('');

  // ── Data fetch ───────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    const [uRes, oRes] = await Promise.all([
      fetch('/api/users'),
      fetch('/api/orders?status=all'),
    ]);
    if (uRes.ok) setUser(await uRes.json());
    if (oRes.ok) { const d = await oRes.json(); setOrders(d.orders ?? []); }
  }, []);

  // Seed demo data once on first load (POST is idempotent — no-ops if orders exist)
  useEffect(() => { fetch('/api/users', { method: 'POST' }); }, []);

  useEffect(() => {
    fetchData();
    pollRef.current = setInterval(fetchData, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchData]);

  // ── Auto-fill price for MARKET orders ───────────────────────────────────
  useEffect(() => {
    if (orderType !== 'MARKET') return;
    let cancelled = false;
    async function fetchLatestPrice() {
      try {
        const market = selected.market;
        const url = market === 'india'
          ? `/api/india/kline?instrumentKey=${encodeURIComponent(selected.code)}&interval=1d`
          : `/api/us/kline?code=${encodeURIComponent(selected.code)}&interval=1d&limit=1&market=${market}`;
        const res = await fetch(url);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const candles: { close: number }[] = data.candles ?? [];
        if (candles.length > 0 && !cancelled) {
          setPrice(candles[candles.length - 1].close.toFixed(2));
          setPriceAutoFilled(true);
        }
      } catch { /* silently ignore */ }
    }
    fetchLatestPrice();
    return () => { cancelled = true; };
  }, [selected, orderType]);

  // ── Submit order ─────────────────────────────────────────────────────────
  async function submitOrder(e: React.FormEvent) {
    e.preventDefault();
    setFormMsg(null);
    setSub(true);
    try {
      const effectivePrice = Number(price);

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: selected.code, market: selected.market,
          label:  selected.label, currencySymbol: selected.currencySymbol,
          side, orderType, quantity: Number(quantity), price: effectivePrice, notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setFormMsg({ type: 'ok', text: `${side} order placed for ${quantity} × ${selected.label}` });
      setQty('1'); setPrice(''); setPriceAutoFilled(false); setNotes('');
      fetchData();
    } catch (err) {
      setFormMsg({ type: 'err', text: (err as Error).message });
    } finally {
      setSub(false);
    }
  }

  async function cancelOrder(id: string) {
    await fetch(`/api/orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel' }),
    });
    fetchData();
  }

  const filteredInstruments = marketFilter === 'all'
    ? ALL_INSTRUMENTS
    : ALL_INSTRUMENTS.filter(i => i.market === marketFilter);

  const visibleOrders = marketFilter === 'all' ? orders : orders.filter(o => o.market === marketFilter);
  const activeOrders  = visibleOrders.filter(o => o.status === 'PENDING');
  const historyOrders = visibleOrders.filter(o => o.status !== 'PENDING');

  return (
    <>
    <NavBar />
    <main className="min-h-screen bg-[#161b27] p-6 text-zinc-100">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Order Book</h1>
            <p className="text-zinc-500 text-sm mt-0.5">Paper-trading — no real money</p>
          </div>
          {user && (
            <div className="text-right">
              <p className="text-xs text-zinc-500">Cash Balance</p>
              <p className="text-xl font-mono font-bold text-emerald-400">{fmt(user.balance, selected.currencySymbol)}</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">

          {/* ── Order Form ── */}
          <div className="rounded-2xl border border-white/[0.08] bg-zinc-900 p-6 space-y-5 h-fit">
            <h2 className="font-semibold text-white">Place Order</h2>

            <form onSubmit={submitOrder} className="space-y-4">

              {/* Instrument */}
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Instrument</label>
                <select
                  value={selected.code}
                  onChange={e => setSelected(ALL_INSTRUMENTS.find(i => i.code === e.target.value) ?? ALL_INSTRUMENTS[0])}
                  className="w-full rounded-lg bg-zinc-800 border border-white/[0.08] px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20"
                >
                  {MARKETS.filter(m => m.enabled && (marketFilter === 'all' || m.id === marketFilter)).map(m => (
                    <optgroup key={m.id} label={marketFilter === 'all' ? `${m.flag} ${m.name}` : m.name}>
                      {m.instruments.map(i => (
                        <option key={i.code} value={i.code}>{i.label} — {i.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              {/* Side */}
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Side</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['BUY', 'SELL'] as const).map(s => (
                    <button key={s} type="button" onClick={() => setSide(s)}
                      className={`py-2 rounded-lg text-sm font-semibold transition-colors ${
                        side === s
                          ? s === 'BUY' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
                          : 'bg-zinc-800 text-zinc-400 hover:text-white'
                      }`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Order Type */}
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Order Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['MARKET', 'LIMIT'] as const).map(t => (
                    <button key={t} type="button" onClick={() => { setOType(t); if (t === 'LIMIT') { setPrice(''); setPriceAutoFilled(false); } }}
                      className={`py-2 rounded-lg text-sm font-semibold transition-colors ${
                        orderType === t ? 'bg-white/10 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'
                      }`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quantity */}
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Quantity</label>
                <input type="number" min="0.01" step="0.01" value={quantity}
                  onChange={e => setQty(e.target.value)} required
                  className="w-full rounded-lg bg-zinc-800 border border-white/[0.08] px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20"
                />
              </div>

              {/* Price */}
              <div>
                <label className="text-xs text-zinc-400 mb-1 flex items-center gap-1.5">
                  {orderType === 'LIMIT' ? 'Limit Price' : 'Execution Price'}
                  {orderType === 'MARKET' && priceAutoFilled && (
                    <span className="text-emerald-600 font-medium">· auto-filled</span>
                  )}
                  {orderType === 'MARKET' && !priceAutoFilled && (
                    <span className="text-zinc-600">· fetching…</span>
                  )}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm pointer-events-none select-none">
                    {selected.currencySymbol}
                  </span>
                  <input type="number" min="0.01" step="0.01" value={price}
                    onChange={e => { setPrice(e.target.value); setPriceAutoFilled(false); }}
                    required
                    placeholder="0.00"
                    className="w-full rounded-lg bg-zinc-800 border border-white/[0.08] pl-8 pr-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20 placeholder:text-zinc-600"
                  />
                </div>
              </div>

              {/* Order Total */}
              {price && quantity && Number(price) > 0 && Number(quantity) > 0 && (
                <div className="flex items-center justify-between rounded-lg bg-zinc-800/60 border border-white/[0.06] px-4 py-2.5">
                  <span className="text-xs text-zinc-500">{side === 'BUY' ? 'Order Total' : 'Sale Proceeds'}</span>
                  <span className="font-mono font-bold text-white text-sm">
                    {selected.currencySymbol}{(Number(price) * Number(quantity)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Notes (optional)</label>
                <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="Reason, strategy…"
                  className="w-full rounded-lg bg-zinc-800 border border-white/[0.08] px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20 placeholder:text-zinc-600"
                />
              </div>

              {formMsg && (
                <p className={`text-xs rounded-lg px-3 py-2 ${formMsg.type === 'ok' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                  {formMsg.text}
                </p>
              )}

              <button type="submit" disabled={submitting}
                className={`w-full py-2.5 rounded-xl text-sm font-bold transition-colors ${
                  side === 'BUY' ? 'bg-emerald-500 hover:bg-emerald-400' : 'bg-red-500 hover:bg-red-400'
                } text-white disabled:opacity-50`}>
                {submitting ? 'Placing…' : `Place ${side} Order`}
              </button>
            </form>
          </div>

          {/* ── Order Tables ── */}
          <div className="space-y-4">

            {/* Market filter */}
            <div className="flex gap-1 p-1 rounded-xl bg-zinc-900 border border-white/[0.08] w-fit">
              {[{ id: 'all', flag: '🌐', name: 'All Markets' }, ...MARKETS.filter(m => m.enabled)].map(m => (
                <button key={m.id} onClick={() => {
                  setMF(m.id);
                  const first = m.id === 'all' ? ALL_INSTRUMENTS[0] : ALL_INSTRUMENTS.find(i => i.market === m.id) ?? ALL_INSTRUMENTS[0];
                  setSelected(first);
                  setPrice(''); setPriceAutoFilled(false);
                }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                    marketFilter === m.id ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-300'
                  }`}>
                  {m.flag} {m.name}
                </button>
              ))}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 p-1 rounded-xl bg-zinc-900 border border-white/[0.08] w-fit">
              {([['active', 'Active Orders'], ['history', 'Order History']] as const).map(([key, label]) => (
                <button key={key} onClick={() => setTab(key)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                    tab === key ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-300'
                  }`}>
                  {label}
                  <span className="ml-1.5 text-xs opacity-60">
                    {key === 'active' ? activeOrders.length : historyOrders.length}
                  </span>
                </button>
              ))}
            </div>

            <div className="rounded-2xl border border-white/[0.08] bg-zinc-900 overflow-hidden">
              {tab === 'active' ? (
                <OrderTable orders={activeOrders} showCancel onCancel={cancelOrder} />
              ) : (
                <OrderTable orders={historyOrders} showCancel={false} />
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
    </>
  );
}

// ── Order Table ───────────────────────────────────────────────────────────────

function OrderTable({ orders, showCancel, onCancel }: {
  orders: Order[];
  showCancel: boolean;
  onCancel?: (id: string) => void;
}) {
  if (orders.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-zinc-500 text-sm">
        No orders found
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.06] text-xs text-zinc-500">
            {['Time', 'Symbol', 'Side', 'Type', 'Status', 'Qty', 'Price', 'Fill Price', 'Total', ''].map(h => (
              <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {orders.map(o => {
            const cs       = o.currencySymbol;
            const fillPrice = o.avgFillPrice ?? o.price;
            const total     = fillPrice * o.filledQty;
            return (
              <tr key={o.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                <td className="px-4 py-3 text-zinc-400 whitespace-nowrap">{relTime(o.createdAt)}</td>
                <td className="px-4 py-3 font-mono font-semibold text-white">{o.label}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${o.side === 'BUY' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                    {o.side}
                  </span>
                </td>
                <td className="px-4 py-3 text-zinc-400 text-xs">{o.orderType}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${STATUS_PILL[o.status] ?? ''}`}>
                    {o.status}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-zinc-200">{o.quantity}</td>
                <td className="px-4 py-3 font-mono text-zinc-200">{cs}{o.price.toFixed(2)}</td>
                <td className="px-4 py-3 font-mono text-zinc-200">
                  {o.avgFillPrice != null ? `${cs}${o.avgFillPrice.toFixed(2)}` : '—'}
                </td>
                <td className="px-4 py-3 font-mono text-zinc-200">
                  {o.filledQty > 0 ? `${cs}${total.toFixed(2)}` : '—'}
                </td>
                <td className="px-4 py-3">
                  {showCancel && o.status === 'PENDING' && onCancel && (
                    <button onClick={() => onCancel(o.id)}
                      className="text-xs text-red-400 hover:text-red-300 transition-colors">
                      Cancel
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
