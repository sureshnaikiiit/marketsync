'use client';

interface TableSkeletonProps {
  rows?: number;
  cols?: number;
  showCards?: boolean;
  cardCount?: number;
}

export default function TableSkeleton({ rows = 6, cols = 6, showCards = false, cardCount = 4 }: TableSkeletonProps) {
  return (
    <div className="space-y-4 animate-pulse">
      {/* Summary cards */}
      {showCards && (
        <div className={`grid grid-cols-2 sm:grid-cols-${Math.min(cardCount, 3)} lg:grid-cols-${cardCount} gap-4`}>
          {Array.from({ length: cardCount }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-white/[0.08] bg-zinc-900 p-5 space-y-3">
              <div className="h-2.5 w-28 rounded bg-white/10" />
              <div className="h-7 w-36 rounded bg-white/[0.07]" />
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
        {/* Header row */}
        <div className="flex items-center gap-6 border-b border-white/[0.06] px-5 py-3">
          {Array.from({ length: cols }).map((_, i) => (
            <div key={i} className="h-2.5 rounded bg-white/10" style={{ width: i === 0 ? 100 : 70 + (i % 3) * 10 }} />
          ))}
        </div>
        {/* Data rows */}
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-6 border-b border-white/[0.04] px-5 py-4"
            style={{ opacity: 1 - i * 0.08 }}>
            <div className="space-y-1.5" style={{ width: 100 }}>
              <div className="h-3.5 w-20 rounded bg-white/10" />
              <div className="h-2.5 w-28 rounded bg-white/[0.06]" />
            </div>
            {Array.from({ length: cols - 1 }).map((_, j) => (
              <div key={j} className="h-3.5 rounded bg-white/[0.07]"
                style={{ width: 60 + (j % 4) * 12 }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
