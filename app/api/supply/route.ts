import { NextResponse } from 'next/server';
import { loadLeaderboard } from '@/lib/indexer';

export const runtime = 'nodejs';
export const maxDuration = 10;

export async function GET() {
  try {
    const leaderboard = await loadLeaderboard();
    if (!leaderboard?.speciesSupply) {
      // Not yet computed — return empty, client shows '…'
      return NextResponse.json({}, {
        headers: { 'Cache-Control': 'public, max-age=60' }
      });
    }
    return NextResponse.json(leaderboard.speciesSupply, {
      headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=600' }
    });
  } catch (err) {
    return NextResponse.json({}, { status: 500 });
  }
}
