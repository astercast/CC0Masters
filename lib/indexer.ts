import { put } from '@vercel/blob';
import type { CollectorData, LeaderboardData, LeaderboardEntry } from './types';

const API = 'https://api.cc0mon.com';
const TOTAL_TOKENS = 9999;
const CONCURRENCY = 40; // parallel requests per wave
const WAVE_DELAY = 65000; // ms between waves (rate limit: 60/min)

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { next: { revalidate: 0 } });
      if (res.status === 429) {
        // Rate limited — wait and retry
        await sleep(65000);
        continue;
      }
      return res;
    } catch {
      if (i === retries - 1) throw new Error(`Failed after ${retries} retries: ${url}`);
      await sleep(2000);
    }
  }
  throw new Error(`Exhausted retries: ${url}`);
}

// Scan all token owners in batches respecting rate limit
export async function scanAllOwners(
  onProgress?: (scanned: number, total: number, owners: number) => void
): Promise<Map<string, number[]>> {
  const ownerMap = new Map<string, number[]>();

  for (let start = 1; start <= TOTAL_TOKENS; start += CONCURRENCY) {
    const end = Math.min(start + CONCURRENCY - 1, TOTAL_TOKENS);
    const ids = Array.from({ length: end - start + 1 }, (_, i) => start + i);

    await Promise.all(ids.map(async (id) => {
      try {
        const res = await fetchWithRetry(`${API}/cc0mon/${id}/owner`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.owner) {
          const addr = data.owner.toLowerCase();
          if (!ownerMap.has(addr)) ownerMap.set(addr, []);
          ownerMap.get(addr)!.push(id);
        }
      } catch { /* skip failed tokens */ }
    }));

    onProgress?.(end, TOTAL_TOKENS, ownerMap.size);

    // Rate limit: after each wave, wait before next
    if (end < TOTAL_TOKENS) {
      await sleep(WAVE_DELAY);
    }
  }

  return ownerMap;
}

// Fetch collector data for all owners in batches
export async function fetchAllCollectors(
  addresses: string[],
  onProgress?: (done: number, total: number) => void
): Promise<CollectorData[]> {
  const results: CollectorData[] = [];
  let done = 0;

  for (let i = 0; i < addresses.length; i += CONCURRENCY) {
    const chunk = addresses.slice(i, i + CONCURRENCY);

    const chunkResults = await Promise.all(chunk.map(async (addr) => {
      try {
        const res = await fetchWithRetry(`${API}/collector/${addr}`);
        if (!res.ok) return null;
        return await res.json() as CollectorData;
      } catch { return null; }
    }));

    for (const r of chunkResults) {
      if (r) results.push(r);
    }
    done += chunk.length;
    onProgress?.(done, addresses.length);

    if (i + CONCURRENCY < addresses.length) {
      await sleep(WAVE_DELAY);
    }
  }

  return results;
}

// Full index run — scan owners, fetch collections, write to Blob
export async function runFullIndex(
  onProgress?: (phase: string, pct: number, detail: string) => void
): Promise<LeaderboardData> {
  onProgress?.('SCANNING TOKENS', 0, 'Starting token scan...');

  // Phase 1: Discover all owners
  const ownerMap = await scanAllOwners((scanned, total, owners) => {
    const pct = Math.round(scanned / total * 50);
    onProgress?.('SCANNING TOKENS', pct, `Scanned ${scanned}/${total} tokens — ${owners} unique owners found`);
  });

  const addresses = Array.from(ownerMap.keys());
  onProgress?.('LOADING COLLECTIONS', 50, `Found ${addresses.length} owners — loading collections...`);

  // Phase 2: Fetch each collector's full data
  const collectors = await fetchAllCollectors(addresses, (done, total) => {
    const pct = 50 + Math.round(done / total * 45);
    onProgress?.('LOADING COLLECTIONS', pct, `Loaded ${done}/${total} collections`);
  });

  onProgress?.('BUILDING LEADERBOARD', 95, 'Building and saving leaderboard...');

  // Phase 3: Sort and build leaderboard
  collectors.sort((a, b) => b.collected - a.collected);

  const leaders: LeaderboardEntry[] = collectors.map((c, i) => ({
    rank: i + 1,
    address: c.address,
    collected: c.collected,
    missing: c.missing,
    progress: c.progress,
    totalTokensHeld: c.totalTokensHeld,
    byEnergy: c.byEnergy,
    checklist: c.checklist,
  }));

  const leaderboard: LeaderboardData = {
    updatedAt: new Date().toISOString(),
    totalOwners: leaders.length,
    totalTokensScanned: TOTAL_TOKENS,
    leaders,
  };

  // Phase 4: Store in Vercel Blob
  await put('cc0masters/leaderboard.json', JSON.stringify(leaderboard), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
  });

  onProgress?.('COMPLETE', 100, `Leaderboard saved — ${leaders.length} collectors ranked`);
  return leaderboard;
}
