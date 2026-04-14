'use client';

/**
 * MarketSync brand logo — three ascending candlestick bars on a
 * emerald-to-blue gradient background.
 *
 * Usage:
 *   <MarketSyncLogo size={32} />                 — icon only
 *   <MarketSyncLogo size={32} showName />         — icon + "MarketSync" text
 *   <MarketSyncLogo size={48} showName textLg />  — large variant (login page)
 */

interface Props {
  /** Pixel size of the square icon */
  size?: number;
  /** Also render the "MarketSync" word-mark next to the icon */
  showName?: boolean;
  /** Use large text for the word-mark */
  textLg?: boolean;
  className?: string;
}

export default function MarketSyncLogo({
  size = 32,
  showName = false,
  textLg = false,
  className = '',
}: Props) {
  const r = Math.round(size * 0.22);   // corner radius scales with size
  const uid = `ms-${size}`;            // unique gradient id per size

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="MarketSync logo"
        style={{ flexShrink: 0 }}
      >
        <defs>
          <linearGradient id={`${uid}-bg`} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
            <stop stopColor="#10b981" />
            <stop offset="1" stopColor="#1d4ed8" />
          </linearGradient>
          <linearGradient id={`${uid}-shine`} x1="0" y1="0" x2="0" y2="32" gradientUnits="userSpaceOnUse">
            <stop stopColor="white" stopOpacity="0.18" />
            <stop offset="1" stopColor="white" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Background */}
        <rect width="32" height="32" rx={r} fill={`url(#${uid}-bg)`} />
        {/* Subtle top-shine overlay */}
        <rect width="32" height="32" rx={r} fill={`url(#${uid}-shine)`} />

        {/* ── Candle 1 — left, small (bullish) ── */}
        {/* wick */}
        <rect x="6.25" y="18" width="1.5" height="8" rx="0.75" fill="white" fillOpacity="0.55" />
        {/* body */}
        <rect x="4" y="19.5" width="6" height="5" rx="1" fill="white" />

        {/* ── Candle 2 — center, medium (bearish / hollow) ── */}
        {/* wick */}
        <rect x="15.25" y="11.5" width="1.5" height="10.5" rx="0.75" fill="white" fillOpacity="0.55" />
        {/* body outline only */}
        <rect x="13" y="13.5" width="6" height="6.5" rx="1" fill="white" fillOpacity="0.22" stroke="white" strokeWidth="1.2" />

        {/* ── Candle 3 — right, tall (bullish) ── */}
        {/* wick */}
        <rect x="24.25" y="5.5" width="1.5" height="15" rx="0.75" fill="white" fillOpacity="0.55" />
        {/* body */}
        <rect x="22" y="7.5" width="6" height="9" rx="1" fill="white" />

        {/* ── Ascending trend line connecting the candle tops ── */}
        <path
          d="M7 19 L16 13 L25 7"
          stroke="white"
          strokeOpacity="0.35"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {showName && (
        <span
          className={`font-bold tracking-tight text-white ${
            textLg ? 'text-2xl' : 'text-sm'
          }`}
          style={{ lineHeight: 1 }}
        >
          Market<span className="text-emerald-400">Sync</span>
        </span>
      )}
    </div>
  );
}
