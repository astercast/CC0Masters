import { NextResponse } from 'next/server';
import { runFullIndex } from '@/lib/indexer';

export const runtime = 'nodejs';
export const maxDuration = 800;

export async function POST() {
  console.log('[cc0masters] Manual scan triggered from UI');
  const start = Date.now();

  try {
    const result = await runFullIndex((phase, pct, detail) => {
      console.log(`[cc0masters] [${phase}] ${pct}% — ${detail}`);
    });

    const elapsed = ((Date.now() - start) / 1000 / 60).toFixed(1);
    return NextResponse.json({
      success: true,
      owners: result.totalOwners,
      updatedAt: result.updatedAt,
      elapsedMinutes: elapsed,
    });
  } catch (err) {
    console.error('[cc0masters] Scan failed:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
