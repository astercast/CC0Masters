import { NextRequest, NextResponse } from 'next/server';
import { put, get } from '@vercel/blob';

export const runtime = 'nodejs';
export const maxDuration = 60;

const BLOB_KEY = 'cc0masters/species-descriptions.json';
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — descriptions never change

async function loadFromBlob(): Promise<Record<number,string> | null> {
  try {
    const blob = await get(BLOB_KEY, { access: 'private' });
    if (!blob?.stream) return null;
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
    const parsed = JSON.parse(text);
    if (parsed._cachedAt && Date.now() - parsed._cachedAt < TTL_MS) {
      return parsed.data;
    }
    return null;
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  // Check blob cache first
  const cached = await loadFromBlob();
  if (cached) {
    return NextResponse.json(cached, {
      headers: { 'Cache-Control': 'public, max-age=604800, stale-while-revalidate=86400' }
    });
  }

  // Fetch registry/images to get one tokenId per species
  const regRes = await fetch('https://api.cc0mon.com/registry/images', {
    signal: AbortSignal.timeout(15000)
  });
  if (!regRes.ok) return NextResponse.json({}, { status: 502 });
  const regData = await regRes.json();
  const images = regData.images || {};

  // Fetch descriptions for all 260 species in batches
  const descriptions: Record<number, string> = {};
  const entries = Object.entries(images) as [string, { tokenId: number }][];
  const BATCH = 10;
  const DELAY = 1200; // ~50/min under rate limit

  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH);
    await Promise.allSettled(batch.map(async ([num, img]) => {
      try {
        const r = await fetch(`https://api.cc0mon.com/cc0mon/${img.tokenId}`, {
          signal: AbortSignal.timeout(8000)
        });
        if (!r.ok) return;
        const data = await r.json();
        if (data.description) descriptions[parseInt(num)] = data.description;
      } catch {}
    }));
    if (i + BATCH < entries.length) {
      await new Promise(r => setTimeout(r, DELAY));
    }
  }

  // Cache to blob
  put(BLOB_KEY, JSON.stringify({ _cachedAt: Date.now(), data: descriptions }), {
    access: 'private', contentType: 'application/json',
    addRandomSuffix: false, allowOverwrite: true,
  }).catch(() => {});

  return NextResponse.json(descriptions, {
    headers: { 'Cache-Control': 'public, max-age=604800, stale-while-revalidate=86400' }
  });
}
