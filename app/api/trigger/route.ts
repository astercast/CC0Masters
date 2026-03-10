import { NextResponse } from 'next/server';
import { put, list } from '@vercel/blob';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 min chunks — safe for Pro

const API = 'https://api.cc0mon.com';
const TOTAL_TOKENS = 9999;
const CONCURRENCY = 30;
const WAVE_DELAY = 62000;

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function fetchOwnerBatch(ids: number[]): Promise<Record<string, number[]>> {
  const result: Record<string, number[]> = {};
  await Promise.all(ids.map(async (id) => {
    try {
      const r = await fetch(`${API}/cc0mon/${id}/owner`, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) return;
      const d = await r.json();
      if (d.owner) {
        const addr = d.owner.toLowerCase();
        if (!result[addr]) result[addr] = [];
        result[addr].push(id);
      }
    } catch { /* skip */ }
  }));
  return result;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { phase = 'scan', startToken = 1, ownerMapBlob = null } = body;

  // ── PHASE 1: Scan a chunk of tokens ──────────────────────────
  if (phase === 'scan') {
    const chunkSize = CONCURRENCY * 5; // 150 tokens per POST call
    const end = Math.min(startToken + chunkSize - 1, TOTAL_TOKENS);

    // Load existing owner map from blob if continuing
    let ownerMap: Record<string, number[]> = {};
    if (ownerMapBlob) {
      try {
        const r = await fetch(ownerMapBlob, { cache: 'no-store' });
        ownerMap = await r.json();
      } catch { ownerMap = {}; }
    }

    // Scan this chunk in batches respecting rate limit
    for (let i = startToken; i <= end; i += CONCURRENCY) {
      const batchEnd = Math.min(i + CONCURRENCY - 1, end);
      const ids = Array.from({ length: batchEnd - i + 1 }, (_, j) => i + j);
      const batchResult = await fetchOwnerBatch(ids);
      for (const [addr, tokens] of Object.entries(batchResult)) {
        if (!ownerMap[addr]) ownerMap[addr] = [];
        ownerMap[addr].push(...tokens);
      }
      if (batchEnd < end) await sleep(WAVE_DELAY);
    }

    // Save updated owner map to blob
    const { url } = await put('cc0masters/owner-map.json', JSON.stringify(ownerMap), {
      access: 'public', contentType: 'application/json', addRandomSuffix: false,
    });

    const done = end >= TOTAL_TOKENS;
    return NextResponse.json({
      phase: done ? 'collect' : 'scan',
      progress: Math.round(end / TOTAL_TOKENS * 50),
      nextToken: done ? null : end + 1,
      ownerMapBlob: url,
      ownerCount: Object.keys(ownerMap).length,
      done: false,
    });
  }

  // ── PHASE 2: Collect collector data in chunks ─────────────────
  if (phase === 'collect') {
    const { ownerMapBlob: blobUrl, startIndex = 0 } = body;

    // Load full owner map
    const r = await fetch(blobUrl, { cache: 'no-store' });
    const ownerMap: Record<string, number[]> = await r.json();
    const addresses = Object.keys(ownerMap);

    // Load existing partial results
    let existing: Record<string, object> = {};
    try {
      const { blobs } = await list({ prefix: 'cc0masters/partial-' });
      if (blobs.length) {
        const latest = blobs[0];
        const pr = await fetch(latest.url, { cache: 'no-store' });
        existing = await pr.json();
      }
    } catch { existing = {}; }

    const chunkSize = 40;
    const chunk = addresses.slice(startIndex, startIndex + chunkSize);

    await Promise.all(chunk.map(async (addr) => {
      if (existing[addr]) return; // already fetched
      try {
        const res = await fetch(`${API}/collector/${addr}`, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) return;
        const d = await res.json();
        if (d.address) existing[addr.toLowerCase()] = d;
      } catch { /* skip */ }
    }));

    const nextIndex = startIndex + chunkSize;
    const done = nextIndex >= addresses.length;

    // Save partial progress
    await put(`cc0masters/partial-collectors.json`, JSON.stringify(existing), {
      access: 'public', contentType: 'application/json', addRandomSuffix: false,
    });

    if (done) {
      // Build final leaderboard
      const collectors = Object.values(existing) as any[];
      collectors.sort((a: any, b: any) => b.collected - a.collected);
      const leaderboard = {
        updatedAt: new Date().toISOString(),
        totalOwners: collectors.length,
        totalTokensScanned: TOTAL_TOKENS,
        leaders: collectors.map((c: any, i: number) => ({ rank: i + 1, ...c })),
      };
      await put('cc0masters/leaderboard.json', JSON.stringify(leaderboard), {
        access: 'public', contentType: 'application/json', addRandomSuffix: false,
      });
      return NextResponse.json({ phase: 'done', progress: 100, done: true, owners: collectors.length });
    }

    return NextResponse.json({
      phase: 'collect',
      progress: 50 + Math.round(nextIndex / addresses.length * 50),
      ownerMapBlob: blobUrl,
      startIndex: nextIndex,
      done: false,
    });
  }

  return NextResponse.json({ error: 'Unknown phase' }, { status: 400 });
}
