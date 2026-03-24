// Emergency restore: reads leaderboard from save route's last known data
// and re-saves via the correct indexer path
import { NextResponse } from 'next/server';
import { loadLeaderboard, saveLeaderboard } from '@/lib/indexer';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET() {
  try {
    const data = await loadLeaderboard();
    if (!data) {
      return NextResponse.json({ error: 'Could not load leaderboard blob' }, { status: 404 });
    }
    // Re-save to ensure it's in the correct state
    await saveLeaderboard(data);
    return NextResponse.json({ 
      success: true, 
      totalOwners: data.totalOwners, 
      updatedAt: data.updatedAt,
      scannedBlock: data.scannedBlock,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
