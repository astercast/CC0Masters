import { NextRequest, NextResponse } from 'next/server';
import { runIncrementalUpdate } from '@/lib/indexer';

export const runtime  = 'nodejs';
export const maxDuration = 300; // incremental is fast — 5 min is plenty

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const result = await runIncrementalUpdate((phase, pct, detail) => {
    console.log(`[cron] [${phase}] ${pct}% — ${detail}`);
  });
  return NextResponse.json({ success: true, totalOwners: result.totalOwners, updatedAt: result.updatedAt });
}
