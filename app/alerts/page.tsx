'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MARKETS } from '@/config/markets';
import NavBar from '@/app/components/NavBar';
import TableSkeleton from '@/app/components/TableSkeleton';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Alert {
  id:             string;
  symbol:         string;
  market:         string;
  label:          string;
  currencySymbol: string;
  condition:      string;
  targetPrice:    number;
  action:         string;
  quantity:       number | null;
  status:         string;
  triggeredAt:    string | null;
  triggeredPrice: number | null;
  createdAt:      string;
}

// ── Flat instrument list ──────────────────────────────────────────────────────

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

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000)    return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return new Date(iso).toLocaleString();
}

const STATUS_PILL: Record<string, string> = {
  ACTIVE:    'bg-blue-500/15 text-blue-400',
  TRIGGERED: 'bg-emerald-500/15 text-emerald-400',
  CANCELLED: 'bg-zinc-500/15 text-zinc-400',
};

const ACTION_PILL: Record<string, string> = {
  NOTIFY: 'bg-violet-500/15 text-violet-400',
  BUY:    'bg-emerald-500/15 text-emerald-400',
  SELL:   'bg-red-500/15 text-red-400',
};

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AlertsPage() {
  const [activeAlerts,    setActive]    = useState<Alert[]>([]);
  const [historyAlerts,   setHistory]   = useState<Alert[]>([]);
  const [loading,         setLoading]   = useState(true);
  const [tab,             setTab]       = useState<'active' | 'history'>('active');
  const [submitting,      setSub]       = useState(false);
  const [formMsg,         setFormMsg]   = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const pollRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const knownTriggered = useRef<Set<string>>(new Set());
  const initialised    = useRef(false);

  // ── Request notification permission on mount ─────────────────────────────
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // ── Form state ───────────────────────────────────────────────────────────
  const [selected,    setSelected]  = useState(ALL_INSTRUMENTS[0]);
  const [condition,   setCond]      = useState<'ABOVE' | 'BELOW' | 'EQUAL'>('EQUAL');
  const [targetPrice, setTarget]    = useState('');
  const [action,      setAction]    = useState<'NOTIFY' | 'BUY' | 'SELL'>('NOTIFY');
  const [quantity,    setQty]       = useState('');

  // ── Fetch ────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    const [a, h] = await Promise.all([
      fetch('/api/alerts?status=ACTIVE').then(r => r.json()),
      fetch('/api/alerts?status=TRIGGERED').then(r => r.json()),
    ]);
    const triggered: Alert[] = h.alerts ?? [];

    if (!initialised.current) {
      // First load — seed all existing triggered IDs so we don't replay old alerts
      triggered.forEach(al => knownTriggered.current.add(al.id));
      initialised.current = true;
    } else if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      // Subsequent polls — notify only for genuinely new triggers
      for (const al of triggered) {
        if (!knownTriggered.current.has(al.id)) {
          const condLabel = al.condition === 'ABOVE' ? '≥' : al.condition === 'BELOW' ? '≤' : '=';
          const trigPrice = `${al.currencySymbol}${al.triggeredPrice?.toFixed(2) ?? al.targetPrice.toFixed(2)}`;
          new Notification(`🔔 MarketSync Alert: ${al.label}`, {
            body: `Price ${condLabel} ${al.currencySymbol}${al.targetPrice.toFixed(2)} — triggered @ ${trigPrice}`,
            icon: '/favicon.ico',
          });
          knownTriggered.current.add(al.id);
        }
      }
    }

    setActive(a.alerts ?? []);
    setHistory(triggered);
    if (initial) setLoading(false);
  }, []);

  useEffect(() => {
    fetchData(true);
    pollRef.current = setInterval(() => fetchData(false), 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchData]);

  // ── Submit ────────────────────────────────────────────────────────────────
  async function submitAlert(e: React.FormEvent) {
    e.preventDefault();
    setFormMsg(null);
    setSub(true);
    try {
      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: selected.code, market: selected.market,
          label:  selected.label, currencySymbol: selected.currencySymbol,
          condition, targetPrice: Number(targetPrice),
          action, quantity: quantity ? Number(quantity) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setFormMsg({ type: 'ok', text: `Alert set: ${selected.label} ${condition} ${selected.currencySymbol}${targetPrice}` });
      setTarget(''); setQty('');
      fetchData();
    } catch (err) {
      setFormMsg({ type: 'err', text: (err as Error).message });
    } finally {
      setSub(false);
    }
  }

  async function cancelAlert(id: string) {
    await fetch(`/api/alerts/${id}`, { method: 'DELETE' });
    fetchData();
  }

  return (
    <>
    <NavBar />
    <main className="min-h-screen bg-[#161b27] p-6 text-zinc-100">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white">Alerting Rules Engine</h1>
          <p className="text-zinc-500 text-sm mt-0.5">Price alerts with optional auto buy/sell execution</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">

          {/* ── Alert Form ── */}
          <div className="rounded-2xl border border-white/[0.08] bg-zinc-900 p-6 space-y-5 h-fit">
            <h2 className="font-semibold text-white">Create Alert</h2>

            <form onSubmit={submitAlert} className="space-y-4">

              {/* Instrument */}
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Instrument</label>
                <select
                  value={selected.code}
                  onChange={e => setSelected(ALL_INSTRUMENTS.find(i => i.code === e.target.value) ?? ALL_INSTRUMENTS[0])}
                  className="w-full rounded-lg bg-zinc-800 border border-white/[0.08] px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20"
                >
                  {MARKETS.map(m => (
                    <optgroup key={m.id} label={`${m.flag} ${m.name}`}>
                      {m.instruments.map(i => (
                        <option key={i.code} value={i.code}>{i.label} — {i.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              {/* Condition */}
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Trigger Condition</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['EQUAL', 'ABOVE', 'BELOW'] as const).map(c => (
                    <button key={c} type="button" onClick={() => setCond(c)}
                      className={`py-2 rounded-lg text-sm font-semibold transition-colors ${
                        condition === c ? 'bg-white/10 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'
                      }`}>
                      {c === 'EQUAL' ? 'Price = Target' : c === 'ABOVE' ? 'Price ≥ Target' : 'Price ≤ Target'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Target Price */}
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Target Price ({selected.currencySymbol})</label>
                <input type="number" min="0.01" step="0.01" value={targetPrice}
                  onChange={e => setTarget(e.target.value)} required
                  placeholder={`e.g. 200.00`}
                  className="w-full rounded-lg bg-zinc-800 border border-white/[0.08] px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20 placeholder:text-zinc-600"
                />
              </div>

              {/* Action */}
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">On Trigger</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['NOTIFY', 'BUY', 'SELL'] as const).map(a => (
                    <button key={a} type="button" onClick={() => setAction(a)}
                      className={`py-2 rounded-lg text-sm font-semibold transition-colors ${
                        action === a
                          ? a === 'NOTIFY' ? 'bg-violet-500/30 text-violet-300'
                          : a === 'BUY'    ? 'bg-emerald-500/30 text-emerald-300'
                          :                  'bg-red-500/30 text-red-300'
                          : 'bg-zinc-800 text-zinc-400 hover:text-white'
                      }`}>
                      {a === 'NOTIFY' ? '🔔 Notify' : a === 'BUY' ? '📈 Auto Buy' : '📉 Auto Sell'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quantity (for auto order) */}
              {action !== 'NOTIFY' && (
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Quantity to {action}</label>
                  <input type="number" min="0.01" step="0.01" value={quantity}
                    onChange={e => setQty(e.target.value)} required
                    placeholder="e.g. 10"
                    className="w-full rounded-lg bg-zinc-800 border border-white/[0.08] px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/20 placeholder:text-zinc-600"
                  />
                  <p className="text-xs text-zinc-500 mt-1">
                    A MARKET order will be placed automatically when triggered.
                  </p>
                </div>
              )}

              {formMsg && (
                <p className={`text-xs rounded-lg px-3 py-2 ${formMsg.type === 'ok' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                  {formMsg.text}
                </p>
              )}

              <button type="submit" disabled={submitting}
                className="w-full py-2.5 rounded-xl text-sm font-bold bg-violet-600 hover:bg-violet-500 text-white transition-colors disabled:opacity-50">
                {submitting ? 'Creating…' : 'Set Alert'}
              </button>
            </form>

            {/* How it works */}
            <div className="rounded-xl bg-zinc-800/50 border border-white/[0.04] p-4 space-y-2">
              <p className="text-xs font-semibold text-zinc-300">How alerts work</p>
              <ul className="text-xs text-zinc-500 space-y-1">
                <li>• <span className="text-violet-400">Notify</span> — fires a visible in-app notification</li>
                <li>• <span className="text-emerald-400">Auto Buy</span> — places a MARKET BUY order when triggered</li>
                <li>• <span className="text-red-400">Auto Sell</span> — places a MARKET SELL order when triggered</li>
                <li>• Alerts check on every live price tick from the watchlist</li>
                <li>• Each alert fires once then moves to history</li>
              </ul>
            </div>
          </div>

          {/* ── Alert Tables ── */}
          <div className="space-y-4">

            {/* Tabs */}
            <div className="flex gap-1 p-1 rounded-xl bg-zinc-900 border border-white/[0.08] w-fit">
              {([['active', 'Active Alerts'], ['history', 'Triggered / Cancelled']] as const).map(([key, label]) => (
                <button key={key} onClick={() => setTab(key)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${tab === key ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
                  {label}
                  <span className="ml-1.5 text-xs opacity-60">
                    {key === 'active' ? activeAlerts.length : historyAlerts.length}
                  </span>
                </button>
              ))}
            </div>

            {loading ? (
              <TableSkeleton rows={4} cols={6} />
            ) : (
              <div className="rounded-2xl border border-white/[0.08] bg-zinc-900 overflow-hidden">
                <AlertTable
                  alerts={tab === 'active' ? activeAlerts : historyAlerts}
                  showCancel={tab === 'active'}
                  onCancel={cancelAlert}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
    </>
  );
}

// ── Alert Table ───────────────────────────────────────────────────────────────

function AlertTable({ alerts, showCancel, onCancel }: {
  alerts: Alert[];
  showCancel: boolean;
  onCancel: (id: string) => void;
}) {
  if (alerts.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-zinc-500 text-sm">
        No alerts found
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.06] text-xs text-zinc-500">
            {['Created', 'Symbol', 'Condition', 'Target Price', 'Action', 'Qty', 'Status', 'Triggered At', ''].map(h => (
              <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {alerts.map(a => (
            <tr key={a.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
              <td className="px-4 py-3 text-zinc-400 whitespace-nowrap text-xs">{relTime(a.createdAt)}</td>
              <td className="px-4 py-3 font-mono font-semibold text-white">{a.label}</td>
              <td className="px-4 py-3 text-zinc-300 text-xs">
                Price {a.condition === 'ABOVE' ? '≥' : a.condition === 'BELOW' ? '≤' : '='} {a.currencySymbol}{a.targetPrice.toFixed(2)}
              </td>
              <td className="px-4 py-3 font-mono text-zinc-200">{a.currencySymbol}{a.targetPrice.toFixed(2)}</td>
              <td className="px-4 py-3">
                <span className={`px-2 py-0.5 rounded text-xs font-semibold ${ACTION_PILL[a.action] ?? ''}`}>
                  {a.action}
                </span>
              </td>
              <td className="px-4 py-3 font-mono text-zinc-400">{a.quantity ?? '—'}</td>
              <td className="px-4 py-3">
                <span className={`px-2 py-0.5 rounded text-xs font-semibold ${STATUS_PILL[a.status] ?? ''}`}>
                  {a.status}
                </span>
              </td>
              <td className="px-4 py-3 text-zinc-400 text-xs whitespace-nowrap">
                {a.triggeredAt
                  ? `${relTime(a.triggeredAt)}${a.triggeredPrice ? ` @ ${a.currencySymbol}${a.triggeredPrice.toFixed(2)}` : ''}`
                  : '—'}
              </td>
              <td className="px-4 py-3">
                {showCancel && (
                  <button onClick={() => onCancel(a.id)}
                    className="text-xs text-red-400 hover:text-red-300 transition-colors">
                    Cancel
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
