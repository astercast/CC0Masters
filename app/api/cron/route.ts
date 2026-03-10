import { NextRequest, NextResponse } from 'next/server';
import { runFullIndex } from '@/lib/indexer';

export const runtime = 'nodejs';
export const maxDuration = 800; // 800s — Vercel Pro max

export async function GET(req: NextRequest) {
  // Verify cron secret so only Vercel (or you) can trigger it
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('[cc0masters] Starting full index run...');
  const start = Date.now();

  try {
    const result = await runFullIndex((phase, pct, detail) => {
      console.log(`[cc0masters] [${phase}] ${pct}% — ${detail}`);
    });

    const elapsed = ((Date.now() - start) / 1000 / 60).toFixed(1);
    console.log(`[cc0masters] Index complete in ${elapsed}min — ${result.totalOwners} owners`);

    return NextResponse.json({
      success: true,
      owners: result.totalOwners,
      updatedAt: result.updatedAt,
      elapsedMinutes: elapsed,
    });
  } catch (err) {
    console.error('[cc0masters] Index failed:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
