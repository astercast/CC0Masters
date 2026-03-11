import { list, get } from '@vercel/blob';
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

    // Use get() which handles private blobs via token automatically
    const blobResult = await get(blobs[0].url);
    if (!blobResult) throw new Error('Blob not found');

    const text = await blobResult.text();
    const data: LeaderboardData = JSON.parse(text);

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
