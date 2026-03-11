import { NextRequest, NextResponse } from 'next/server';

const RPC_URL = 'https://ethereum.publicnode.com';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const res = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
