export default function PageLoader() {
  return (
    <div className="min-h-screen bg-[#161b27] text-white">
      {/* Navbar skeleton */}
      <div className="sticky top-0 z-20 border-b border-white/[0.06] bg-[#161b27]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <div className="skeleton h-7 w-32 rounded-lg bg-white/10" />
            <div className="flex gap-1">
              {[64, 48, 56].map(w => (
                <div key={w} className={`skeleton h-7 w-${w === 64 ? 16 : w === 48 ? 12 : 14} rounded-lg bg-white/[0.06]`} style={{ width: w }} />
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <div className="skeleton h-7 w-7 rounded-full bg-white/10" />
            <div className="skeleton h-7 w-16 rounded-lg bg-white/[0.06]" />
          </div>
        </div>
      </div>

      {/* Top progress bar */}
      <div className="h-0.5 w-full overflow-hidden bg-transparent">
        <div className="progress-bar h-full bg-emerald-500" />
      </div>

      {/* Page content skeleton */}
      <div className="mx-auto max-w-6xl px-6 py-8">
        {/* Heading */}
        <div className="mb-6 flex items-end justify-between">
          <div className="space-y-2">
            <div className="skeleton h-7 w-44 rounded-lg bg-white/10" />
            <div className="skeleton h-4 w-72 rounded bg-white/[0.06]" />
          </div>
          <div className="skeleton h-8 w-24 rounded-lg bg-white/[0.06]" />
        </div>

        {/* Table skeleton */}
        <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
          {/* Header row */}
          <div className="flex items-center border-b border-white/[0.06] px-5 py-3 gap-8">
            {[120, 80, 80, 80, 70, 100, 90].map((w, i) => (
              <div key={i} className="skeleton h-3 rounded bg-white/10" style={{ width: w }} />
            ))}
          </div>
          {/* Data rows */}
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center border-b border-white/[0.04] px-5 py-4 gap-8">
              <div className="space-y-1.5" style={{ width: 120 }}>
                <div className="skeleton h-3.5 w-20 rounded bg-white/10" />
                <div className="skeleton h-2.5 w-28 rounded bg-white/[0.06]" />
              </div>
              {[80, 80, 80, 70, 100, 90].map((w, j) => (
                <div key={j} className="skeleton h-3.5 rounded bg-white/[0.07]" style={{ width: w }} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
