import { NextResponse } from 'next/server';
import { put, get } from '@vercel/blob';

export const runtime = 'nodejs';
export const maxDuration = 30;

const BLOB_KEY = 'cc0masters/registry-images.json';
const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export async function GET() {
  // Try blob cache first
  try {
    const blob = await get(BLOB_KEY, { access: 'private' });
    if (blob?.stream) {
      const chunks: Uint8Array[] = [];
      const reader = blob.stream.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      const text = new TextDecoder().decode(
        chunks.reduce((a, c) => { const m = new Uint8Array(a.length + c.length); m.set(a); m.set(c, a.length); return m; }, new Uint8Array(0))
      );
      const cached = JSON.parse(text);
      // Check if still fresh
      if (cached._cachedAt && Date.now() - cached._cachedAt < TTL_MS) {
        return NextResponse.json(cached.data, {
          headers: { 'Cache-Control': 'public, max-age=21600, stale-while-revalidate=3600' }
        });
      }
    }
  } catch {}

  // Fetch fresh from CC0mon API
  const upstream = await fetch('https://api.cc0mon.com/registry/images', {
    signal: AbortSignal.timeout(15000)
  });
  if (!upstream.ok) return NextResponse.json({ error: 'upstream failed' }, { status: 502 });
  const data = await upstream.json();

  // Cache to blob in background (don't await)
  put(BLOB_KEY, JSON.stringify({ _cachedAt: Date.now(), data }), {
    access: 'private', contentType: 'application/json',
    addRandomSuffix: false, allowOverwrite: true,
  }).catch(() => {});

  return NextResponse.json(data, {
    headers: { 'Cache-Control': 'public, max-age=21600, stale-while-revalidate=3600' }
  });
}
