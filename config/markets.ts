/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║               MarketSync — Market Configuration          ║
 * ╠══════════════════════════════════════════════════════════╣
 * ║  Add, remove, or reorder markets here.                   ║
 * ║  Set  enabled: false  to hide a market without deleting. ║
 * ║  Instruments are shown top-to-bottom in the watchlist.   ║
 * ╚══════════════════════════════════════════════════════════╝
 */

export type Provider = 'alltick' | 'upstox';

export interface Instrument {
  /** Data-provider code: "AAPL.US", "700.HK", "NSE_EQ|INE002A01018" */
  code: string;
  /** Short ticker shown in the UI: "AAPL", "0700", "RELIANCE" */
  label: string;
  /** Full company / fund name */
  name: string;
}

export interface MarketConfig {
  /** URL path segment — must match the folder under app/  e.g. "us" → /us */
  id: string;
  /** Display name shown in the nav bar */
  name: string;
  /** Emoji flag */
  flag: string;
  /** Data provider for this market */
  provider: Provider;
  /** Currency symbol shown next to prices */
  currencySymbol: string;
  /** IANA timezone for local-time display */
  timezone: string;
  /** Human-readable trading hours (shown in the "waiting" placeholder) */
  hours: string;
  /** Set to false to hide from nav without removing the config */
  enabled: boolean;
  /**
   * Candlestick intervals supported by the data provider for this market.
   * Only these buttons are shown in the chart modal.
   */
  klineIntervals: string[];
  /** Watchlist instruments */
  instruments: Instrument[];
}

// ─────────────────────────────────────────────────────────────
//  Market definitions — edit freely
// ─────────────────────────────────────────────────────────────

export const MARKETS: MarketConfig[] = [

  // ── United States (AllTick) ───────────────────────────────
  {
    id:             'us',
    name:           'US Market',
    flag:           '🇺🇸',
    provider:       'alltick',
    currencySymbol: '$',
    timezone:       'America/New_York',
    hours:          '9:30 AM – 4:00 PM ET',
    enabled:        true,
    klineIntervals: ['1m', '5m', '15m', '30m', '1h', '1d'],
    instruments: [
      { code: 'AAPL.US',  label: 'AAPL',  name: 'Apple'           },
      { code: 'MSFT.US',  label: 'MSFT',  name: 'Microsoft'       },
      { code: 'NVDA.US',  label: 'NVDA',  name: 'Nvidia'          },
      { code: 'TSLA.US',  label: 'TSLA',  name: 'Tesla'           },
      { code: 'AMZN.US',  label: 'AMZN',  name: 'Amazon'          },
      { code: 'GOOGL.US', label: 'GOOGL', name: 'Alphabet'        },
      { code: 'META.US',  label: 'META',  name: 'Meta'            },
      { code: 'UNH.US',   label: 'UNH',   name: 'UnitedHealth'    },
    ],
  },

  // ── Hong Kong (AllTick) ───────────────────────────────────
  // AllTick only returns data for kline_type 1/5/15 (minute-count) for HK
  // with the current token tier; 30m/1h/1d return 502 errors.
  {
    id:             'hk',
    name:           'HK Market',
    flag:           '🇭🇰',
    provider:       'alltick',
    currencySymbol: 'HK$',
    timezone:       'Asia/Hong_Kong',
    hours:          '9:30 AM – 4:00 PM HKT',
    enabled:        true,
    klineIntervals: ['1m', '5m', '15m'],
    instruments: [
      { code: '700.HK',   label: '0700',  name: 'Tencent'         },
      { code: '9988.HK',  label: '9988',  name: 'Alibaba'         },
      { code: '1299.HK',  label: '1299',  name: 'AIA Group'       },
      { code: '0005.HK',  label: '0005',  name: 'HSBC Holdings'   },
      { code: '0941.HK',  label: '0941',  name: 'China Mobile'    },
      { code: '3690.HK',  label: '3690',  name: 'Meituan'         },
      { code: '2318.HK',  label: '2318',  name: 'Ping An'         },
      { code: '1810.HK',  label: '1810',  name: 'Xiaomi'          },
    ],
  },

  // ── India / NSE (Upstox) ──────────────────────────────────
  // Note: Upstox instrument keys use the format NSE_EQ|<ISIN>
  // The label/name here are for display only; the watchlist
  // for India is driven by the Upstox context separately.
  {
    id:             'india',
    name:           'India Market',
    flag:           '🇮🇳',
    provider:       'upstox',
    currencySymbol: '₹',
    timezone:       'Asia/Kolkata',
    hours:          '9:15 AM – 3:30 PM IST',
    enabled:        true,
    klineIntervals: ['1m', '5m', '15m', '30m', '1h', '1d'],
    instruments: [
      { code: 'NSE_EQ|INE002A01018', label: 'RELIANCE',  name: 'Reliance Industries'   },
      { code: 'NSE_EQ|INE467B01029', label: 'TCS',       name: 'Tata Consultancy'      },
      { code: 'NSE_EQ|INE009A01021', label: 'INFY',      name: 'Infosys'               },
      { code: 'NSE_EQ|INE040A01034', label: 'HDFCBANK',  name: 'HDFC Bank'             },
      { code: 'NSE_EQ|INE090A01021', label: 'ICICIBANK', name: 'ICICI Bank'            },
      { code: 'NSE_EQ|INE075A01022', label: 'WIPRO',     name: 'Wipro'                 },
      { code: 'NSE_EQ|INE154A01025', label: 'ITC',       name: 'ITC Limited'           },
      { code: 'NSE_EQ|INE062A01020', label: 'SBIN',      name: 'State Bank of India'   },
    ],
  },

  // ── Template: add more AllTick markets below ──────────────
  // {
  //   id:             'cn',
  //   name:           'China A-Share',
  //   flag:           '🇨🇳',
  //   provider:       'alltick',
  //   currencySymbol: '¥',
  //   timezone:       'Asia/Shanghai',
  //   hours:          '9:30 AM – 3:00 PM CST',
  //   enabled:        false,   // ← flip to true to activate
  //   instruments: [
  //     { code: '600519.SH', label: '600519', name: 'Kweichow Moutai' },
  //   ],
  // },

];

// ─────────────────────────────────────────────────────────────
//  Helpers — don't need to edit these
// ─────────────────────────────────────────────────────────────

export function getMarket(id: string): MarketConfig | undefined {
  return MARKETS.find(m => m.id === id);
}

export function enabledMarkets(): MarketConfig[] {
  return MARKETS.filter(m => m.enabled);
}

export function instrumentMap(market: MarketConfig): Record<string, Instrument> {
  return Object.fromEntries(market.instruments.map(i => [i.code, i]));
}
