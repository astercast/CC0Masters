import { NextResponse } from 'next/server';
import { loadLeaderboard } from '@/lib/indexer';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET() {
  try {
    const leaderboard = await loadLeaderboard();
    if (!leaderboard) return NextResponse.json({}, { headers: { 'Cache-Control': 'public, max-age=60' } });

    // If we have real supply from a full scan, use it
    if (leaderboard.speciesSupply && Object.keys(leaderboard.speciesSupply).length > 0) {
      return NextResponse.json(leaderboard.speciesSupply, {
        headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=600' }
      });
    }

    // Fallback: derive minimum supply from leaderboard holder data
    // This counts unique species held across all wallets — it's a FLOOR not the real count
    // (wallets not in leaderboard aren't counted)
    // Return empty so library shows "RUN SCAN" until admin scan is done
    return NextResponse.json({}, {
      headers: { 'Cache-Control': 'public, max-age=60' }
    });
  } catch {
    return NextResponse.json({}, { status: 500 });
  }
}
