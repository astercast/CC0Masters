import { NextRequest, NextResponse } from 'next/server';
import { saveLeaderboard } from '@/lib/indexer';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    await saveLeaderboard(body);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Save error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
