import { NextRequest, NextResponse } from 'next/server';
import { runIncrementalUpdate } from '@/lib/indexer';

export const runtime  = 'nodejs';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await runIncrementalUpdate((phase, pct, detail) => {
      console.log(`[cron] [${phase}] ${pct}% — ${detail}`);
    });
    return NextResponse.json({ success: true, totalOwners: result.totalOwners, updatedAt: result.updatedAt });
  } catch (err) {
    // Log the FULL error so it shows in Vercel logs
    console.error('[cron] FATAL ERROR:', String(err));
    console.error('[cron] Stack:', err instanceof Error ? err.stack : 'no stack');
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
