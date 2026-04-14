import NavBar from '@/app/components/NavBar';
import ConnectionBadge from '@/app/components/ConnectionBadge';
import WatchList from '@/app/components/WatchList';
import MarketClock from '@/app/components/MarketClock';
import { getMarket } from '@/config/markets';

const market = getMarket('us')!;

export default function USMarketPage() {
  return (
    <main className="min-h-screen bg-[#0d1117] text-white">
      <NavBar actions={<ConnectionBadge />} />

      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">{market.flag} {market.name}</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Real-time order book · NYSE &amp; NASDAQ · via AllTick
            </p>
          </div>
          <MarketClock timezone={market.timezone} locale="en-US" />
        </div>

        <WatchList market={market} />
      </div>
    </main>
  );
}
