import { NextResponse } from 'next/server';
import { list } from '@vercel/blob';
import { loadLeaderboard } from '@/lib/indexer';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET() {
  const results: any = {};

  // Test 1: list blobs
  try {
    const { blobs } = await list({ prefix: 'cc0masters/', limit: 5 });
    results.list = { ok: true, count: blobs.length,
      blobs: blobs.map(b => ({ pathname: b.pathname, size: b.size })) };
  } catch (e) { results.list = { ok: false, error: String(e) }; }

  // Test 2: load leaderboard
  try {
    const data = await loadLeaderboard();
    results.load = { ok: !!data, updatedAt: data?.updatedAt,
      scannedBlock: data?.scannedBlock, totalOwners: data?.totalOwners };
  } catch (e) { results.load = { ok: false, error: String(e) }; }

  return NextResponse.json(results);
}
