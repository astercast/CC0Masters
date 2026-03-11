import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // No 'access' field — works on both private and public stores (defaults to store setting)
    await put('cc0masters/leaderboard.json', JSON.stringify(body), {
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
