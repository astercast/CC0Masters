import { NextResponse } from 'next/server';
import { loadLeaderboard } from '@/lib/indexer';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Cache supply counts for 1 hour
let supplyCache: { data: Record<number,number>; ts: number } | null = null;
const CACHE_MS = 60 * 60 * 1000;

export async function GET() {
  // Return cached if fresh
  if (supplyCache && Date.now() - supplyCache.ts < CACHE_MS) {
    return NextResponse.json(supplyCache.data, {
      headers: { 'Cache-Control': 'public, max-age=3600' }
    });
  }

  try {
    // Get all holders from leaderboard
    const leaderboard = await loadLeaderboard();
    if (!leaderboard) return NextResponse.json({}, { status: 404 });

    const holders = leaderboard.leaders.map(l => l.address);

    // Query CC0mon API for each holder's checklist to aggregate tokenIds per species
    const speciesTokens: Record<number, Set<number>> = {};
    const CONCURRENCY = 20;
    const DELAY = 1200; // ~50 req/min to stay under 60/min limit

    for (let i = 0; i < holders.length; i += CONCURRENCY) {
      const batch = holders.slice(i, i + CONCURRENCY);
      await Promise.allSettled(batch.map(async (addr) => {
        try {
          const r = await fetch(`https://api.cc0mon.com/collector/${addr}`, {
            signal: AbortSignal.timeout(8000)
          });
          if (!r.ok) return;
          const data = await r.json();
          for (const sp of (data.checklist || [])) {
            if (!sp.collected || !sp.tokenIds?.length) continue;
            const num = parseInt(sp.number);
            if (!speciesTokens[num]) speciesTokens[num] = new Set();
            for (const tid of sp.tokenIds) speciesTokens[num].add(tid);
          }
        } catch {}
      }));
      if (i + CONCURRENCY < holders.length) {
        await new Promise(r => setTimeout(r, DELAY));
      }
    }

    // Convert Sets to counts
    const supply: Record<number, number> = {};
    for (const [num, tids] of Object.entries(speciesTokens)) {
      supply[parseInt(num)] = tids.size;
    }

    supplyCache = { data: supply, ts: Date.now() };
    return NextResponse.json(supply, {
      headers: { 'Cache-Control': 'public, max-age=3600' }
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
