'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import type { LeaderboardData, LeaderboardEntry } from '@/lib/types';

const TOTAL_SPECIES = 260;
const ENERGY_TYPES = ['Fire','Ice','Grass','Electric','Ghost','Dragon','Metal','Toxic','Rock','Bug','Ocean','Earth','Underworld','Mythic','Celestial','Fossil'];
const ENERGY_EMOJIS: Record<string,string> = {
  Fire:'🔥',Ice:'❄️',Grass:'🌿',Electric:'⚡',Ghost:'👻',Dragon:'🐉',
  Metal:'⚙️',Toxic:'☠️',Rock:'🪨',Bug:'🐛',Ocean:'🌊',Earth:'🌍',
  Underworld:'🌑',Mythic:'✨',Celestial:'☀️',Fossil:'🦴',
};
const ENERGY_COLORS: Record<string,string> = {
  Fire:'#ff6030',Ice:'#80e8ff',Grass:'#80ff60',Electric:'#ffe040',Ghost:'#c080ff',Dragon:'#6080ff',
  Metal:'#a0c0d0',Toxic:'#a0ff20',Rock:'#c0a060',Bug:'#80d040',Ocean:'#40a0ff',Earth:'#c08040',
  Underworld:'#8040c0',Mythic:'#ff80c0',Celestial:'#ffd080',Fossil:'#d0b080',
};

function shorten(addr: string) { return addr.slice(0,6)+'…'+addr.slice(-4); }

// ── ANIMATED COUNTER ──────────────────────────────────────────────
function AnimatedNumber({ value, duration = 1200 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<number>(0);
  useEffect(() => {
    const start = ref.current;
    const end = value;
    const startTime = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      const cur = Math.round(start + (end - start) * ease);
      setDisplay(cur);
      ref.current = cur;
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [value, duration]);
  return <>{display.toLocaleString()}</>;
}

// ── PROGRESS BAR ──────────────────────────────────────────────────
function ProgressBar({ pct, variant = 'teal', height = 6, animate = true }: {
  pct: number; variant?: 'teal'|'gold'|'silver'|'bronze'; height?: number; animate?: boolean;
}) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setW(pct), 100);
    return () => clearTimeout(t);
  }, [pct]);
  return (
    <div className="pbar-wrap" style={{ height }}>
      <div
        className={`pbar-fill ${variant}`}
        style={{ width: animate ? `${Math.max(w, 0.2)}%` : `${Math.max(pct, 0.2)}%` }}
      />
    </div>
  );
}

// ── ENERGY DOTS ───────────────────────────────────────────────────
function EnergyDots({ byEnergy, size = 7 }: { byEnergy: LeaderboardEntry['byEnergy']; size?: number }) {
  return (
    <div style={{ display:'flex', gap:2, flexWrap:'wrap', maxWidth: size * 9 }}>
      {ENERGY_TYPES.map(e => {
        const info = byEnergy?.[e];
        const lit = info && info.collected > 0;
        const color = ENERGY_COLORS[e];
        return (
          <div key={e} title={`${e}: ${info?.collected ?? 0}/${info?.total ?? 0}`} style={{
            width: size, height: size,
            background: lit ? color : 'transparent',
            border: `1px solid ${lit ? color : '#1a3a50'}`,
            boxShadow: lit ? `0 0 4px ${color}80` : 'none',
            transition: 'all 0.3s ease',
            borderRadius: 1,
          }} />
        );
      })}
    </div>
  );
}

// ── STAT CARD ─────────────────────────────────────────────────────
function StatCard({ label, value, color, delay = 0 }: {
  label: string; value: string|number; color: string; delay?: number;
}) {
  return (
    <div style={{
      background: 'rgba(13,31,45,0.8)',
      border: `1px solid ${color}30`,
      padding: '14px 18px',
      position: 'relative',
      overflow: 'hidden',
      animation: `fadeUp 0.5s ease ${delay}ms both`,
    }}>
      <div style={{
        position: 'absolute', top:0, left:0, width:'100%', height:'2px',
        background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
      }} />
      <div style={{ fontFamily:'var(--ff-pixel)', fontSize:18, color, marginBottom:6,
        textShadow: `0 0 12px ${color}80` }}>
        {typeof value === 'number' ? <AnimatedNumber value={value} /> : value}
      </div>
      <div style={{ fontSize:7, color:'var(--text2)', letterSpacing:2, fontFamily:'var(--ff-pixel)' }}>{label}</div>
    </div>
  );
}

// ── PODIUM CARD ───────────────────────────────────────────────────
function PodiumCard({ entry, rank, onClick, isOpen }: {
  entry: LeaderboardEntry; rank: 1|2|3; onClick: () => void; isOpen: boolean;
}) {
  const configs = {
    1: { medal:'🥇', color:'var(--gold)',   border:'rgba(255,208,96,0.5)',  glow:'rgba(255,208,96,0.3)',  height:220 },
    2: { medal:'🥈', color:'var(--silver)', border:'rgba(200,221,232,0.4)', glow:'rgba(200,221,232,0.2)', height:190 },
    3: { medal:'🥉', color:'var(--bronze)', border:'rgba(232,144,74,0.4)',  glow:'rgba(232,144,74,0.2)',  height:175 },
  };
  const cfg = configs[rank];
  const pct = parseFloat(entry.progress);
  const variant = rank === 1 ? 'gold' : rank === 2 ? 'silver' : 'bronze';

  return (
    <div
      onClick={onClick}
      style={{
        background: 'linear-gradient(145deg, var(--panel) 0%, var(--bg3) 100%)',
        border: `1px solid ${cfg.border}`,
        boxShadow: `0 0 0 1px ${cfg.border}, 0 8px 32px ${cfg.glow}, inset 0 1px 0 ${cfg.border}`,
        padding: '24px 20px 20px',
        cursor: 'pointer',
        transition: 'all 0.25s ease',
        position: 'relative',
        overflow: 'hidden',
        minHeight: cfg.height,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        animation: `fadeUp 0.6s ease ${(rank-1)*120}ms both`,
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.transform = 'translateY(-4px)';
        (e.currentTarget as HTMLElement).style.boxShadow = `0 0 0 1px ${cfg.border}, 0 16px 48px ${cfg.glow}, inset 0 1px 0 ${cfg.border}`;
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.transform = '';
        (e.currentTarget as HTMLElement).style.boxShadow = `0 0 0 1px ${cfg.border}, 0 8px 32px ${cfg.glow}, inset 0 1px 0 ${cfg.border}`;
      }}
    >
      {/* Corner accent */}
      <div style={{ position:'absolute', top:0, right:0, width:40, height:40,
        background: `linear-gradient(225deg, ${cfg.glow}, transparent)` }} />
      {/* Rank number */}
      <div style={{ position:'absolute', top:10, left:14, fontFamily:'var(--ff-pixel)', fontSize:7,
        color: cfg.color, opacity:0.5 }}>#{rank}</div>

      <div style={{ fontSize:32, marginBottom:12, animation:'float 3s ease-in-out infinite' }}>{cfg.medal}</div>

      <div style={{ fontFamily:'var(--ff-pixel)', fontSize:6, color:'var(--text2)', marginBottom:10,
        textAlign:'center', wordBreak:'break-all', lineHeight:2, padding:'0 4px' }}>
        {entry.address}
      </div>

      <div style={{ fontFamily:'var(--ff-pixel)', fontSize:28, color: cfg.color, marginBottom:4,
        textShadow: `0 0 16px ${cfg.glow}`, animation:'countUp 0.8s ease both' }}>
        {entry.collected}
        <span style={{ fontSize:11, color:'var(--text2)', marginLeft:4 }}>/{TOTAL_SPECIES}</span>
      </div>

      <div style={{ fontFamily:'var(--ff-pixel)', fontSize:6, color:'var(--text2)', marginBottom:10, letterSpacing:1 }}>
        SPECIES COLLECTED
      </div>

      <div style={{ width:'100%' }}>
        <ProgressBar pct={pct} variant={variant} height={8} />
      </div>

      <div style={{ marginTop:8, display:'flex', gap:12, fontFamily:'var(--ff-pixel)', fontSize:6, color:'var(--text2)' }}>
        <span style={{ color: cfg.color }}>{entry.progress}</span>
        <span>·</span>
        <span>{entry.totalTokensHeld} TOKENS</span>
      </div>

      {isOpen && (
        <div style={{ position:'absolute', bottom:8, right:10, fontFamily:'var(--ff-pixel)', fontSize:6, color: cfg.color }}>
          ▲ COLLAPSE
        </div>
      )}
    </div>
  );
}

// ── RANK BADGE ────────────────────────────────────────────────────
function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span style={{ fontFamily:'var(--ff-pixel)', fontSize:11, color:'var(--gold)', textShadow:'0 0 8px rgba(255,208,96,0.6)' }}>1</span>;
  if (rank === 2) return <span style={{ fontFamily:'var(--ff-pixel)', fontSize:11, color:'var(--silver)', textShadow:'0 0 8px rgba(200,221,232,0.6)' }}>2</span>;
  if (rank === 3) return <span style={{ fontFamily:'var(--ff-pixel)', fontSize:11, color:'var(--bronze)', textShadow:'0 0 8px rgba(232,144,74,0.6)' }}>3</span>;
  return <span style={{ fontFamily:'var(--ff-pixel)', fontSize:9, color:'var(--text2)' }}>{rank}</span>;
}

// ── DETAIL PANEL ──────────────────────────────────────────────────
function DetailPanel({ entry, registryImages }: {
  entry: LeaderboardEntry;
  registryImages: Record<string, { svg: string; name: string }>;
}) {
  return (
    <div style={{
      background: 'linear-gradient(180deg, var(--panel) 0%, var(--bg3) 100%)',
      borderTop: '1px solid var(--teal3)',
      borderBottom: '2px solid var(--teal3)',
      padding: 24,
      animation: 'gridReveal 0.35s ease both',
    }}>
      {/* Top stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(100px,1fr))', gap:8, marginBottom:20 }}>
        {([
          ['COLLECTED', entry.collected, 'var(--teal)'],
          ['MISSING',   entry.missing,   'var(--red)'],
          ['COMPLETE',  entry.progress,  'var(--lime)'],
          ['TOKENS',    entry.totalTokensHeld, 'var(--amber)'],
        ] as [string, string|number, string][]).map(([l,v,c]) => (
          <div key={l} style={{
            background:'rgba(0,0,0,0.3)', border:`1px solid ${c}20`,
            padding:'10px 12px', position:'relative', overflow:'hidden',
          }}>
            <div style={{ position:'absolute', top:0, left:0, right:0, height:1, background:`linear-gradient(90deg,transparent,${c},transparent)` }} />
            <div style={{ fontFamily:'var(--ff-pixel)', fontSize:14, color: c as string, marginBottom:4 }}>{v}</div>
            <div style={{ fontSize:9, color:'var(--text2)', letterSpacing:1 }}>{l}</div>
          </div>
        ))}
        <a href={`https://opensea.io/${entry.address}`} target="_blank" rel="noreferrer" style={{
          background:'rgba(0,0,0,0.3)', border:'1px solid var(--border)',
          padding:'10px 12px', textDecoration:'none', display:'flex', flexDirection:'column',
          justifyContent:'center', alignItems:'center', color:'var(--text2)',
          fontSize:9, letterSpacing:1, transition:'all 0.2s',
        }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor='var(--teal3)'; (e.currentTarget as HTMLElement).style.color='var(--teal)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor='var(--border)'; (e.currentTarget as HTMLElement).style.color='var(--text2)'; }}
        >
          <span style={{ fontSize:16, marginBottom:4 }}>🌊</span>
          OPENSEA ▸
        </a>
      </div>

      {/* Energy grid */}
      <div style={{ fontFamily:'var(--ff-pixel)', fontSize:7, color:'var(--teal)', marginBottom:10, letterSpacing:2 }}>▸ ENERGY BREAKDOWN</div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(100px,1fr))', gap:6, marginBottom:20 }}>
        {ENERGY_TYPES.map((e, i) => {
          const info = entry.byEnergy?.[e] ?? { collected:0, total:0 };
          const pct = info.total ? info.collected / info.total * 100 : 0;
          const color = ENERGY_COLORS[e];
          return (
            <div key={e} style={{
              background:'rgba(0,0,0,0.25)', border:`1px solid ${color}20`,
              padding:'8px 10px',
              animation: `fadeUp 0.4s ease ${i*20}ms both`,
            }}>
              <div style={{ fontSize:10, marginBottom:4 }}>{ENERGY_EMOJIS[e]}</div>
              <div style={{ fontFamily:'var(--ff-pixel)', fontSize:5, color, marginBottom:4, letterSpacing:0.5 }}>{e.toUpperCase()}</div>
              <div style={{ fontFamily:'var(--ff-pixel)', fontSize:8, color, marginBottom:4 }}>{info.collected}<span style={{ color:'var(--text2)', fontSize:6 }}>/{info.total}</span></div>
              <div className="pbar-wrap" style={{ height:3 }}>
                <div className="pbar-fill" style={{ width:`${pct}%`, background:`linear-gradient(90deg, ${color}60, ${color})` }}>
                  <div style={{ display:'none' }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Species grid */}
      <div style={{ fontFamily:'var(--ff-pixel)', fontSize:7, color:'var(--teal)', marginBottom:10, letterSpacing:2 }}>
        ▸ COLLECTION — {entry.collected}/{TOTAL_SPECIES} SPECIES
      </div>
      <div style={{
        display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(64px,1fr))',
        gap:4, maxHeight:320, overflowY:'auto', paddingRight:4,
      }}>
        {entry.checklist?.map((sp, i) => {
          const img = registryImages[sp.number];
          return (
            <div key={sp.number} style={{
              background: sp.collected ? 'rgba(14,240,208,0.05)' : 'rgba(0,0,0,0.2)',
              border: `1px solid ${sp.collected ? 'rgba(14,240,208,0.2)' : 'var(--border)'}`,
              padding:5, textAlign:'center', position:'relative',
              opacity: sp.collected ? 1 : 0.18,
              transition:'all 0.2s ease',
              animation: `fadeIn 0.3s ease ${Math.min(i*5,500)}ms both`,
            }}>
              {sp.collected && (
                <div style={{ position:'absolute', top:2, right:3, fontFamily:'var(--ff-pixel)', fontSize:5, color:'var(--teal)' }}>✓</div>
              )}
              {img && (
                <img src={img.svg} alt={sp.name} width={48} height={48} loading="lazy"
                  style={{ imageRendering:'pixelated', display:'block', margin:'0 auto 3px' }} />
              )}
              <div style={{ fontFamily:'var(--ff-pixel)', fontSize:4, color: sp.collected ? 'var(--text)' : 'var(--text2)', lineHeight:1.6, wordBreak:'break-word' }}>
                {sp.name}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── SKELETON ROW ─────────────────────────────────────────────────
function SkeletonRow({ delay }: { delay: number }) {
  return (
    <tr style={{ borderBottom:'1px solid var(--border)', opacity:0, animation:`fadeIn 0.4s ease ${delay}ms forwards` }}>
      {[20,120,60,90,50,40,90,60].map((w,i) => (
        <td key={i} style={{ padding:'12px 10px' }}>
          <div className="skeleton" style={{ height:10, width:w, borderRadius:2 }} />
        </td>
      ))}
    </tr>
  );
}

// ── MAIN PAGE ─────────────────────────────────────────────────────
export default function CC0Masters() {
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [registryImages, setRegistryImages] = useState<Record<string, { svg: string; name: string }>>({});
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<'collected'|'tokens'|'pct'>('collected');
  const [filterMode, setFilterMode] = useState<'all'|'top10'|'top50'>('all');
  const [triggering, setTriggering] = useState(false);
  const [scanMsg, setScanMsg] = useState('');
  const scanLineRef = useRef<HTMLDivElement>(null);

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/leaderboard');
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Failed'); }
      setData(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeaderboard();
    fetch('https://api.cc0mon.com/registry/images')
      .then(r => r.json()).then(d => setRegistryImages(d.images || {})).catch(() => {});
  }, [fetchLeaderboard]);

  const triggerScan = async () => {
    setTriggering(true); setScanMsg('INITIATING SCAN...');
    try {
      const res = await fetch('/api/trigger', { method:'POST' });
      const d = await res.json();
      setScanMsg(d.success ? `✓ SCAN COMPLETE — ${d.owners} OWNERS` : `ERROR: ${d.error}`);
      if (d.success) setTimeout(fetchLeaderboard, 2000);
    } catch { setScanMsg('ERROR: SCAN FAILED'); }
    finally { setTriggering(false); setTimeout(() => setScanMsg(''), 5000); }
  };

  const sorted = (data?.leaders ?? [])
    .slice()
    .sort((a,b) => {
      if (sortKey==='tokens') return b.totalTokensHeld - a.totalTokensHeld;
      if (sortKey==='pct') return parseFloat(b.progress) - parseFloat(a.progress);
      return b.collected - a.collected;
    })
    .filter((_,i) => filterMode==='top10' ? i<10 : filterMode==='top50' ? i<50 : true);

  const completeCount = data?.leaders.filter(l => l.collected === TOTAL_SPECIES).length ?? 0;

  return (
    <div style={{ background:'var(--bg)', color:'var(--text)', minHeight:'100vh', fontFamily:'var(--ff-mono)' }}>

      {/* ── MOVING SCAN LINE ── */}
      <div ref={scanLineRef} style={{
        position:'fixed', top:0, left:0, width:'100%', height:2, zIndex:9997,
        background:'linear-gradient(90deg, transparent, var(--teal), transparent)',
        opacity:0.3, animation:'scanMove 8s linear infinite', pointerEvents:'none',
      }} />

      {/* ── HEADER ── */}
      <header style={{
        background:'linear-gradient(180deg, #050d14 0%, var(--bg2) 100%)',
        borderBottom:'1px solid var(--border)',
        padding:'28px 28px 24px',
        position:'relative', overflow:'hidden',
      }}>
        {/* Grid BG */}
        <div style={{
          position:'absolute', inset:0, opacity:0.03, pointerEvents:'none',
          backgroundImage:'linear-gradient(var(--teal) 1px, transparent 1px), linear-gradient(90deg, var(--teal) 1px, transparent 1px)',
          backgroundSize:'40px 40px',
        }} />
        {/* Corner glow */}
        <div style={{ position:'absolute', top:-60, right:-60, width:200, height:200, borderRadius:'50%',
          background:'radial-gradient(circle, rgba(14,240,208,0.08) 0%, transparent 70%)', pointerEvents:'none' }} />

        <div style={{ display:'flex', alignItems:'flex-start', gap:16, flexWrap:'wrap', position:'relative' }}>
          {/* Logo */}
          <div style={{ animation:'fadeUp 0.6s ease both' }}>
            <div style={{ fontFamily:'var(--ff-pixel)', fontSize:9, color:'var(--teal3)', letterSpacing:3, marginBottom:8,
              border:'1px solid var(--teal3)', padding:'3px 8px', display:'inline-block', opacity:0.8 }}>
              ETHEREUM · ON-CHAIN · CC0 · ERC-721
            </div>
            <h1 style={{
              fontFamily:'var(--ff-pixel)',
              fontSize:'clamp(20px, 5vw, 44px)',
              color:'var(--teal)',
              letterSpacing:6,
              lineHeight:1,
              textShadow:'0 0 20px rgba(14,240,208,0.7), 0 0 60px rgba(14,240,208,0.2), 3px 3px 0 rgba(0,0,0,0.8)',
              marginBottom:10,
            }}>
              CC0MASTERS
            </h1>
            <p style={{ fontFamily:'var(--ff-pixel)', fontSize:7, color:'var(--text2)', letterSpacing:3 }}>
              WHO WILL CATCH THEM ALL?
            </p>
          </div>

          {/* Actions + Stats */}
          <div style={{ marginLeft:'auto', display:'flex', flexDirection:'column', alignItems:'flex-end', gap:12, animation:'fadeUp 0.6s ease 100ms both' }}>
            <div style={{ display:'flex', gap:8 }}>
              <button className="btn btn-secondary" onClick={fetchLeaderboard}>↺ REFRESH</button>
              <button className="btn btn-primary" onClick={triggerScan} disabled={triggering}>
                {triggering ? '◌ SCANNING…' : '⬡ SCAN NOW'}
              </button>
            </div>
            {scanMsg && (
              <div style={{ fontFamily:'var(--ff-pixel)', fontSize:6, color:'var(--teal)', letterSpacing:1,
                animation:'fadeIn 0.3s ease both', padding:'4px 8px', border:'1px solid var(--teal3)', background:'rgba(14,240,208,0.05)' }}>
                {scanMsg}
              </div>
            )}
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', justifyContent:'flex-end' }}>
              {([
                ['COLLECTORS', data?.totalOwners ?? 0, 'var(--teal)'],
                ['SPECIES', TOTAL_SPECIES, 'var(--lime)'],
                ['COMPLETE DEX', completeCount, 'var(--amber)'],
              ] as [string, number, string][]).map(([label, val, color]) => (
                <div key={label} style={{
                  background:'rgba(13,31,45,0.6)', border:`1px solid ${color}20`,
                  padding:'8px 12px', textAlign:'right', minWidth:80,
                  boxShadow:`inset 0 1px 0 ${color}10`,
                }}>
                  <div style={{ fontFamily:'var(--ff-pixel)', fontSize:13, color, marginBottom:3 }}>
                    {val > 0 ? <AnimatedNumber value={val as number} /> : '—'}
                  </div>
                  <div style={{ fontFamily:'var(--ff-pixel)', fontSize:6, color:'var(--text2)', letterSpacing:1 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Updated timestamp */}
        {data && (
          <div style={{ marginTop:16, fontFamily:'var(--ff-pixel)', fontSize:6, color:'var(--text2)', letterSpacing:1, opacity:0.6, animation:'fadeIn 0.8s ease 0.3s both' }}>
            LAST UPDATED: {new Date(data.updatedAt).toLocaleString().toUpperCase()} · NEXT AUTO-SCAN: 02:00 UTC
          </div>
        )}
      </header>

      <main style={{ padding:'24px 28px', maxWidth:1400, margin:'0 auto' }}>

        {/* ── PODIUM ── */}
        {!loading && !error && sorted.length >= 3 && (
          <section style={{ marginBottom:28 }}>
            <div style={{ fontFamily:'var(--ff-pixel)', fontSize:8, color:'var(--teal)', marginBottom:14, letterSpacing:3,
              display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ display:'inline-block', width:2, height:14, background:'var(--teal)', boxShadow:'0 0 8px var(--teal)' }} />
              CHAMPION PODIUM
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1.15fr 1fr', gap:10, alignItems:'end' }}>
              <PodiumCard entry={sorted[1]} rank={2} onClick={() => setOpenRow(openRow===sorted[1].address ? null : sorted[1].address)} isOpen={openRow===sorted[1].address} />
              <PodiumCard entry={sorted[0]} rank={1} onClick={() => setOpenRow(openRow===sorted[0].address ? null : sorted[0].address)} isOpen={openRow===sorted[0].address} />
              <PodiumCard entry={sorted[2]} rank={3} onClick={() => setOpenRow(openRow===sorted[2].address ? null : sorted[2].address)} isOpen={openRow===sorted[2].address} />
            </div>
            {/* Podium detail */}
            {[sorted[0], sorted[1], sorted[2]].map(e => openRow === e.address && (
              <div key={e.address} style={{ marginTop:8 }}>
                <DetailPanel entry={e} registryImages={registryImages} />
              </div>
            ))}
          </section>
        )}

        {/* ── FILTERS ── */}
        {!loading && !error && sorted.length > 0 && (
          <div style={{ display:'flex', gap:6, marginBottom:14, flexWrap:'wrap', alignItems:'center', animation:'fadeIn 0.5s ease both' }}>
            <span style={{ fontFamily:'var(--ff-pixel)', fontSize:6, color:'var(--text2)', marginRight:4 }}>SHOW:</span>
            {(['all','top10','top50'] as const).map(f => (
              <button key={f} className={`btn btn-filter${filterMode===f?' active':''}`} onClick={() => setFilterMode(f)}>
                {f.toUpperCase()}
              </button>
            ))}
            <div style={{ width:1, height:16, background:'var(--border)', margin:'0 6px' }} />
            <span style={{ fontFamily:'var(--ff-pixel)', fontSize:6, color:'var(--text2)', marginRight:4 }}>SORT:</span>
            {(['collected','tokens','pct'] as const).map(s => (
              <button key={s} className={`btn btn-filter${sortKey===s?' active':''}`} onClick={() => setSortKey(s)}>
                {s === 'collected' ? 'SPECIES' : s === 'tokens' ? 'TOKENS' : '% DONE'}
              </button>
            ))}
            <div style={{ marginLeft:'auto', fontFamily:'var(--ff-pixel)', fontSize:6, color:'var(--text2)' }}>
              {sorted.length} COLLECTORS
            </div>
          </div>
        )}

        {/* ── TABLE ── */}
        <section>
          <div style={{ fontFamily:'var(--ff-pixel)', fontSize:8, color:'var(--teal)', marginBottom:12, letterSpacing:3,
            display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ display:'inline-block', width:2, height:14, background:'var(--teal)', boxShadow:'0 0 8px var(--teal)' }} />
            FULL RANKINGS
          </div>

          {loading ? (
            <div style={{ background:'var(--panel)', border:'1px solid var(--border)' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ background:'var(--bg3)', borderBottom:'1px solid var(--border)' }}>
                    {['#','WALLET','SPECIES','PROGRESS','%','TOKENS','ENERGIES','MISSING'].map(h => (
                      <th key={h} style={{ padding:'12px 10px', fontFamily:'var(--ff-pixel)', fontSize:7, color:'var(--text2)', textAlign:'left', letterSpacing:1, whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({length:12}).map((_,i) => <SkeletonRow key={i} delay={i*60} />)}
                </tbody>
              </table>
            </div>
          ) : error ? (
            <div style={{
              background:'var(--panel)', border:'1px solid var(--border)',
              padding:'60px 20px', textAlign:'center',
              animation:'fadeIn 0.5s ease both',
            }}>
              <div style={{ fontFamily:'var(--ff-pixel)', fontSize:28, marginBottom:16, opacity:0.3 }}>◎</div>
              <div style={{ fontFamily:'var(--ff-pixel)', fontSize:9, color:'var(--text2)', marginBottom:8, letterSpacing:1 }}>
                NO LEADERBOARD DATA YET
              </div>
              <div style={{ fontFamily:'var(--ff-pixel)', fontSize:6, color:'var(--text2)', lineHeight:2.5, opacity:0.6 }}>
                PRESS ⬡ SCAN NOW TO INDEX ALL 9,999 TOKEN HOLDERS<br/>
                SCANS RUN AUTOMATICALLY EVERY NIGHT AT 02:00 UTC
              </div>
            </div>
          ) : (
            <div style={{ background:'var(--panel)', border:'1px solid var(--border)', overflow:'hidden', animation:'fadeUp 0.5s ease both' }}>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:'var(--ff-mono)' }}>
                  <thead>
                    <tr style={{
                      background:'linear-gradient(180deg, var(--bg3) 0%, var(--panel) 100%)',
                      borderBottom:'1px solid var(--border2)',
                    }}>
                      {['#','WALLET','SPECIES','PROGRESS','COMPLETE','TOKENS HELD','ENERGIES','MISSING'].map(h => (
                        <th key={h} style={{ padding:'14px 12px', fontFamily:'var(--ff-pixel)', fontSize:6.5, color:'var(--teal)', textAlign:'left', letterSpacing:1.5, whiteSpace:'nowrap', borderRight:'1px solid var(--border)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((entry, i) => {
                      const pct = parseFloat(entry.progress);
                      const isOpen = openRow === entry.address;
                      const isTop3 = i < 3;
                      const rowColor = i===0 ? 'rgba(255,208,96,0.03)' : i===1 ? 'rgba(200,221,232,0.02)' : i===2 ? 'rgba(232,144,74,0.02)' : 'transparent';
                      return [
                        <tr
                          key={entry.address}
                          onClick={() => setOpenRow(isOpen ? null : entry.address)}
                          style={{
                            borderBottom:`1px solid ${isOpen ? 'var(--teal3)' : 'var(--border)'}`,
                            cursor:'pointer',
                            background: isOpen ? 'rgba(14,240,208,0.04)' : rowColor,
                            transition:'background 0.15s',
                            animation:`slideIn 0.4s ease ${Math.min(i*30, 600)}ms both`,
                          }}
                          onMouseEnter={e => { if (!isOpen) (e.currentTarget as HTMLElement).style.background='rgba(14,240,208,0.03)'; }}
                          onMouseLeave={e => { if (!isOpen) (e.currentTarget as HTMLElement).style.background=isOpen?'rgba(14,240,208,0.04)':rowColor; }}
                        >
                          {/* Rank */}
                          <td style={{ padding:'14px 12px', textAlign:'center', width:40, borderRight:'1px solid var(--border)' }}>
                            <RankBadge rank={i+1} />
                          </td>

                          {/* Wallet */}
                          <td style={{ padding:'14px 12px', borderRight:'1px solid var(--border)' }}>
                            <div style={{ fontSize:12, color: isTop3 ? 'var(--textbright)' : 'var(--text)', letterSpacing:0.5 }}>
                              {shorten(entry.address)}
                            </div>
                          </td>

                          {/* Species count */}
                          <td style={{ padding:'14px 12px', borderRight:'1px solid var(--border)' }}>
                            <span style={{ fontFamily:'var(--ff-pixel)', fontSize:14,
                              color: i===0?'var(--gold)':i===1?'var(--silver)':i===2?'var(--bronze)':'var(--teal)',
                              textShadow: i<3 ? `0 0 8px currentColor` : 'none',
                            }}>
                              {entry.collected}
                            </span>
                            <span style={{ fontFamily:'var(--ff-pixel)', fontSize:7, color:'var(--text2)', marginLeft:4 }}>/ {TOTAL_SPECIES}</span>
                          </td>

                          {/* Progress bar */}
                          <td style={{ padding:'14px 12px', minWidth:120, borderRight:'1px solid var(--border)' }}>
                            <ProgressBar pct={pct} height={6} variant={i===0?'gold':i===1?'silver':i===2?'bronze':'teal'} />
                          </td>

                          {/* Pct */}
                          <td style={{ padding:'14px 12px', borderRight:'1px solid var(--border)', whiteSpace:'nowrap' }}>
                            <span style={{ fontFamily:'var(--ff-pixel)', fontSize:10, color:'var(--lime)',
                              textShadow: pct > 50 ? '0 0 8px rgba(168,255,62,0.5)' : 'none' }}>
                              {entry.progress}
                            </span>
                          </td>

                          {/* Tokens */}
                          <td style={{ padding:'14px 12px', borderRight:'1px solid var(--border)' }}>
                            <span style={{ fontSize:12, color:'var(--text2)' }}>{entry.totalTokensHeld}</span>
                          </td>

                          {/* Energy dots */}
                          <td style={{ padding:'14px 12px', borderRight:'1px solid var(--border)' }}>
                            <EnergyDots byEnergy={entry.byEnergy} size={8} />
                          </td>

                          {/* Missing */}
                          <td style={{ padding:'14px 12px' }}>
                            <span style={{
                              fontFamily:'var(--ff-pixel)', fontSize:8,
                              color: entry.missing === 0 ? 'var(--lime)' : entry.missing < 10 ? 'var(--amber)' : 'var(--text2)',
                              padding:'3px 6px',
                              background: entry.missing === 0 ? 'rgba(168,255,62,0.1)' : 'transparent',
                              border: `1px solid ${entry.missing===0?'rgba(168,255,62,0.3)':'var(--border)'}`,
                            }}>
                              {entry.missing === 0 ? '✓ COMPLETE' : `${entry.missing} LEFT`}
                            </span>
                          </td>
                        </tr>,
                        isOpen && (
                          <tr key={`${entry.address}-detail`}>
                            <td colSpan={8} style={{ padding:0 }}>
                              <DetailPanel entry={entry} registryImages={registryImages} />
                            </td>
                          </tr>
                        ),
                      ];
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {/* ── FOOTER ── */}
        <footer style={{ marginTop:32, paddingTop:16, borderTop:'1px solid var(--border)', display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:8, animation:'fadeIn 0.6s ease 0.5s both' }}>
          <div style={{ fontFamily:'var(--ff-pixel)', fontSize:6, color:'var(--text2)', letterSpacing:1, lineHeight:2 }}>
            CC0MASTERS · ALL DATA ON-CHAIN · ETHEREUM MAINNET<br/>
            <span style={{ color:'var(--teal3)' }}>CONTRACT: 0xeeb036dbbd3039429c430657ed9836568da79d5f</span>
          </div>
          <div style={{ display:'flex', gap:12, alignItems:'center' }}>
            {[['OPENSEA','https://opensea.io/collection/cc0mon'],['ETHERSCAN','https://etherscan.io/address/0xeeb036dbbd3039429c430657ed9836568da79d5f'],['CC0MON','https://cc0mon.com']].map(([label,href]) => (
              <a key={label} href={href} target="_blank" rel="noreferrer" style={{
                fontFamily:'var(--ff-pixel)', fontSize:6, color:'var(--text2)',
                textDecoration:'none', letterSpacing:1,
                transition:'color 0.2s',
              }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color='var(--teal)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color='var(--text2)'}
              >
                {label} ▸
              </a>
            ))}
          </div>
        </footer>
      </main>
    </div>
  );
}
