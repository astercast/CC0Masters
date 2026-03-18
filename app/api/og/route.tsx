import { ImageResponse } from 'next/og';

export const runtime = 'edge';

// A curated selection of CC0mon species numbers for the OG card sprite grid
const SPRITE_NUMS = [
  1,5,8,12,19,23,30,34,41,45,52,56,63,67,74,78,
  85,89,96,100,107,111,118,122,129,133,140,144,151,155,
  162,166,173,177,184,188,195,199,206,210,217,221,228,232,239,243
];

export async function GET() {
  try {
    // Fetch sprite image data from CC0mon registry
    const regRes = await fetch('https://api.cc0mon.com/registry/images', {
      next: { revalidate: 3600 }
    });
    const regData = await regRes.json();
    const images: Record<string, { png?: string; svg?: string; name?: string }> = regData.images || {};

    // Pick sprites that have PNG images
    const validSprites = SPRITE_NUMS
      .map(n => ({ num: n, img: images[String(n)] }))
      .filter(s => s.img?.png)
      .slice(0, 32);

    return new ImageResponse(
      (
        <div
          style={{
            width: '1200px',
            height: '630px',
            background: '#050a05',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: 'monospace',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* CRT scanlines overlay */}
          <div style={{
            position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none',
            backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px)',
          }}/>

          {/* Vignette */}
          <div style={{
            position: 'absolute', inset: 0, zIndex: 9,
            background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.7) 100%)',
          }}/>

          {/* Green border frame */}
          <div style={{
            position: 'absolute', inset: 8, zIndex: 11,
            border: '2px solid #2d6b1a',
            boxShadow: 'inset 0 0 0 1px #1a3d0f, 0 0 40px rgba(124,232,50,0.1)',
          }}/>

          {/* Corner brackets */}
          {[
            { top: 12, left: 12 },
            { top: 12, right: 12 },
            { bottom: 12, left: 12 },
            { bottom: 12, right: 12 },
          ].map((pos, i) => (
            <div key={i} style={{
              position: 'absolute', ...pos, width: 20, height: 20, zIndex: 12,
              borderTop: i < 2 ? '3px solid #52b52e' : undefined,
              borderBottom: i >= 2 ? '3px solid #52b52e' : undefined,
              borderLeft: i % 2 === 0 ? '3px solid #52b52e' : undefined,
              borderRight: i % 2 === 1 ? '3px solid #52b52e' : undefined,
            }}/>
          ))}

          {/* Sprite grid — top row */}
          <div style={{
            display: 'flex', flexDirection: 'row', gap: '0px',
            position: 'absolute', top: 0, left: 0, right: 0,
            borderBottom: '1px solid #1a3d0f',
            background: 'linear-gradient(180deg, #060d06 0%, transparent 100%)',
            padding: '16px 24px 8px',
            overflow: 'hidden',
          }}>
            {validSprites.slice(0, 16).map(({ num, img }) => (
              <img
                key={num}
                src={img!.png!}
                width={56} height={56}
                style={{ imageRendering: 'pixelated', flexShrink: 0 }}
              />
            ))}
          </div>

          {/* Main content */}
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', flex: 1, padding: '80px 60px 80px',
            position: 'relative', zIndex: 5,
          }}>
            {/* Title */}
            <div style={{
              fontSize: 96, fontFamily: 'monospace', fontWeight: 'bold',
              color: '#a8ff40', letterSpacing: '4px', lineHeight: 1,
              textShadow: '0 0 20px #7ee832, 0 0 60px rgba(124,232,50,0.4), 4px 4px 0 rgba(0,0,0,0.8)',
              marginBottom: 16,
            }}>
              CC0MASTERS
            </div>

            {/* Tagline */}
            <div style={{
              fontSize: 22, fontFamily: 'monospace',
              color: '#507040', letterSpacing: '6px',
              marginBottom: 32,
            }}>
              WHO WILL COLLECT THEM ALL_
            </div>

            {/* Divider */}
            <div style={{
              width: 500, height: 2,
              background: 'linear-gradient(90deg, transparent, #3d8b22, #7ee832, #3d8b22, transparent)',
              marginBottom: 32,
            }}/>

            {/* Stats row */}
            <div style={{ display: 'flex', gap: 40 }}>
              {[
                { label: 'SPECIES', value: '260' },
                { label: 'TOKENS', value: '9,999' },
                { label: 'ON-CHAIN', value: 'ETH' },
              ].map(({ label, value }) => (
                <div key={label} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  background: 'rgba(10,18,9,0.8)',
                  border: '1px solid #1e3a1a',
                  padding: '16px 28px',
                }}>
                  <div style={{ fontSize: 36, color: '#7ee832', fontFamily: 'monospace', letterSpacing: '-1px',
                    textShadow: '0 0 12px rgba(124,232,50,0.6)' }}>{value}</div>
                  <div style={{ fontSize: 11, color: '#507040', fontFamily: 'monospace', letterSpacing: '2px', marginTop: 6 }}>{label}</div>
                </div>
              ))}
            </div>

            {/* URL */}
            <div style={{
              marginTop: 28, fontSize: 16, fontFamily: 'monospace',
              color: '#2d6b1a', letterSpacing: '3px',
            }}>
              CC0MASTERS.VERCEL.APP
            </div>
          </div>

          {/* Sprite grid — bottom row */}
          <div style={{
            display: 'flex', flexDirection: 'row', gap: '0px',
            position: 'absolute', bottom: 0, left: 0, right: 0,
            borderTop: '1px solid #1a3d0f',
            background: 'linear-gradient(0deg, #060d06 0%, transparent 100%)',
            padding: '8px 24px 16px',
            overflow: 'hidden',
          }}>
            {validSprites.slice(16, 32).map(({ num, img }) => (
              <img
                key={num}
                src={img!.png!}
                width={56} height={56}
                style={{ imageRendering: 'pixelated', flexShrink: 0 }}
              />
            ))}
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  } catch (err) {
    // Fallback static OG if sprites fail
    return new ImageResponse(
      (
        <div style={{
          width: '1200px', height: '630px',
          background: '#050a05', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace',
        }}>
          <div style={{ fontSize: 96, color: '#a8ff40', letterSpacing: '4px',
            textShadow: '0 0 20px #7ee832' }}>CC0MASTERS</div>
          <div style={{ fontSize: 22, color: '#507040', letterSpacing: '6px', marginTop: 16 }}>
            WHO WILL COLLECT THEM ALL_
          </div>
        </div>
      ),
      { width: 1200, height: 630 }
    );
  }
}
