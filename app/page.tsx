'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import type { LeaderboardData, LeaderboardEntry } from '@/lib/types';

const TOTAL_SPECIES = 260;
const TOTAL_TOKENS  = 9999;
const API_CC0       = 'https://api.cc0mon.com';
const CONCURRENCY   = 45;   // parallel requests per wave
const WAVE_DELAY    = 63000; // 63s between waves (rate limit: 60/min)

const ENERGY_TYPES = ['Fire','Ice','Grass','Electric','Ghost','Dragon','Metal','Toxic','Rock','Bug','Ocean','Earth','Underworld','Mythic','Celestial','Fossil'];
const ENERGY_EMOJIS: Record<string,string> = {
  Fire:'🔥',Ice:'❄️',Grass:'🌿',Electric:'⚡',Ghost:'👻',Dragon:'🐉',
  Metal:'⚙️',Toxic:'☠️',Rock:'🪨',Bug:'🐛',Ocean:'🌊',Earth:'🌍',
  Underworld:'🌑',Mythic:'✨',Celestial:'☀️',Fossil:'🦴',
};
const ENERGY_COLORS: Record<string,string> = {
  Fire:'#ff6030',Ice:'#80e8ff',Grass:'#a0ff60',Electric:'#ffe040',Ghost:'#c080ff',Dragon:'#6080ff',
  Metal:'#a0c8d0',Toxic:'#a0ff20',Rock:'#c0a860',Bug:'#80d040',Ocean:'#40b0ff',Earth:'#c09040',
  Underworld:'#8840c0',Mythic:'#ff80c0',Celestial:'#ffd880',Fossil:'#d0b888',
};

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
function shorten(addr: string) { return addr.slice(0,6)+'…'+addr.slice(-4); }

/* ── ANIMATED NUMBER ── */
function AnimatedNumber({ value, duration=900 }: { value:number; duration?:number }) {
  const [n, setN] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const start = prev.current, end = value, t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now-t0)/duration, 1);
      const cur = Math.round(start + (end-start) * (1-Math.pow(1-p,3)));
      setN(cur); prev.current = cur;
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [value, duration]);
  return <>{n.toLocaleString()}</>;
}

/* ── PROGRESS BAR ── */
function ProgressBar({ pct, variant='green', height=6 }: { pct:number; variant?:'green'|'gold'|'silver'|'bronze'; height?:number }) {
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(()=>setW(pct),80); return ()=>clearTimeout(t); }, [pct]);
  const cls = variant === 'green' ? '' : variant;
  return (
    <div className="pbar-wrap" style={{ height }}>
      <div className={`pbar-fill ${cls}`} style={{ width:`${Math.max(w,0.2)}%` }} />
    </div>
  );
}

/* ── ENERGY DOTS ── */
function EnergyDots({ byEnergy }: { byEnergy: LeaderboardEntry['byEnergy'] }) {
  return (
    <div style={{ display:'flex', gap:2, flexWrap:'wrap', maxWidth:72 }}>
      {ENERGY_TYPES.map(e => {
        const info = byEnergy?.[e];
        const lit = info && info.collected > 0;
        const col = ENERGY_COLORS[e];
        return <div key={e} title={`${e}: ${info?.collected??0}/${info?.total??0}`} style={{
          width:7,height:7,borderRadius:1,
          background:lit?col:'transparent',border:`1px solid ${lit?col:'#1a3d0a'}`,
          boxShadow:lit?`0 0 4px ${col}80`:'none',transition:'all 0.3s',
        }} />;
      })}
    </div>
  );
}

/* ── PODIUM CARD ── */
function PodiumCard({ entry, rank, onClick }: { entry:LeaderboardEntry; rank:1|2|3; onClick:()=>void }) {
  const medals  = { 1:'🥇', 2:'🥈', 3:'🥉' };
  const borders = { 1:'rgba(245,197,24,0.6)',  2:'rgba(192,207,216,0.4)', 3:'rgba(232,144,74,0.4)' };
  const glows   = { 1:'rgba(245,197,24,0.22)', 2:'rgba(192,207,216,0.1)', 3:'rgba(232,144,74,0.12)' };
  const colors  = { 1:'var(--gold)', 2:'var(--silver)', 3:'var(--bronze)' };
  const variantMap = { 1:'gold', 2:'silver', 3:'bronze' } as const;
  const pct = parseFloat(entry.progress);

  return (
    <div onClick={onClick} style={{
      background:'linear-gradient(160deg,var(--panel) 0%,var(--bg3) 100%)',
      border:`2px solid ${borders[rank]}`,
      boxShadow:`0 0 0 1px ${borders[rank]},0 8px 32px ${glows[rank]},inset 0 1px 0 ${borders[rank]}`,
      padding:rank===1?'22px 18px 18px':'14px 16px 16px',
      cursor:'pointer',position:'relative',overflow:'hidden',
      display:'flex',flexDirection:'column',alignItems:'center',
      transition:'all 0.25s ease',animation:`fadeUp 0.6s ease ${(rank-1)*100}ms both`,
    }}
      onMouseEnter={e=>{const el=e.currentTarget as HTMLElement;el.style.transform='translateY(-4px)';}}
      onMouseLeave={e=>{const el=e.currentTarget as HTMLElement;el.style.transform='';}}
    >
      <div style={{position:'absolute',inset:0,opacity:0.025,pointerEvents:'none',
        backgroundImage:'linear-gradient(var(--green1) 1px,transparent 1px),linear-gradient(90deg,var(--green1) 1px,transparent 1px)',
        backgroundSize:'20px 20px'}}/>
      <div style={{position:'absolute',top:8,left:10,fontFamily:'var(--ff-pixel)',fontSize:6,color:colors[rank],opacity:0.5}}>#{rank}</div>
      <div style={{fontSize:rank===1?34:26,marginBottom:10,animation:'float 3s ease-in-out infinite',lineHeight:1}}>{medals[rank]}</div>
      <div style={{fontFamily:'var(--ff-pixel)',fontSize:5,color:'var(--text2)',textAlign:'center',marginBottom:10,wordBreak:'break-all',lineHeight:2,padding:'0 4px'}}>{entry.address}</div>
      <div style={{fontFamily:'var(--ff-pixel)',fontSize:rank===1?28:20,color:colors[rank],textShadow:`0 0 16px ${glows[rank]}`,marginBottom:4,animation:'countUp 0.8s ease both'}}>
        {entry.collected}<span style={{fontSize:'0.4em',color:'var(--text2)',marginLeft:6}}>/{TOTAL_SPECIES}</span>
      </div>
      <div style={{fontFamily:'var(--ff-pixel)',fontSize:5,color:'var(--text2)',marginBottom:10,letterSpacing:1}}>SPECIES COLLECTED</div>
      <div style={{width:'100%'}}><ProgressBar pct={pct} variant={variantMap[rank]} height={rank===1?8:6}/></div>
      <div style={{marginTop:8,display:'flex',gap:10,fontFamily:'var(--ff-pixel)',fontSize:5,color:'var(--text2)'}}>
        <span style={{color:colors[rank]}}>{entry.progress}</span><span>·</span><span>{entry.totalTokensHeld} TOKENS</span>
      </div>
    </div>
  );
}

/* ── RANK BADGE ── */
function RankBadge({ rank }:{ rank:number }) {
  if (rank===1) return <span style={{fontFamily:'var(--ff-pixel)',fontSize:11,color:'var(--gold)',textShadow:'0 0 8px rgba(245,197,24,0.6)'}}>1</span>;
  if (rank===2) return <span style={{fontFamily:'var(--ff-pixel)',fontSize:11,color:'var(--silver)',textShadow:'0 0 8px rgba(192,207,216,0.6)'}}>2</span>;
  if (rank===3) return <span style={{fontFamily:'var(--ff-pixel)',fontSize:11,color:'var(--bronze)',textShadow:'0 0 8px rgba(232,144,74,0.6)'}}>3</span>;
  return <span style={{fontFamily:'var(--ff-pixel)',fontSize:9,color:'var(--text2)'}}>{rank}</span>;
}

/* ── SKELETON ROW ── */
function SkeletonRow({delay}:{delay:number}) {
  return (
    <tr style={{borderBottom:'1px solid var(--border)',opacity:0,animation:`fadeIn 0.4s ease ${delay}ms forwards`}}>
      {[20,130,60,100,50,40,90,60].map((w,i)=>(
        <td key={i} style={{padding:'12px 10px'}}><div className="skeleton" style={{height:9,width:w,borderRadius:2}}/></td>
      ))}
    </tr>
  );
}

/* ── DETAIL PANEL ── */
function DetailPanel({ entry, registryImages }:{entry:LeaderboardEntry;registryImages:Record<string,{svg:string;name:string}>}) {
  return (
    <div style={{background:'linear-gradient(180deg,var(--panel2) 0%,var(--bg3) 100%)',borderTop:'1px solid var(--green1)',borderBottom:'2px solid var(--green1)',padding:22,animation:'gridReveal 0.35s ease both'}}>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(90px,1fr))',gap:8,marginBottom:20}}>
        {([['COLLECTED',entry.collected,'var(--lime)'],['MISSING',entry.missing,'var(--red)'],['COMPLETE',entry.progress,'var(--bright)'],['TOKENS',entry.totalTokensHeld,'var(--amber)']] as [string,string|number,string][]).map(([l,v,c])=>(
          <div key={l} style={{background:'rgba(0,0,0,0.35)',border:`1px solid ${c}25`,padding:'10px 12px',position:'relative',overflow:'hidden'}}>
            <div style={{position:'absolute',top:0,left:0,right:0,height:1,background:`linear-gradient(90deg,transparent,${c},transparent)`}}/>
            <div style={{fontFamily:'var(--ff-pixel)',fontSize:13,color:c as string,marginBottom:4}}>{v}</div>
            <div style={{fontSize:9,color:'var(--text2)',letterSpacing:1}}>{l}</div>
          </div>
        ))}
        <a href={`https://opensea.io/${entry.address}`} target="_blank" rel="noreferrer" style={{background:'rgba(0,0,0,0.3)',border:'1px solid var(--border)',padding:'10px 12px',textDecoration:'none',display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',color:'var(--text2)',fontSize:9,letterSpacing:1,transition:'all 0.2s'}}
          onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor='var(--green2)';(e.currentTarget as HTMLElement).style.color='var(--lime)';}}
          onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor='var(--border)';(e.currentTarget as HTMLElement).style.color='var(--text2)';}}>
          <span style={{fontSize:14,marginBottom:4}}>🌊</span>OPENSEA ▸
        </a>
      </div>
      <div style={{fontFamily:'var(--ff-pixel)',fontSize:6,color:'var(--lime)',marginBottom:8,letterSpacing:2}}>▸ ENERGY BREAKDOWN</div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(96px,1fr))',gap:5,marginBottom:20}}>
        {ENERGY_TYPES.map((e,i)=>{
          const info=entry.byEnergy?.[e]??{collected:0,total:0};
          const pct=info.total?info.collected/info.total*100:0;
          const col=ENERGY_COLORS[e];
          return <div key={e} style={{background:'rgba(0,0,0,0.3)',border:`1px solid ${col}20`,padding:'7px 8px',animation:`fadeUp 0.4s ease ${i*18}ms both`}}>
            <div style={{fontSize:10,marginBottom:3}}>{ENERGY_EMOJIS[e]}</div>
            <div style={{fontFamily:'var(--ff-pixel)',fontSize:4.5,color:col,marginBottom:3}}>{e.toUpperCase()}</div>
            <div style={{fontFamily:'var(--ff-pixel)',fontSize:8,color:col,marginBottom:3}}>{info.collected}<span style={{color:'var(--text2)',fontSize:6}}>/{info.total}</span></div>
            <div className="pbar-wrap" style={{height:3}}><div className="pbar-fill" style={{width:`${pct}%`,background:`linear-gradient(90deg,${col}50,${col})`}}><div style={{display:'none'}}/></div></div>
          </div>;
        })}
      </div>
      <div style={{fontFamily:'var(--ff-pixel)',fontSize:6,color:'var(--lime)',marginBottom:8,letterSpacing:2}}>▸ COLLECTION — {entry.collected}/{TOTAL_SPECIES} SPECIES</div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(64px,1fr))',gap:4,maxHeight:300,overflowY:'auto',paddingRight:4}}>
        {entry.checklist?.map((sp,i)=>{
          const img=registryImages[sp.number];
          return <div key={sp.number} style={{background:sp.collected?'rgba(74,156,18,0.07)':'rgba(0,0,0,0.2)',border:`1px solid ${sp.collected?'rgba(74,156,18,0.3)':'var(--border)'}`,padding:5,textAlign:'center',position:'relative',opacity:sp.collected?1:0.18,animation:`fadeIn 0.3s ease ${Math.min(i*4,500)}ms both`}}>
            {sp.collected&&<div style={{position:'absolute',top:2,right:3,fontFamily:'var(--ff-pixel)',fontSize:5,color:'var(--glow)'}}>✓</div>}
            {img&&<img src={img.svg} alt={sp.name} width={48} height={48} loading="lazy" style={{imageRendering:'pixelated',display:'block',margin:'0 auto 3px'}}/>}
            <div style={{fontFamily:'var(--ff-pixel)',fontSize:3.5,color:sp.collected?'var(--text)':'var(--text2)',lineHeight:1.6,wordBreak:'break-word'}}>{sp.name}</div>
          </div>;
        })}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════ */
export default function CC0Masters() {
  const [data, setData]         = useState<LeaderboardData|null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string|null>(null);
  const [registryImages, setRegistryImages] = useState<Record<string,{svg:string;name:string}>>({});
  const [openRow, setOpenRow]   = useState<string|null>(null);
  const [sortKey, setSortKey]   = useState<'collected'|'tokens'|'pct'>('collected');
  const [filterMode, setFilterMode] = useState<'all'|'top10'|'top50'>('all');

  // Scan state
  const [scanning, setScanning]   = useState(false);
  const [scanPhase, setScanPhase] = useState('');
  const [scanPct, setScanPct]     = useState(0);
  const [scanDetail, setScanDetail] = useState('');
  const [liveOwners, setLiveOwners] = useState(0);
  const scanAbort = useRef(false);

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/leaderboard');
      if (!res.ok) { const e=await res.json(); throw new Error(e.error||'Failed'); }
      setData(await res.json());
    } catch(e:unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchLeaderboard();
    fetch(`${API_CC0}/registry/images`).then(r=>r.json()).then(d=>setRegistryImages(d.images||{})).catch(()=>{});
  }, [fetchLeaderboard]);

  /* ── BROWSER-SIDE SCAN ENGINE ── */
  const startScan = async () => {
    if (scanning) return;
    setScanning(true);
    scanAbort.current = false;

    try {
      // Phase 1: discover all owners
      const ownerMap = new Map<string, number[]>();
      setScanPhase('PHASE 1/2 — DISCOVERING HOLDERS');
      setScanDetail('Scanning all 9,999 tokens...');
      setScanPct(0);

      for (let start = 1; start <= TOTAL_TOKENS; start += CONCURRENCY) {
        if (scanAbort.current) break;
        const end = Math.min(start + CONCURRENCY - 1, TOTAL_TOKENS);
        const ids = Array.from({length: end-start+1}, (_,i)=>start+i);

        const results = await Promise.allSettled(ids.map(id =>
          fetch(`${API_CC0}/cc0mon/${id}/owner`, {signal: AbortSignal.timeout(8000)})
            .then(r=>r.json())
            .then((d:{owner?:string}) => {
              if (d.owner) {
                const addr = d.owner.toLowerCase();
                if (!ownerMap.has(addr)) ownerMap.set(addr, []);
                ownerMap.get(addr)!.push(id);
              }
            })
            .catch(()=>{})
        ));
        void results;

        const pct = Math.round(end / TOTAL_TOKENS * 50);
        setScanPct(pct);
        setLiveOwners(ownerMap.size);
        setScanDetail(`Scanned tokens ${start}–${end} · ${ownerMap.size} unique holders found`);

        if (end < TOTAL_TOKENS) {
          // Rate limit: wait between waves, show countdown
          for (let t = WAVE_DELAY; t > 0; t -= 1000) {
            if (scanAbort.current) break;
            setScanDetail(`Rate limit pause — resuming in ${Math.ceil(t/1000)}s · ${ownerMap.size} holders found so far`);
            await sleep(1000);
          }
        }
      }

      const addresses = Array.from(ownerMap.keys());
      setScanDetail(`Found ${addresses.length} holders — loading collections...`);

      // Phase 2: fetch collector data
      setScanPhase('PHASE 2/2 — LOADING COLLECTIONS');
      const collectors: import('@/lib/types').CollectorData[] = [];

      for (let i = 0; i < addresses.length; i += CONCURRENCY) {
        if (scanAbort.current) break;
        const chunk = addresses.slice(i, i+CONCURRENCY);

        const results = await Promise.allSettled(chunk.map(addr =>
          fetch(`${API_CC0}/collector/${addr}`, {signal: AbortSignal.timeout(10000)})
            .then(r=>r.json())
            .then(d => { if (d.address) collectors.push(d); })
            .catch(()=>{})
        ));
        void results;

        const pct = 50 + Math.round((i+chunk.length) / addresses.length * 45);
        setScanPct(pct);
        setScanDetail(`Loaded ${Math.min(i+chunk.length, addresses.length)}/${addresses.length} collections`);

        if (i + CONCURRENCY < addresses.length) {
          for (let t = WAVE_DELAY; t > 0; t -= 1000) {
            if (scanAbort.current) break;
            setScanDetail(`Rate limit pause — resuming in ${Math.ceil(t/1000)}s · ${collectors.length} collections loaded`);
            await sleep(1000);
          }
        }
      }

      // Phase 3: save to Blob via API
      setScanPhase('SAVING LEADERBOARD');
      setScanPct(98);
      setScanDetail('Saving to database...');

      collectors.sort((a,b) => b.collected - a.collected);
      const leaderboard = {
        updatedAt: new Date().toISOString(),
        totalOwners: collectors.length,
        totalTokensScanned: TOTAL_TOKENS,
        leaders: collectors.map((c,i) => ({ rank:i+1, ...c })),
      };

      await fetch('/api/save', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(leaderboard),
      });

      setScanPhase('COMPLETE');
      setScanPct(100);
      setScanDetail(`Done! ${collectors.length} holders ranked.`);
      setTimeout(() => { fetchLeaderboard(); setScanning(false); setScanPct(0); setScanPhase(''); setScanDetail(''); }, 2000);

    } catch(err) {
      console.error('Scan error:', err);
      setScanPhase('ERROR');
      setScanDetail(String(err));
      setTimeout(() => { setScanning(false); setScanPhase(''); setScanDetail(''); }, 5000);
    }
  };

  const sorted = (data?.leaders??[])
    .slice()
    .sort((a,b)=>sortKey==='tokens'?b.totalTokensHeld-a.totalTokensHeld:sortKey==='pct'?parseFloat(b.progress)-parseFloat(a.progress):b.collected-a.collected)
    .filter((_,i)=>filterMode==='top10'?i<10:filterMode==='top50'?i<50:true);

  const completeCount = data?.leaders.filter(l=>l.collected===TOTAL_SPECIES).length??0;

  return (
    <div style={{background:'var(--bg)',color:'var(--text)',minHeight:'100vh',fontFamily:'var(--ff-mono)'}}>

      {/* Scan line */}
      <div style={{position:'fixed',top:0,left:0,width:'100%',height:2,zIndex:9997,
        background:'linear-gradient(90deg,transparent,var(--glow),transparent)',
        opacity:0.22,animation:'scanMove 10s linear infinite',pointerEvents:'none'}}/>

      {/* ══ HEADER ══ */}
      <header style={{background:'linear-gradient(180deg,#040a04 0%,var(--bg2) 100%)',borderBottom:'2px solid var(--border)',padding:'28px 28px 22px',position:'relative',overflow:'hidden'}}>
        <div style={{position:'absolute',inset:0,opacity:0.025,pointerEvents:'none',
          backgroundImage:'linear-gradient(var(--green1) 1px,transparent 1px),linear-gradient(90deg,var(--green1) 1px,transparent 1px)',
          backgroundSize:'48px 48px'}}/>
        <div style={{position:'absolute',top:-80,right:-80,width:240,height:240,borderRadius:'50%',
          background:'radial-gradient(circle,rgba(139,188,15,0.07) 0%,transparent 70%)',pointerEvents:'none'}}/>

        <div style={{display:'flex',alignItems:'flex-start',gap:16,flexWrap:'wrap',position:'relative'}}>
          <div style={{animation:'fadeUp 0.6s ease both'}}>
            <div style={{fontFamily:'var(--ff-pixel)',fontSize:6,color:'var(--dim)',letterSpacing:2,border:'1px solid var(--border)',padding:'3px 8px',display:'inline-block',marginBottom:8}}>
              ETHEREUM · ON-CHAIN · CC0 · ERC-721
            </div>
            <h1 style={{fontFamily:'var(--ff-pixel)',fontSize:'clamp(22px,5vw,46px)',color:'var(--bright)',letterSpacing:5,lineHeight:1,
              textShadow:'0 0 20px rgba(200,224,48,0.6),0 0 50px rgba(139,188,15,0.2),3px 3px 0 rgba(0,0,0,0.9)',marginBottom:10}}>
              CC0MASTERS
            </h1>
            <p style={{fontFamily:'var(--ff-pixel)',fontSize:7,color:'var(--text2)',letterSpacing:3}}>WHO WILL COLLECT THEM ALL?</p>
          </div>

          <div style={{marginLeft:'auto',display:'flex',flexDirection:'column',alignItems:'flex-end',gap:12,animation:'fadeUp 0.6s ease 120ms both'}}>
            <div style={{display:'flex',gap:8}}>
              <button className="btn btn-secondary" onClick={fetchLeaderboard} disabled={scanning}>↺ REFRESH</button>
              <button className="btn btn-primary" onClick={scanning ? ()=>{scanAbort.current=true;} : startScan}>
                {scanning ? '✕ STOP SCAN' : '⬡ SCAN NOW'}
              </button>
            </div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'flex-end'}}>
              {([['COLLECTORS',data?.totalOwners??liveOwners,'var(--lime)'],['SPECIES',TOTAL_SPECIES,'var(--bright)'],['FULL DEX',completeCount,'var(--gold)']] as [string,number,string][]).map(([label,val,color])=>(
                <div key={label} style={{background:'rgba(11,26,12,0.8)',border:`1px solid ${color}20`,padding:'8px 14px',textAlign:'right',minWidth:80,boxShadow:`inset 0 1px 0 ${color}12`}}>
                  <div style={{fontFamily:'var(--ff-pixel)',fontSize:13,color,marginBottom:3}}>
                    {val>0?<AnimatedNumber value={val}/>:'—'}
                  </div>
                  <div style={{fontFamily:'var(--ff-pixel)',fontSize:6,color:'var(--text2)',letterSpacing:1}}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {data && !scanning && (
          <div style={{marginTop:14,fontFamily:'var(--ff-pixel)',fontSize:5.5,color:'var(--dim)',letterSpacing:1,animation:'fadeIn 1s ease 0.4s both'}}>
            LAST UPDATED: {new Date(data.updatedAt).toLocaleString().toUpperCase()} · AUTO-SCAN: DAILY 02:00 UTC
          </div>
        )}
      </header>

      {/* ══ SCAN PROGRESS BAR ══ */}
      {scanning && (
        <div style={{background:'var(--panel2)',borderBottom:'2px solid var(--green1)',padding:'12px 28px',animation:'fadeIn 0.3s ease both'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6,flexWrap:'wrap',gap:8}}>
            <div style={{fontFamily:'var(--ff-pixel)',fontSize:7,color:'var(--lime)',letterSpacing:2}}>
              ⬡ {scanPhase || 'SCANNING...'}
            </div>
            <div style={{fontFamily:'var(--ff-pixel)',fontSize:7,color:'var(--glow)'}}>{scanPct}%</div>
          </div>
          <div className="pbar-wrap" style={{height:10,marginBottom:6}}>
            <div className="pbar-fill" style={{width:`${scanPct}%`,transition:'width 0.5s ease'}}/>
          </div>
          <div style={{display:'flex',justifyContent:'space-between',flexWrap:'wrap',gap:6}}>
            <div style={{fontFamily:'var(--ff-pixel)',fontSize:6,color:'var(--text2)',letterSpacing:1}}>{scanDetail}</div>
            {liveOwners>0 && <div style={{fontFamily:'var(--ff-pixel)',fontSize:6,color:'var(--lime)',letterSpacing:1}}>{liveOwners} OWNERS FOUND</div>}
          </div>
        </div>
      )}

      <main style={{padding:'24px 28px',maxWidth:1400,margin:'0 auto'}}>

        {/* ══ PODIUM ══ */}
        {!loading && !error && sorted.length >= 3 && (
          <section style={{marginBottom:28}}>
            <div style={{fontFamily:'var(--ff-pixel)',fontSize:7,color:'var(--lime)',marginBottom:14,letterSpacing:3,display:'flex',alignItems:'center',gap:10}}>
              <span style={{display:'inline-block',width:2,height:12,background:'var(--green2)',boxShadow:'0 0 8px var(--glow)'}}/>
              CHAMPION PODIUM
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1.15fr 1fr',gap:10,alignItems:'end'}}>
              <PodiumCard entry={sorted[1]} rank={2} onClick={()=>setOpenRow(openRow===sorted[1].address?null:sorted[1].address)}/>
              <PodiumCard entry={sorted[0]} rank={1} onClick={()=>setOpenRow(openRow===sorted[0].address?null:sorted[0].address)}/>
              <PodiumCard entry={sorted[2]} rank={3} onClick={()=>setOpenRow(openRow===sorted[2].address?null:sorted[2].address)}/>
            </div>
            {[sorted[0],sorted[1],sorted[2]].map(e=>openRow===e.address&&(
              <div key={e.address} style={{marginTop:8}}>
                <DetailPanel entry={e} registryImages={registryImages}/>
              </div>
            ))}
          </section>
        )}

        {/* ══ FILTERS ══ */}
        {!loading && !error && sorted.length > 0 && (
          <div style={{display:'flex',gap:6,marginBottom:12,flexWrap:'wrap',alignItems:'center',animation:'fadeIn 0.5s ease both'}}>
            <span style={{fontFamily:'var(--ff-pixel)',fontSize:6,color:'var(--text2)',marginRight:4}}>SHOW:</span>
            {(['all','top10','top50'] as const).map(f=>(
              <button key={f} className={`btn btn-filter${filterMode===f?' active':''}`} onClick={()=>setFilterMode(f)}>{f.toUpperCase()}</button>
            ))}
            <div style={{width:1,height:14,background:'var(--border)',margin:'0 6px'}}/>
            <span style={{fontFamily:'var(--ff-pixel)',fontSize:6,color:'var(--text2)',marginRight:4}}>SORT:</span>
            {(['collected','tokens','pct'] as const).map(s=>(
              <button key={s} className={`btn btn-filter${sortKey===s?' active':''}`} onClick={()=>setSortKey(s)}>
                {s==='collected'?'SPECIES':s==='tokens'?'TOKENS':'% DONE'}
              </button>
            ))}
            <div style={{marginLeft:'auto',fontFamily:'var(--ff-pixel)',fontSize:6,color:'var(--text2)'}}>{sorted.length} COLLECTORS</div>
          </div>
        )}

        {/* ══ TABLE ══ */}
        <div style={{fontFamily:'var(--ff-pixel)',fontSize:7,color:'var(--lime)',marginBottom:10,letterSpacing:3,display:'flex',alignItems:'center',gap:10}}>
          <span style={{display:'inline-block',width:2,height:12,background:'var(--green2)',boxShadow:'0 0 8px var(--glow)'}}/>
          FULL RANKINGS
        </div>

        {loading ? (
          <div style={{background:'var(--panel)',border:'1px solid var(--border)',overflow:'hidden'}}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead><tr style={{background:'var(--bg3)',borderBottom:'1px solid var(--border2)'}}>
                {['#','WALLET','SPECIES','PROGRESS','%','TOKENS','ENERGIES','MISSING'].map(h=>(
                  <th key={h} style={{padding:'12px 10px',fontFamily:'var(--ff-pixel)',fontSize:6.5,color:'var(--lime)',textAlign:'left',letterSpacing:1.5,whiteSpace:'nowrap',borderRight:'1px solid var(--border)'}}>{h}</th>
                ))}</tr></thead>
              <tbody>{Array.from({length:10}).map((_,i)=><SkeletonRow key={i} delay={i*55}/>)}</tbody>
            </table>
          </div>
        ) : error ? (
          <div style={{background:'var(--panel)',border:'1px solid var(--border)',padding:'50px 20px',textAlign:'center',animation:'fadeIn 0.5s ease both'}}>
            <div style={{fontFamily:'var(--ff-pixel)',fontSize:24,marginBottom:14,opacity:0.2}}>◎</div>
            <div style={{fontFamily:'var(--ff-pixel)',fontSize:8,color:'var(--text2)',marginBottom:12,letterSpacing:1}}>NO LEADERBOARD DATA YET</div>
            <div style={{fontFamily:'var(--ff-pixel)',fontSize:6,color:'var(--dim)',lineHeight:3,marginBottom:16}}>
              PRESS ⬡ SCAN NOW TO BEGIN<br/>
              <span style={{color:'var(--text2)'}}>THE SCAN RUNS IN YOUR BROWSER — YOU CAN WATCH IT PROGRESS</span><br/>
              <span style={{color:'var(--text2)'}}>IT TAKES ~20 MIN DUE TO API RATE LIMITS. DON&apos;T CLOSE THIS TAB.</span>
            </div>
            <button className="btn btn-primary" style={{fontSize:8,padding:'12px 24px'}} onClick={startScan} disabled={scanning}>
              {scanning?'◌ SCANNING...':'⬡ START SCAN NOW'}
            </button>
          </div>
        ) : (
          <div style={{background:'var(--panel)',border:'1px solid var(--border)',overflow:'hidden',animation:'fadeUp 0.5s ease both'}}>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontFamily:'var(--ff-mono)'}}>
                <thead><tr style={{background:'linear-gradient(180deg,var(--bg3) 0%,var(--panel) 100%)',borderBottom:'1px solid var(--border2)'}}>
                  {['#','WALLET','SPECIES','PROGRESS','COMPLETE','TOKENS','ENERGIES','MISSING'].map(h=>(
                    <th key={h} style={{padding:'13px 11px',fontFamily:'var(--ff-pixel)',fontSize:6,color:'var(--lime)',textAlign:'left',letterSpacing:1.5,whiteSpace:'nowrap',borderRight:'1px solid var(--border)'}}>{h}</th>
                  ))}</tr></thead>
                <tbody>
                  {sorted.map((entry,i)=>{
                    const pct=parseFloat(entry.progress);
                    const isOpen=openRow===entry.address;
                    const rowTint=i===0?'rgba(245,197,24,0.03)':i===1?'rgba(192,207,216,0.02)':i===2?'rgba(232,144,74,0.02)':'transparent';
                    const variant=(i===0?'gold':i===1?'silver':i===2?'bronze':'green') as 'gold'|'silver'|'bronze'|'green';
                    return [
                      <tr key={entry.address} onClick={()=>setOpenRow(isOpen?null:entry.address)}
                        style={{borderBottom:`1px solid ${isOpen?'var(--green1)':'var(--border)'}`,cursor:'pointer',background:isOpen?'rgba(74,156,18,0.05)':rowTint,transition:'background 0.12s',animation:`slideIn 0.4s ease ${Math.min(i*28,600)}ms both`}}
                        onMouseEnter={e=>{if(!isOpen)(e.currentTarget as HTMLElement).style.background='rgba(74,156,18,0.04)';}}
                        onMouseLeave={e=>{if(!isOpen)(e.currentTarget as HTMLElement).style.background=rowTint;}}>
                        <td style={{padding:'13px 11px',textAlign:'center',width:36,borderRight:'1px solid var(--border)'}}><RankBadge rank={i+1}/></td>
                        <td style={{padding:'13px 11px',borderRight:'1px solid var(--border)'}}><div style={{fontSize:12,color:i<3?'var(--textbright)':'var(--text)',letterSpacing:0.5}}>{shorten(entry.address)}</div></td>
                        <td style={{padding:'13px 11px',borderRight:'1px solid var(--border)'}}>
                          <span style={{fontFamily:'var(--ff-pixel)',fontSize:14,color:i===0?'var(--gold)':i===1?'var(--silver)':i===2?'var(--bronze)':'var(--lime)',textShadow:i<3?'0 0 8px currentColor':'none'}}>{entry.collected}</span>
                          <span style={{fontFamily:'var(--ff-pixel)',fontSize:7,color:'var(--text2)',marginLeft:4}}>/ {TOTAL_SPECIES}</span>
                        </td>
                        <td style={{padding:'13px 11px',minWidth:110,borderRight:'1px solid var(--border)'}}><ProgressBar pct={pct} variant={variant} height={6}/></td>
                        <td style={{padding:'13px 11px',borderRight:'1px solid var(--border)',whiteSpace:'nowrap'}}>
                          <span style={{fontFamily:'var(--ff-pixel)',fontSize:9,color:'var(--bright)',textShadow:pct>60?'0 0 8px rgba(200,224,48,0.4)':'none'}}>{entry.progress}</span>
                        </td>
                        <td style={{padding:'13px 11px',borderRight:'1px solid var(--border)'}}><span style={{fontSize:12,color:'var(--text2)'}}>{entry.totalTokensHeld}</span></td>
                        <td style={{padding:'13px 11px',borderRight:'1px solid var(--border)'}}><EnergyDots byEnergy={entry.byEnergy}/></td>
                        <td style={{padding:'13px 11px'}}>
                          <span style={{fontFamily:'var(--ff-pixel)',fontSize:7,color:entry.missing===0?'var(--lime)':entry.missing<10?'var(--amber)':'var(--text2)',padding:'3px 6px',background:entry.missing===0?'rgba(139,188,15,0.1)':'transparent',border:`1px solid ${entry.missing===0?'rgba(139,188,15,0.35)':'var(--border)'}`}}>
                            {entry.missing===0?'✓ COMPLETE':`${entry.missing} LEFT`}
                          </span>
                        </td>
                      </tr>,
                      isOpen&&<tr key={`${entry.address}-d`}><td colSpan={8} style={{padding:0}}><DetailPanel entry={entry} registryImages={registryImages}/></td></tr>,
                    ];
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <footer style={{marginTop:28,paddingTop:14,borderTop:'1px solid var(--border)',display:'flex',justifyContent:'space-between',flexWrap:'wrap',gap:8,animation:'fadeIn 0.6s ease 0.6s both'}}>
          <div style={{fontFamily:'var(--ff-pixel)',fontSize:5.5,color:'var(--dim)',letterSpacing:1,lineHeight:2}}>
            CC0MASTERS · ALL DATA ON-CHAIN · ETHEREUM MAINNET<br/>
            <span style={{color:'var(--border2)'}}>0xeeb036dbbd3039429c430657ed9836568da79d5f</span>
          </div>
          <div style={{display:'flex',gap:14,alignItems:'center'}}>
            {[['OPENSEA','https://opensea.io/collection/cc0mon'],['ETHERSCAN','https://etherscan.io/address/0xeeb036dbbd3039429c430657ed9836568da79d5f'],['CC0MON.COM','https://cc0mon.com']].map(([l,h])=>(
              <a key={l} href={h} target="_blank" rel="noreferrer" style={{fontFamily:'var(--ff-pixel)',fontSize:6,color:'var(--dim)',textDecoration:'none',letterSpacing:1,transition:'color 0.2s'}}
                onMouseEnter={e=>(e.currentTarget as HTMLElement).style.color='var(--lime)'}
                onMouseLeave={e=>(e.currentTarget as HTMLElement).style.color='var(--dim)'}>{l} ▸</a>
            ))}
          </div>
        </footer>
      </main>
    </div>
  );
}
