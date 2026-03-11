import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';

export const runtime = 'nodejs';

// Increase body size limit to 50MB (default is 4MB)
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    await put('cc0masters/leaderboard.json', JSON.stringify(body), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Save error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
