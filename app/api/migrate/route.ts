// One-time migration: re-saves existing leaderboard blob as public
import { NextResponse } from 'next/server';
import { get, put, list } from '@vercel/blob';

export const runtime = 'nodejs';
export const maxDuration = 30;

const BLOB_KEY = 'cc0masters/leaderboard.json';

export async function GET() {
  try {
    const { blobs } = await list({ prefix: BLOB_KEY, limit: 5 });
    if (!blobs.length) {
      return NextResponse.json({ error: 'No blob found' });
    }

    let data: any = null;
    for (const blob of blobs) {
      try {
        const result = await get(blob.url, { access: "public" });
        if (result?.stream) {
          const reader = result.stream.getReader();
          const chunks: Uint8Array[] = [];
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) chunks.push(value);
          }
          const merged = chunks.reduce((a, c) => { const m = new Uint8Array(a.length+c.length); m.set(a); m.set(c,a.length); return m; }, new Uint8Array(0));
          data = JSON.parse(new TextDecoder().decode(merged));
          break;
        }
      } catch (e) {
        console.log('get() failed:', String(e).slice(0,100));
      }
    }

    if (!data) {
      return NextResponse.json({ error: 'Could not read blob', blobs: blobs.map(b=>b.pathname) });
    }

    await put(BLOB_KEY, JSON.stringify(data), {
      access: 'public', contentType: 'application/json',
      addRandomSuffix: false, allowOverwrite: true,
    });

    return NextResponse.json({ success: true, totalOwners: data.totalOwners, updatedAt: data.updatedAt });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
