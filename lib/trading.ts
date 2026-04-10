/**
 * Shared paper-trading engine.
 * Uses sequential Prisma operations (no interactive transactions) to stay
 * compatible with the PrismaPg driver-adapter used in Prisma 7.
 */

import { prisma } from './prisma';

export const DEMO_USER_EMAIL = 'demo@marketsync.local';

// ── Ensure demo user exists ──────────────────────────────────────────────────

export async function getOrCreateDemoUser() {
  return prisma.user.upsert({
    where:  { email: DEMO_USER_EMAIL },
    update: {},
    create: { name: 'Demo Trader', email: DEMO_USER_EMAIL, balance: 100_000 },
  });
}

// ── Place an order ────────────────────────────────────────────────────────────

export interface PlaceOrderInput {
  userId:         string;
  symbol:         string;
  market:         string;
  label:          string;
  currencySymbol: string;
  side:           'BUY' | 'SELL';
  orderType:      'MARKET' | 'LIMIT';
  quantity:       number;
  price:          number;
  notes?:         string;
}

export async function placeOrder(input: PlaceOrderInput) {
  const { userId, symbol, market, label, currencySymbol, side, orderType, quantity, price, notes } = input;

  if (quantity <= 0) throw new Error('Quantity must be positive');
  if (price    <= 0) throw new Error('Price must be positive');

  // LIMIT orders are recorded as PENDING with no immediate cash movement
  if (orderType === 'LIMIT') {
    return prisma.order.create({
      data: {
        userId, symbol, market, label, currencySymbol,
        side, orderType, status: 'PENDING', quantity, price, notes: notes ?? null,
      },
    });
  }

  // MARKET orders execute immediately
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  if (side === 'BUY') {
    const cost = price * quantity;
    if (user.balance < cost) throw new Error(`Insufficient balance — need $${cost.toFixed(2)}, have $${user.balance.toFixed(2)}`);
    return executeBuy({ user, symbol, market, label, currencySymbol, quantity, price, orderType, notes });
  } else {
    return executeSell({ user, symbol, market, label, currencySymbol, quantity, price, orderType, notes });
  }
}

// ── Internal execution helpers ────────────────────────────────────────────────

interface ExecArgs {
  user:           { id: string; balance: number };
  symbol:         string;
  market:         string;
  label:          string;
  currencySymbol: string;
  quantity:       number;
  price:          number;
  orderType:      string;
  notes?:         string;
}

async function executeBuy({ user, symbol, market, label, currencySymbol, quantity, price, orderType, notes }: ExecArgs) {
  const cost = price * quantity;
  const now  = new Date();

  // 1. Deduct cash
  await prisma.user.update({
    where: { id: user.id },
    data:  { balance: { decrement: cost } },
  });

  // 2. Create filled order
  const order = await prisma.order.create({
    data: {
      userId: user.id, symbol, market, label, currencySymbol,
      side: 'BUY', orderType, status: 'FILLED',
      quantity, price, filledQty: quantity, avgFillPrice: price,
      filledAt: now, notes: notes ?? null,
    },
  });

  // 3. Upsert position (weighted-average cost)
  const existing = await prisma.position.findUnique({
    where: { userId_symbol: { userId: user.id, symbol } },
  });

  if (existing) {
    const newQty  = existing.quantity + quantity;
    const newCost = (existing.avgCost * existing.quantity + price * quantity) / newQty;
    await prisma.position.update({
      where: { userId_symbol: { userId: user.id, symbol } },
      data:  { quantity: newQty, avgCost: newCost },
    });
  } else {
    await prisma.position.create({
      data: { userId: user.id, symbol, market, label, currencySymbol, quantity, avgCost: price },
    });
  }

  return order;
}

async function executeSell({ user, symbol, market, label, currencySymbol, quantity, price, orderType, notes }: ExecArgs) {
  const position = await prisma.position.findUnique({
    where: { userId_symbol: { userId: user.id, symbol } },
  });

  if (!position || position.quantity < quantity - 0.0001) {
    throw new Error(`Insufficient position — holding ${position?.quantity ?? 0}, selling ${quantity}`);
  }

  const proceeds    = price * quantity;
  const realizedPnl = (price - position.avgCost) * quantity;
  const now         = new Date();

  // 1. Credit proceeds
  await prisma.user.update({
    where: { id: user.id },
    data:  { balance: { increment: proceeds } },
  });

  // 2. Create filled order
  const order = await prisma.order.create({
    data: {
      userId: user.id, symbol, market, label, currencySymbol,
      side: 'SELL', orderType, status: 'FILLED',
      quantity, price, filledQty: quantity, avgFillPrice: price,
      filledAt: now, notes: notes ?? null,
    },
  });

  // 3. Update / clear position
  const remaining = position.quantity - quantity;
  if (remaining < 0.0001) {
    await prisma.position.delete({ where: { userId_symbol: { userId: user.id, symbol } } });
  } else {
    await prisma.position.update({
      where: { userId_symbol: { userId: user.id, symbol } },
      data:  { quantity: remaining },
    });
  }

  // 4. Record realized P&L entry
  await prisma.pnlEntry.create({
    data: {
      userId: user.id, symbol, market, label,
      quantity, costBasis: position.avgCost, salePrice: price, realizedPnl,
    },
  });

  return order;
}

// ── Fill a pending LIMIT order ────────────────────────────────────────────────

export async function fillLimitOrder(orderId: string, fillPrice: number) {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  if (order.status !== 'PENDING') throw new Error('Order is not pending');

  const user = await prisma.user.findUniqueOrThrow({ where: { id: order.userId } });

  const execArgs: ExecArgs = {
    user,
    symbol:         order.symbol,
    market:         order.market,
    label:          order.label,
    currencySymbol: order.currencySymbol,
    quantity:       order.quantity,
    price:          fillPrice,
    orderType:      'LIMIT',
  };

  if (order.side === 'BUY') {
    if (user.balance < fillPrice * order.quantity) throw new Error('Insufficient balance');
    await executeBuy(execArgs);
  } else {
    await executeSell(execArgs);
  }

  // Mark the original PENDING record as FILLED
  return prisma.order.update({
    where: { id: orderId },
    data:  { status: 'FILLED', avgFillPrice: fillPrice, filledQty: order.quantity, filledAt: new Date() },
  });
}

// ── Check price alerts ────────────────────────────────────────────────────────

export async function checkAlerts(symbol: string, market: string, currentPrice: number) {
  const alerts = await prisma.priceAlert.findMany({
    where:   { symbol, market, status: 'ACTIVE' },
    include: { user: true },
  });

  const triggered: typeof alerts = [];

  for (const alert of alerts) {
    const hit =
      (alert.condition === 'ABOVE' && currentPrice >= alert.targetPrice) ||
      (alert.condition === 'BELOW' && currentPrice <= alert.targetPrice) ||
      (alert.condition === 'EQUAL' && Math.abs(currentPrice - alert.targetPrice) / alert.targetPrice <= 0.005);
    if (!hit) continue;

    await prisma.priceAlert.update({
      where: { id: alert.id },
      data:  { status: 'TRIGGERED', triggeredAt: new Date(), triggeredPrice: currentPrice },
    });

    if (alert.action !== 'NOTIFY' && alert.quantity && alert.quantity > 0) {
      try {
        await placeOrder({
          userId:         alert.userId,
          symbol:         alert.symbol,
          market:         alert.market,
          label:          alert.label,
          currencySymbol: alert.currencySymbol,
          side:           alert.action as 'BUY' | 'SELL',
          orderType:      'MARKET',
          quantity:       alert.quantity,
          price:          currentPrice,
          notes:          `Auto-triggered: ${alert.condition} ${alert.targetPrice}`,
        });
      } catch (e) {
        console.error('[Alert auto-order failed]', e);
      }
    }
    triggered.push(alert);
  }
  return triggered;
}

// ── Seed demo data ────────────────────────────────────────────────────────────

export async function seedDemoData() {
  const user = await getOrCreateDemoUser();

  const existing = await prisma.order.count({ where: { userId: user.id } });
  if (existing > 0) return user;

  const trades: Omit<PlaceOrderInput, 'userId'>[] = [
    { symbol: 'AAPL.US', market: 'us', label: 'AAPL', currencySymbol: '$', side: 'BUY',  orderType: 'MARKET', quantity: 10, price: 185.50 },
    { symbol: 'MSFT.US', market: 'us', label: 'MSFT', currencySymbol: '$', side: 'BUY',  orderType: 'MARKET', quantity: 5,  price: 415.20 },
    { symbol: 'NVDA.US', market: 'us', label: 'NVDA', currencySymbol: '$', side: 'BUY',  orderType: 'MARKET', quantity: 8,  price: 875.00 },
    { symbol: 'TSLA.US', market: 'us', label: 'TSLA', currencySymbol: '$', side: 'BUY',  orderType: 'MARKET', quantity: 15, price: 242.00 },
    { symbol: 'AAPL.US', market: 'us', label: 'AAPL', currencySymbol: '$', side: 'SELL', orderType: 'MARKET', quantity: 3,  price: 192.00 },
    { symbol: 'NVDA.US', market: 'us', label: 'NVDA', currencySymbol: '$', side: 'BUY',  orderType: 'MARKET', quantity: 2,  price: 910.00 },
  ];

  for (const t of trades) {
    try {
      await placeOrder({ userId: user.id, ...t });
    } catch (e) {
      console.error('[seed] trade failed:', e);
    }
  }

  return user;
}
