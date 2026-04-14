'use client';

import { useTickData } from '@/lib/tick-data';

const CONFIG: Record<string, { label: string; dot: string; text: string }> = {
  connected:    { label: 'Live',        dot: 'bg-emerald-400 shadow-[0_0_6px_2px_rgba(52,211,153,0.5)]', text: 'text-emerald-400' },
  connecting:   { label: 'Connecting…', dot: 'bg-yellow-400 animate-pulse',                               text: 'text-yellow-400' },
  disconnected: { label: 'Disconnected',dot: 'bg-zinc-500',                                                text: 'text-zinc-400'  },
  error:        { label: 'Reconnecting…',dot: 'bg-yellow-500 animate-pulse',                               text: 'text-yellow-400'},
};

export default function ConnectionBadge() {
  const { status, error } = useTickData();
  const cfg = CONFIG[status];

  return (
    <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
      <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
      <span className={`text-xs font-medium ${cfg.text}`}>
        {cfg.label}
      </span>
    </div>
  );
}
