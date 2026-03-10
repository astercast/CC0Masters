import { put, list, head } from '@vercel/blob';
import type { LeaderboardData, LeaderboardEntry, CollectorData } from './types';

const API         = 'https://api.cc0mon.com';
const CONTRACT    = '0xeeb036dbbd3039429c430657ed9836568da79d5f';
const TOTAL       = 9999;
const CONCURRENCY = 40;
const WAVE_DELAY  = 65000;

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

/* ── Get current Ethereum block via public RPC ── */
async function getLatestBlock(): Promise<number> {
  const res = await fetch('https://eth.llamarpc.com', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc:'2.0', method:'eth_blockNumber', params:[], id:1 }),
  });
  const d = await res.json();
  return parseInt(d.result, 16);
}

/* ── Get Transfer events from block range via public RPC ── */
async function getTransferredAddresses(fromBlock: number, toBlock: number): Promise<Set<string>> {
  const addresses = new Set<string>();
  // ERC-721 Transfer topic
  const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

  // Fetch in chunks of 2000 blocks (public RPC limit)
  for (let start = fromBlock; start <= toBlock; start += 2000) {
    const end = Math.min(start + 1999, toBlock);
    const res = await fetch('https://eth.llamarpc.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', method: 'eth_getLogs', id: 1,
        params: [{
          address: CONTRACT,
          topics: [TRANSFER_TOPIC],
          fromBlock: '0x' + start.toString(16),
          toBlock:   '0x' + end.toString(16),
        }],
      }),
    });
    const d = await res.json();
    if (d.result) {
      for (const log of d.result) {
        // topic[1] = from, topic[2] = to (padded to 32 bytes)
        if (log.topics[1]) addresses.add('0x' + log.topics[1].slice(26));
        if (log.topics[2]) addresses.add('0x' + log.topics[2].slice(26));
      }
    }
    await sleep(200); // gentle pause between RPC calls
  }
  // Remove zero address (mint/burn)
  addresses.delete('0x0000000000000000000000000000000000000000');
  return addresses;
}

/* ── Fetch collector data for a list of addresses ── */
async function fetchCollectors(
  addresses: string[],
  log: (msg: string) => void
): Promise<CollectorData[]> {
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
    if (i + CONCURRENCY < addresses.length) await sleep(WAVE_DELAY);
  }
  return results;
}

/* ── Fetch ALL owners (full scan, for first-time index) ── */
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
    if (end < TOTAL) await sleep(WAVE_DELAY);
  }
  return ownerMap;
}

/* ── Save leaderboard to Blob ── */
async function saveLeaderboard(data: LeaderboardData) {
  await put('cc0masters/leaderboard.json', JSON.stringify(data), {
    access: 'public', contentType: 'application/json', addRandomSuffix: false,
  });
}

/* ── Load existing leaderboard from Blob ── */
async function loadLeaderboard(): Promise<LeaderboardData | null> {
  try {
    const blob = await head('cc0masters/leaderboard.json');
    if (!blob) return null;
    const res = await fetch(blob.url);
    return await res.json();
  } catch { return null; }
}

/* ══════════════════════════════════════════════════════
   FULL INITIAL INDEX  — call once to seed the leaderboard
══════════════════════════════════════════════════════ */
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

/* ══════════════════════════════════════════════════════
   INCREMENTAL UPDATE  — only re-fetches changed addresses
══════════════════════════════════════════════════════ */
export async function runIncrementalUpdate(log: (phase: string, pct: number, detail: string) => void = () => {}) {
  // Load existing data
  log('LOADING', 5, 'Loading existing leaderboard...');
  const existing = await loadLeaderboard();
  if (!existing || !existing.scannedBlock) {
    log('FULL SCAN NEEDED', 0, 'No existing data — running full scan');
    return runFullIndex(log);
  }

  const latestBlock = await getLatestBlock();
  const fromBlock = existing.scannedBlock + 1;

  if (fromBlock > latestBlock) {
    log('UP TO DATE', 100, `Already up to date at block ${latestBlock}`);
    return existing;
  }

  const blockDelta = latestBlock - fromBlock;
  log('CHECKING TRANSFERS', 15, `Scanning ${blockDelta.toLocaleString()} new blocks (${fromBlock} → ${latestBlock})...`);

  // Find all addresses that had token transfers since last scan
  const changedAddresses = await getTransferredAddresses(fromBlock, latestBlock);

  if (changedAddresses.size === 0) {
    log('NO CHANGES', 100, `No transfers found in ${blockDelta.toLocaleString()} blocks`);
    // Update the block number so next run knows where we left off
    const updated = { ...existing, scannedBlock: latestBlock, updatedAt: new Date().toISOString() };
    await saveLeaderboard(updated);
    return updated;
  }

  log('REFRESHING', 40, `Found ${changedAddresses.size} affected addresses — refreshing their data...`);

  // Re-fetch only the changed addresses
  const updated = await fetchCollectors(Array.from(changedAddresses), msg => log('REFRESHING', 60, msg));

  // Merge: update changed entries, keep unchanged ones
  const leaderMap = new Map<string, LeaderboardEntry>();
  for (const entry of existing.leaders) leaderMap.set(entry.address.toLowerCase(), entry);
  for (const c of updated) leaderMap.set(c.address.toLowerCase(), { rank: 0, ...c } as LeaderboardEntry);

  const merged = Array.from(leaderMap.values());
  merged.sort((a, b) => b.collected - a.collected);
  merged.forEach((e, i) => { e.rank = i + 1; });

  const result: LeaderboardData = {
    updatedAt: new Date().toISOString(),
    scannedBlock: latestBlock,
    totalOwners: merged.length,
    totalTokensScanned: TOTAL,
    leaders: merged,
  };

  log('SAVING', 95, 'Saving updated leaderboard...');
  await saveLeaderboard(result);
  log('COMPLETE', 100, `Updated ${changedAddresses.size} holders across ${blockDelta.toLocaleString()} new blocks`);
  return result;
}
