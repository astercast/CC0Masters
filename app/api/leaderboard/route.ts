import { list } from '@vercel/blob';
import { NextResponse } from 'next/server';
import type { LeaderboardData } from '@/lib/types';

export const runtime = 'nodejs';
export const revalidate = 0;

export async function GET() {
  try {
    // Find the leaderboard blob
    const { blobs } = await list({ prefix: 'cc0masters/leaderboard' });
    if (!blobs.length) {
      return NextResponse.json({ error: 'No leaderboard data yet. Trigger a scan first.' }, { status: 404 });
    }

    const blob = blobs[0];
    const res = await fetch(blob.url, { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch blob');

    const data: LeaderboardData = await res.json();
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
      },
    });
  } catch (err) {
    console.error('Leaderboard fetch error:', err);
    return NextResponse.json({ error: 'Failed to load leaderboard' }, { status: 500 });
  }
}
