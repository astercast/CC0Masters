import { NextResponse } from 'next/server';
import { loadLeaderboard } from '@/lib/indexer';

export const runtime  = 'nodejs';
export const maxDuration = 30;

export async function GET() {
  try {
    const data = await loadLeaderboard();
    if (!data) return NextResponse.json({ error: 'no_data' }, { status: 404 });
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'no-store, must-revalidate',
        'Access-Control-Allow-Origin': '*',
      }
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
