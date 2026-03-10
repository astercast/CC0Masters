import { NextResponse } from 'next/server';
import { runFullIndex } from '@/lib/indexer';

export const runtime = 'nodejs';
export const maxDuration = 800;

export async function POST() {
  // Respond immediately so the browser doesn't time out
  // The scan runs async and saves to Blob when done
  const scanPromise = runFullIndex((phase, pct, detail) => {
    console.log(`[cc0masters] [${phase}] ${pct}% — ${detail}`);
  }).then(result => {
    console.log(`[cc0masters] SCAN COMPLETE — ${result.totalOwners} owners ranked`);
  }).catch(err => {
    console.error('[cc0masters] SCAN FAILED:', err);
  });

  // On Vercel, waitUntil keeps the function alive after response is sent
  if (typeof (globalThis as unknown as { EdgeRuntime?: unknown }).EdgeRuntime === 'undefined') {
    // Node runtime — just await since maxDuration handles the timeout
    await scanPromise;
    return NextResponse.json({ success: true, message: 'Scan complete — refresh to see results.' });
  }

  return NextResponse.json({ 
    success: true, 
    message: 'Scan started in background. Check back in ~20 minutes and hit Refresh.' 
  });
}
