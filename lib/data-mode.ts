import { prisma } from './prisma';

export type DataMode = 'cache-aside' | 'db-first';

// In-memory cache with 30s TTL — avoids a DB hit on every chart request
const cache: { value: DataMode; expiresAt: number } = {
  value: 'cache-aside',
  expiresAt: 0,
};

export async function getDataMode(): Promise<DataMode> {
  if (Date.now() < cache.expiresAt) return cache.value;

  try {
    const row = await prisma.setting.findUnique({ where: { key: 'data_mode' } });
    const mode = (row?.value ?? 'cache-aside') as DataMode;
    cache.value = mode;
    cache.expiresAt = Date.now() + 30_000; // 30s TTL
    return mode;
  } catch {
    return cache.value; // fall back to last known value
  }
}

export async function setDataMode(mode: DataMode): Promise<void> {
  await prisma.setting.upsert({
    where:  { key: 'data_mode' },
    update: { value: mode },
    create: { key: 'data_mode', value: mode },
  });
  // Immediately invalidate cache
  cache.value = mode;
  cache.expiresAt = Date.now() + 30_000;
}
