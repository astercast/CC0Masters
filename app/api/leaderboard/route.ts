import { list, get } from '@vercel/blob';
import { NextResponse } from 'next/server';
import type { LeaderboardData } from '@/lib/types';

export const runtime = 'nodejs';
export const revalidate = 0;

export async function GET() {
  try {
    const { blobs } = await list({ prefix: 'cc0masters/leaderboard' });
    if (!blobs.length) {
      return NextResponse.json(
        { error: 'No leaderboard data yet. Trigger a scan first.' },
        { status: 404 }
      );
    }

    const blobResult = await get(blobs[0].url, { access: 'private' });
    if (!blobResult || blobResult.statusCode !== 200 || !blobResult.stream) {
      throw new Error('Blob not found or empty');
    }

    // Read the stream into text
    const reader = blobResult.stream.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    const text = new TextDecoder().decode(
      chunks.reduce((a, b) => { const c = new Uint8Array(a.length + b.length); c.set(a); c.set(b, a.length); return c; }, new Uint8Array(0))
    );

    const data: LeaderboardData = JSON.parse(text);
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' },
    });
  } catch (err) {
    console.error('Leaderboard fetch error:', err);
    return NextResponse.json({ error: 'Failed to load leaderboard' }, { status: 500 });
  }
}
