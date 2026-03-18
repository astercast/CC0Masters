import { NextRequest, NextResponse } from 'next/server';
import { put, head } from '@vercel/blob';

export const runtime = 'nodejs';
export const maxDuration = 15;

// Proxy + cache CC0mon sprite images in Vercel Blob.
// First request: fetches from api.cc0mon.com and stores permanently in blob.
// All subsequent requests: redirects to Vercel CDN URL (globally cached, instant).
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url || !url.startsWith('https://api.cc0mon.com/')) {
    return new NextResponse('Invalid URL', { status: 400 });
  }

  const key = 'sprites/' + url.replace('https://api.cc0mon.com/', '').replace(/\//g, '_');

  // Check blob cache first
  try {
    const existing = await head(key);
    if (existing?.url) {
      // Already cached — redirect to CDN. Browser caches this redirect too.
      return NextResponse.redirect(existing.url, {
        status: 302,
        headers: {
          'Cache-Control': 'public, max-age=31536000, immutable',
          'CDN-Cache-Control': 'public, max-age=31536000',
        }
      });
    }
  } catch {}

  // Not cached — fetch, store in blob, then redirect
  try {
    const upstream = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!upstream.ok) throw new Error(`upstream ${upstream.status}`);
    const contentType = upstream.headers.get('content-type') || 'image/png';
    const buffer = await upstream.arrayBuffer();

    const blob = await put(key, buffer, {
      access: 'public',
      contentType,
      addRandomSuffix: false,
      allowOverwrite: false,
    });

    return NextResponse.redirect(blob.url, {
      status: 302,
      headers: {
        'Cache-Control': 'public, max-age=31536000, immutable',
      }
    });
  } catch {
    // Fallback: stream directly with 1-hour cache
    try {
      const upstream = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const buffer = await upstream.arrayBuffer();
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': upstream.headers.get('content-type') || 'image/png',
          'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
          'Access-Control-Allow-Origin': '*',
        }
      });
    } catch {
      return new NextResponse('Error fetching sprite', { status: 502 });
    }
  }
}
