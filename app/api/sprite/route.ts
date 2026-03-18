import { NextRequest, NextResponse } from 'next/server';
import { put, head } from '@vercel/blob';

export const runtime = 'nodejs';
export const maxDuration = 15;

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url || !url.startsWith('https://api.cc0mon.com/')) {
    return new NextResponse('Invalid URL', { status: 400 });
  }

  const key = 'sprites/' + url.replace('https://api.cc0mon.com/', '').replace(/\//g, '_');

  try {
    const existing = await head(key);
    if (existing?.url) {
      return NextResponse.redirect(existing.url, {
        status: 302,
        headers: { 'Cache-Control': 'public, max-age=86400' }
      });
    }
  } catch {}

  try {
    const upstream = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!upstream.ok) throw new Error('upstream failed');
    const contentType = upstream.headers.get('content-type') || 'image/png';
    const buffer = await upstream.arrayBuffer();
    const blob = await put(key, buffer, { access: 'public', contentType, addRandomSuffix: false, allowOverwrite: false });
    return NextResponse.redirect(blob.url, {
      status: 302,
      headers: { 'Cache-Control': 'public, max-age=86400' }
    });
  } catch {
    // Direct proxy fallback
    try {
      const upstream = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const buffer = await upstream.arrayBuffer();
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': upstream.headers.get('content-type') || 'image/png',
          'Cache-Control': 'public, max-age=3600',
          'Access-Control-Allow-Origin': '*',
        }
      });
    } catch {
      return new NextResponse('Error', { status: 502 });
    }
  }
}
