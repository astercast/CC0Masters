import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 15;

const CONTRACT = '0xeeb036dbbd3039429c430657ed9836568da79d5f';

// Fetch recent sales for a species using Etherscan v2 (free, no key needed for basic)
// We look for Transfer events from/to non-zero addresses (sales) near a known token ID
export async function GET(req: NextRequest) {
  const speciesNum = req.nextUrl.searchParams.get('species');
  const tokenId = req.nextUrl.searchParams.get('tokenId');

  if (!tokenId) {
    return NextResponse.json({ sales: [] });
  }

  try {
    // Use Etherscan v2 free API to get ERC-721 transfers for this specific token
    // Sales = Transfer events where both from and to are non-zero addresses
    const url = `https://api.etherscan.io/v2/api?chainid=1&module=account&action=tokennfttx` +
      `&contractaddress=${CONTRACT}&tokenid=${tokenId}` +
      `&page=1&offset=10&sort=desc&apikey=YourApiKeyToken`;

    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const data = await r.json();

    if (data.status !== '1' || !Array.isArray(data.result)) {
      // Fallback: try without API key (free tier allows limited calls)
      const r2 = await fetch(
        `https://api.etherscan.io/api?module=account&action=tokennfttx` +
        `&contractaddress=${CONTRACT}&tokenid=${tokenId}` +
        `&page=1&offset=10&sort=desc`,
        { signal: AbortSignal.timeout(8000) }
      );
      const data2 = await r2.json();
      if (data2.status === '1' && Array.isArray(data2.result)) {
        return formatSales(data2.result);
      }
      return NextResponse.json({ sales: [], error: data.message });
    }

    return formatSales(data.result);
  } catch (err) {
    return NextResponse.json({ sales: [], error: String(err) });
  }
}

function formatSales(txs: any[]) {
  // Filter to only wallet-to-wallet transfers (potential sales, exclude mints/burns)
  const sales = txs
    .filter(tx => 
      tx.from !== '0x0000000000000000000000000000000000000000' &&
      tx.to !== '0x0000000000000000000000000000000000000000'
    )
    .slice(0, 5)
    .map(tx => ({
      tokenId: tx.tokenID,
      from: tx.from.slice(0,6) + '…' + tx.from.slice(-4),
      to: tx.to.slice(0,6) + '…' + tx.to.slice(-4),
      fromFull: tx.from,
      toFull: tx.to,
      date: new Date(parseInt(tx.timeStamp) * 1000).toLocaleDateString(),
      tx: tx.hash,
      blockNumber: tx.blockNumber,
    }));

  return NextResponse.json({ sales });
}
