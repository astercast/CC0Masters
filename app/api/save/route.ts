import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    await put('cc0masters/leaderboard.json', JSON.stringify(body), {
      access: 'private',        // ← private store requires 'private'
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Save error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
