import { UpstoxProvider } from '@/lib/upstox-tick-data';
import { TickDataProvider } from '@/lib/tick-data';
import type { ReactNode } from 'react';

export default function OrdersLayout({ children }: { children: ReactNode }) {
  return (
    <UpstoxProvider>
      <TickDataProvider feedType="stocks">
        {children}
      </TickDataProvider>
    </UpstoxProvider>
  );
}
