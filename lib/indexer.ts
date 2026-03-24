import { put, list } from '@vercel/blob';
import type { LeaderboardData, LeaderboardEntry, CollectorData } from './types';

const API         = 'https://api.cc0mon.com';
const CONTRACT    = '0xeeb036dbbd3039429c430657ed9836568da79d5f';
const TOTAL       = 9999;
const CONCURRENCY = 40;
const BLOB_KEY    = 'cc0masters/leaderboard.json';

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (res.status === 429) { await sleep(65000); continue; }
    if (!res.ok && i < retries) { await sleep(2000); continue; }
    return res;
  }
  throw new Error(`Failed: ${url}`);
}

async function getLatestBlock(): Promise<number> {
  const res = await fetch('https://eth.llamarpc.com', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc:'2.0', method:'eth_blockNumber', params:[], id:1 }),
  });
  const d = await res.json();
  return parseInt(d.result, 16);
}

async function getTransferredAddresses(fromBlock: number, toBlock: number): Promise<Set<string>> {
  const addresses = new Set<string>();
  const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
  for (let start = fromBlock; start <= toBlock; start += 2000) {
    const end = Math.min(start + 1999, toBlock);
    const res = await fetch('https://eth.llamarpc.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', method: 'eth_getLogs', id: 1,
        params: [{ address: CONTRACT, topics: [TRANSFER_TOPIC],
          fromBlock: '0x' + start.toString(16), toBlock: '0x' + end.toString(16) }],
      }),
    });
    const d = await res.json();
    if (d.result) {
      for (const log of d.result) {
        if (log.topics[1]) addresses.add('0x' + log.topics[1].slice(26).toLowerCase());
        if (log.topics[2]) addresses.add('0x' + log.topics[2].slice(26).toLowerCase());
      }
    }
    await sleep(200);
  }
  addresses.delete('0x0000000000000000000000000000000000000000');
  return addresses;
}

async function fetchCollectors(addresses: string[], log: (msg: string) => void): Promise<CollectorData[]> {
  const results: CollectorData[] = [];
  for (let i = 0; i < addresses.length; i += CONCURRENCY) {
    const chunk = addresses.slice(i, i + CONCURRENCY);
    await Promise.allSettled(chunk.map(addr =>
      fetchWithRetry(`${API}/collector/${addr}`)
        .then(r => r.json())
        .then((d: CollectorData) => { if (d.address) results.push(d); })
        .catch(() => {})
    ));
    log(`Loaded ${Math.min(i + CONCURRENCY, addresses.length)}/${addresses.length} collections`);
    if (i + CONCURRENCY < addresses.length) await sleep(45000);
  }
  return results;
}

async function scanAllOwners(log: (msg: string) => void): Promise<Map<string, number[]>> {
  const ownerMap = new Map<string, number[]>();
  for (let start = 1; start <= TOTAL; start += CONCURRENCY) {
    const end = Math.min(start + CONCURRENCY - 1, TOTAL);
    const ids = Array.from({ length: end - start + 1 }, (_, i) => start + i);
    await Promise.allSettled(ids.map(id =>
      fetchWithRetry(`${API}/cc0mon/${id}/owner`)
        .then(r => r.json())
        .then((d: { owner?: string }) => {
          if (d.owner) {
            const addr = d.owner.toLowerCase();
            if (!ownerMap.has(addr)) ownerMap.set(addr, []);
            ownerMap.get(addr)!.push(id);
          }
        })
        .catch(() => {})
    ));
    log(`Scanned tokens ${start}–${end} · ${ownerMap.size} unique holders`);
    if (end < TOTAL) await sleep(45000);
  }
  return ownerMap;
}

/* ── Save leaderboard — store as PUBLIC so it can be read without SDK auth ── */
export async function saveLeaderboard(data: LeaderboardData) {
  await put(BLOB_KEY, JSON.stringify(data), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

/* ── Load leaderboard — list() to find URL, fetch() to read ── */
export async function loadLeaderboard(): Promise<LeaderboardData | null> {
  try {
    const { blobs } = await list({ prefix: BLOB_KEY, limit: 1 });
    if (!blobs.length) {
      console.error('[loadLeaderboard] No blob found with prefix:', BLOB_KEY);
      return null;
    }
    // Public blob — url is directly accessible
    const res = await fetch(blobs[0].url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      console.error('[loadLeaderboard] fetch failed:', res.status, blobs[0].url.slice(0, 80));
      return null;
    }
    return await res.json();
  } catch (e) {
    console.error('[loadLeaderboard] error:', String(e));
    return null;
  }
}

/* ══ FULL INDEX ══ */
export async function runFullIndex(log: (phase: string, pct: number, detail: string) => void = () => {}) {
  log('SCANNING OWNERS', 0, 'Starting full token scan...');
  const ownerMap = await scanAllOwners(msg => log('SCANNING OWNERS', 10, msg));
  const addresses = Array.from(ownerMap.keys());
  log('LOADING COLLECTIONS', 50, `Found ${addresses.length} holders`);
  const collectors = await fetchCollectors(addresses, msg => log('LOADING COLLECTIONS', 75, msg));
  const latestBlock = await getLatestBlock();
  collectors.sort((a, b) => b.collected - a.collected);
  const leaderboard: LeaderboardData = {
    updatedAt: new Date().toISOString(),
    scannedBlock: latestBlock,
    totalOwners: collectors.length,
    totalTokensScanned: TOTAL,
    leaders: collectors.map((c, i) => ({ rank: i + 1, ...c })),
  };
  log('SAVING', 98, 'Writing to database...');
  await saveLeaderboard(leaderboard);
  log('COMPLETE', 100, `${collectors.length} holders ranked`);
  return leaderboard;
}

/* ══ INCREMENTAL UPDATE ══ */
export async function runIncrementalUpdate(log: (phase: string, pct: number, detail: string) => void = () => {}) {
  log('LOADING', 5, 'Loading existing leaderboard...');
  const existing = await loadLeaderboard();

  if (!existing) {
    const msg = 'No leaderboard data found. Run Admin Scan from the site footer first.';
    log('ERROR', 0, msg);
    throw new Error(msg);
  }

  if (!existing.scannedBlock) {
    log('NO BLOCK', 50, 'No scannedBlock — returning existing data');
    return existing;
  }

  const latestBlock = await getLatestBlock();
  const fromBlock = existing.scannedBlock + 1;

  if (fromBlock > latestBlock) {
    log('UP TO DATE', 100, `Already at block ${latestBlock}`);
    return existing;
  }

  const blockDelta = latestBlock - fromBlock;
  log('CHECKING TRANSFERS', 15, `Scanning ${blockDelta.toLocaleString()} new blocks...`);

  const changedAddresses = await getTransferredAddresses(fromBlock, latestBlock);

  if (changedAddresses.size === 0) {
    const updated = { ...existing, scannedBlock: latestBlock, updatedAt: new Date().toISOString() };
    await saveLeaderboard(updated);
    log('NO CHANGES', 100, `No transfers in ${blockDelta.toLocaleString()} blocks`);
    return updated;
  }

  log('REFRESHING', 40, `${changedAddresses.size} affected addresses — refreshing...`);
  const refreshed = await fetchCollectors(Array.from(changedAddresses), msg => log('REFRESHING', 60, msg));

  const leaderMap = new Map<string, LeaderboardEntry>();
  for (const entry of existing.leaders) leaderMap.set(entry.address.toLowerCase(), entry);
  for (const c of refreshed) {
    const { checklist: _, ...rest } = c as typeof c & { checklist?: unknown };
    leaderMap.set(c.address.toLowerCase(), { rank: 0, ...rest } as LeaderboardEntry);
  }

  const result_leaders = Array.from(leaderMap.values()).filter(e => e.totalTokensHeld > 0 || e.collected > 0);
  result_leaders.sort((a, b) => b.collected - a.collected);
  result_leaders.forEach((e, i) => { e.rank = i + 1; });

  const result: LeaderboardData = {
    updatedAt: new Date().toISOString(),
    scannedBlock: latestBlock,
    totalOwners: result_leaders.length,
    totalTokensScanned: TOTAL,
    leaders: result_leaders,
  };

  await saveLeaderboard(result);
  log('COMPLETE', 100, `Updated ${changedAddresses.size} holders · ${result_leaders.length} total`);
  return result;
}
