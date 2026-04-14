import NavBar from '@/app/components/NavBar';
import UpstoxConnectionBadge from '@/app/components/UpstoxConnectionBadge';
import UpstoxConnectButton from '@/app/components/UpstoxConnectButton';
import IndiaWatchList from '@/app/components/IndiaWatchList';
import MarketClock from '@/app/components/MarketClock';

export default function IndiaMarketPage() {
  return (
    <main className="min-h-screen bg-[#161b27] text-white">
      <NavBar
        actions={
          <div className="flex items-center gap-3">
            <UpstoxConnectionBadge />
            <UpstoxConnectButton />
          </div>
        }
      />

      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">India Market</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Real-time NSE data · LTP · Change · Volume via Upstox
            </p>
          </div>
          <MarketClock timezone="Asia/Kolkata" locale="en-IN" />
        </div>

        <IndiaWatchList />
      </div>
    </main>
  );
}
