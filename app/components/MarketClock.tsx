'use client';

import { useEffect, useState } from 'react';

interface Props {
  timezone: string;   // IANA: "America/New_York", "Asia/Kolkata", etc.
  locale?: string;    // "en-US", "en-IN", "en-HK"  — defaults to "en-US"
}

function getNow(timezone: string, locale: string) {
  const now = new Date();

  const datePart = now.toLocaleDateString(locale, {
    timeZone: timezone,
    weekday: 'long',
    year:    'numeric',
    month:   'long',
    day:     'numeric',
  });

  const timePart = now.toLocaleTimeString(locale, {
    timeZone:     timezone,
    hour:         '2-digit',
    minute:       '2-digit',
    second:       '2-digit',
    hour12:       false,
  });

  // Pull the short timezone abbreviation (e.g. "EST", "IST", "HKT")
  const tzPart = new Intl.DateTimeFormat(locale, {
    timeZone:     timezone,
    timeZoneName: 'short',
  })
    .formatToParts(now)
    .find(p => p.type === 'timeZoneName')?.value ?? '';

  return { datePart, timePart, tzPart };
}

export default function MarketClock({ timezone, locale = 'en-US' }: Props) {
  const [display, setDisplay] = useState(() => getNow(timezone, locale));

  useEffect(() => {
    const id = setInterval(() => setDisplay(getNow(timezone, locale)), 1000);
    return () => clearInterval(id);
  }, [timezone, locale]);

  return (
    <div className="text-right">
      <div className="text-xs text-zinc-500 font-mono">
        {display.datePart}
      </div>
      <div className="text-sm font-mono font-semibold text-zinc-300 tabular-nums mt-0.5">
        {display.timePart}
        <span className="ml-1.5 text-xs font-normal text-zinc-500">{display.tzPart}</span>
      </div>
    </div>
  );
}
