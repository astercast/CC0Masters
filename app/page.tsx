'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import type { LeaderboardData, LeaderboardEntry, CollectorData } from '@/lib/types';

const TOTAL_SPECIES  = 260;
const TOTAL_TOKENS   = 9999;
const CC0_CONTRACT   = '0xeeb036dbbd3039429c430657ed9836568da79d5f';
const MULTICALL3     = '0xcA11bde05977b3631167028862bE2a173976CA11';
const ETH_RPC        = '/api/rpc';
const ETH_RPC2       = '/api/rpc';

const ENERGY_TYPES = ['Fire','Ice','Grass','Electric','Ghost','Dragon','Metal','Toxic','Rock','Bug','Ocean','Earth','Underworld','Mythic','Celestial','Fossil'];
const ENERGY_EMOJIS: Record<string,string> = { Fire:'🔥',Ice:'❄️',Grass:'🌿',Electric:'⚡',Ghost:'👻',Dragon:'🐉',Metal:'⚙️',Toxic:'☠️',Rock:'🪨',Bug:'🐛',Ocean:'🌊',Earth:'🌍',Underworld:'🌑',Mythic:'✨',Celestial:'☀️',Fossil:'🦴' };
const ENERGY_COLORS: Record<string,string> = { Fire:'#ff6030',Ice:'#80e8ff',Grass:'#a0ff60',Electric:'#ffe040',Ghost:'#c080ff',Dragon:'#6080ff',Metal:'#a0c8d0',Toxic:'#a0ff20',Rock:'#c0a860',Bug:'#80d040',Ocean:'#40b0ff',Earth:'#c09040',Underworld:'#8840c0',Mythic:'#ff80c0',Celestial:'#ffd880',Fossil:'#d0b888' };

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
function pad32(hex: string) { return hex.padStart(64,'0'); }

/* ── ENS cache ── */
const ensCache = new Map<string, string | null>();
async function resolveENS(address: string): Promise<string | null> {
  const key = address.toLowerCase();
  if (ensCache.has(key)) return ensCache.get(key)!;
  try {
    const res = await fetch(`https://api.ensideas.com/ens/resolve/${key}`, { signal: AbortSignal.timeout(4000) });
    const d = await res.json();
    const name = d.name || null;
    ensCache.set(key, name); return name;
  } catch { ensCache.set(key, null); return null; }
}

function AddressDisplay({ address, large }: { address: string; large?: boolean }) {
  const [ens, setEns] = useState<string | null>(ensCache.get(address.toLowerCase()) ?? null);
  useEffect(() => { if (ens !== null) return; resolveENS(address).then(setEns); }, [address, ens]);
  const display = ens ?? (address.slice(0,6) + '…' + address.slice(-4));
  return (
    <a href={`https://opensea.io/${address}`} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()}
      title={`${address} — view on OpenSea`}
      style={{ fontFamily:'var(--ff-mono)', fontSize:large?14:12, color:ens?'var(--bright)':'var(--text)',
        textDecoration:'none', borderBottom:ens?'1px solid rgba(168,255,62,0.3)':'none', transition:'color 0.15s', wordBreak:'break-all' }}
      onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.color='var(--accent)';}}
      onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.color=ens?'var(--bright)':'var(--text)';}}>
      {display}
    </a>
  );
}

/* ══ MULTICALL ENGINE ══ */
function pad32hex(hex: string) { return hex.padStart(64,'0'); }

async function multicallBatch(
  calls: { target: string; callData: string }[],
  rpcRetries = 2, rpc = ETH_RPC
): Promise<Array<{ success: boolean; data: string }>> {
  const n = calls.length;
  const INPUT_STRUCT_SIZE = 6 * 32;
  let data = '82ad56cb';
  data += pad32hex('20');
  data += pad32hex(n.toString(16));
  for (let i = 0; i < n; i++) data += pad32hex((n * 32 + i * INPUT_STRUCT_SIZE).toString(16));
  for (const c of calls) {
    const cd = c.callData.replace('0x','');
    data += pad32hex(c.target.slice(2));
    data += pad32hex('1');
    data += pad32hex('60');
    data += pad32hex((cd.length/2).toString(16));
    data += cd.padEnd(Math.ceil(cd.length/64)*64,'0');
  }
  for (let attempt = 0; attempt <= rpcRetries; attempt++) {
    try {
      const res = await fetch(rpc, { method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({jsonrpc:'2.0',method:'eth_call',id:1,params:[{to:MULTICALL3,data:'0x'+data},'latest']}),
        signal:AbortSignal.timeout(30000) });
      const json = await res.json();
      if (!json.result) { if (attempt < rpcRetries) { await sleep(1500); continue; } return []; }
      const raw = json.result.slice(2);
      const numResults = parseInt(raw.slice(64,128), 16);
      const results: Array<{ success: boolean; data: string }> = [];
      for (let i = 0; i < numResults; i++) {
        const offsetVal = parseInt(raw.slice(128 + i*64, 192 + i*64), 16);
        const resultStart = 128 + offsetVal * 2;
        const success = parseInt(raw.slice(resultStart, resultStart+64), 16) !== 0;
        const bytesRelOff = parseInt(raw.slice(resultStart+64, resultStart+128), 16) * 2;
        const bytesStart = resultStart + bytesRelOff;
        const bytesLen = parseInt(raw.slice(bytesStart, bytesStart+64), 16);
        results.push({ success, data: raw.slice(bytesStart+64, bytesStart+64+bytesLen*2) });
      }
      return results;
    } catch { if (attempt < rpcRetries) await sleep(2000); }
  }
  return [];
}

function makeOwnerOfCall(tokenId: number) { return { target:CC0_CONTRACT, callData:'0x6352211e'+pad32(tokenId.toString(16)) }; }
function makeTokenURICall(tokenId: number) { return { target:CC0_CONTRACT, callData:'0xc87b56dd'+pad32(tokenId.toString(16)) }; }
function decodeAddress(hex: string): string | null {
  if (!hex || hex.length < 64) return null;
  const addr = '0x' + hex.slice(24, 64);
  if (addr === '0x0000000000000000000000000000000000000000') return null;
  return addr.toLowerCase();
}
function decodeTokenURI(hex: string): { speciesNum: number; energy: string; name: string } | null {
  try {
    const strLen = parseInt(hex.slice(64,128), 16);
    const strHex = hex.slice(128, 128 + strLen*2);
    const str = decodeURIComponent(escape(String.fromCharCode(...Array.from({length:strHex.length/2},(_,i)=>parseInt(strHex.slice(i*2,i*2+2),16)))));
    const b64 = str.split(',')[1];
    const json = JSON.parse(atob(b64));
    const match = json.name?.match(/#(\d+)/);
    if (!match) return null;
    const speciesNum = parseInt(match[1], 10);
    const energy = json.attributes?.find((a:{trait_type:string;value:string})=>a.trait_type==='Energy')?.value??'';
    const speciesName = json.attributes?.find((a:{trait_type:string;value:string})=>a.trait_type==='Name')?.value?.replace(/ #\d+$/,'')?? '';
    return { speciesNum, energy, name: speciesName };
  } catch { return null; }
}

async function runOnChainScan(
  setPhase:(s:string)=>void, setPct:(n:number)=>void, setDetail:(s:string)=>void,
  setLiveOwners:(n:number)=>void, abortRef:React.MutableRefObject<boolean>,
  registryData:Record<string,{name:string;energy:string}>
): Promise<CollectorData[]> {
  const BATCH = 500;
  setPhase('PHASE 1/3 — READING OWNERS');
  const tokenOwners = new Map<number,string>();
  const ownerTokens = new Map<string,number[]>();

  for (let start = 1; start <= TOTAL_TOKENS && !abortRef.current; start += BATCH) {
    const end = Math.min(start+BATCH-1,TOTAL_TOKENS);
    const ids = Array.from({length:end-start+1},(_,i)=>start+i);
    const results = await multicallBatch(ids.map(makeOwnerOfCall));
    for (let i = 0; i < results.length; i++) {
      if (!results[i].success) continue;
      const addr = decodeAddress(results[i].data);
      if (!addr) continue;
      tokenOwners.set(ids[i], addr);
      if (!ownerTokens.has(addr)) ownerTokens.set(addr, []);
      ownerTokens.get(addr)!.push(ids[i]);
    }
    setPct(Math.round(end/TOTAL_TOKENS*30));
    setLiveOwners(ownerTokens.size);
    setDetail(`Tokens ${start}–${end} · ${ownerTokens.size} holders`);
    await sleep(200);
  }

  setPhase('PHASE 2/3 — READING SPECIES DATA');
  const tokenSpecies = new Map<number,{speciesNum:number;energy:string;name:string}>();
  const URI_BATCH = 50;

  for (let start = 1; start <= TOTAL_TOKENS && !abortRef.current; start += URI_BATCH) {
    const end = Math.min(start+URI_BATCH-1,TOTAL_TOKENS);
    const ids = Array.from({length:end-start+1},(_,i)=>start+i);
    const results = await multicallBatch(ids.map(makeTokenURICall), 2, ETH_RPC2);
    for (let i = 0; i < results.length; i++) {
      if (!results[i].success) continue;
      const parsed = decodeTokenURI(results[i].data);
      if (parsed) tokenSpecies.set(ids[i], parsed);
    }
    setPct(30+Math.round((end/TOTAL_TOKENS)*50));
    setDetail(`Species data: tokens ${start}–${end} (${tokenSpecies.size} decoded)`);
    await sleep(100);
  }

  setPhase('PHASE 3/3 — BUILDING LEADERBOARD');
  setPct(82);
  setDetail('Computing dex completion...');

  const speciesInfo = new Map<number,{name:string;energy:string}>();
  for (const [,sp] of tokenSpecies) { if (!speciesInfo.has(sp.speciesNum)) speciesInfo.set(sp.speciesNum,{name:sp.name,energy:sp.energy}); }
  for (const [numStr,info] of Object.entries(registryData)) { const n=parseInt(numStr); if (!speciesInfo.has(n)) speciesInfo.set(n,info); }

  const allSpecies = Array.from({length:TOTAL_SPECIES},(_,i)=>i+1).map(n=>({
    number:String(n), name:speciesInfo.get(n)?.name??`Species #${n}`, energy:speciesInfo.get(n)?.energy??'',
  }));

  const collectors: CollectorData[] = [];
  for (const [address, tokenIds] of ownerTokens) {
    const collectedSpecies = new Set<number>();
    for (const tid of tokenIds) { const sp=tokenSpecies.get(tid); if(sp) collectedSpecies.add(sp.speciesNum); }
    const byEnergy: Record<string,{collected:number;total:number}> = {};
    for (const et of ENERGY_TYPES) {
      byEnergy[et] = {
        total: allSpecies.filter(s=>s.energy===et).length,
        collected: allSpecies.filter(s=>s.energy===et&&collectedSpecies.has(parseInt(s.number))).length,
      };
    }
    const checklist = allSpecies.map(s=>({number:s.number,name:s.name,collected:collectedSpecies.has(parseInt(s.number))}));
    const collected = collectedSpecies.size;
    collectors.push({ address, collected, missing:TOTAL_SPECIES-collected,
      progress:((collected/TOTAL_SPECIES)*100).toFixed(1)+'%',
      totalTokensHeld:tokenIds.length, byEnergy, checklist,
      collectedSpeciesNums:Array.from(collectedSpecies) });
  }
  return collectors;
}

/* ══ UI COMPONENTS ══ */

function AnimatedNumber({ value, duration=900 }: { value:number; duration?:number }) {
  const [n, setN] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const start=prev.current,end=value,t0=performance.now();
    const tick=(now:number)=>{ const p=Math.min((now-t0)/duration,1); const cur=Math.round(start+(end-start)*(1-Math.pow(1-p,3))); setN(cur); prev.current=cur; if(p<1)requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }, [value, duration]);
  return <>{n.toLocaleString()}</>;
}

function ProgressBar({ pct, variant='blue', height=5 }: { pct:number; variant?:'blue'|'gold'|'silver'|'bronze'; height?:number }) {
  const [w, setW] = useState(0);
  useEffect(() => { const t=setTimeout(()=>setW(pct),80); return()=>clearTimeout(t); }, [pct]);
  const gradients = {
    blue:'linear-gradient(90deg,var(--accent),var(--cyan))',
    gold:'linear-gradient(90deg,#b8860b,var(--gold))',
    silver:'linear-gradient(90deg,#7090a0,var(--silver))',
    bronze:'linear-gradient(90deg,#b05020,var(--bronze))',
  };
  return <div className="pbar-wrap" style={{height}}><div className="pbar-fill" style={{width:`${Math.max(w,0.2)}%`,background:gradients[variant]}}/></div>;
}

function EnergyGrid({ byEnergy }: { byEnergy: LeaderboardEntry['byEnergy'] }) {
  return <div style={{display:'flex',gap:2,flexWrap:'wrap',maxWidth:96}}>
    {ENERGY_TYPES.map(e=>{ const info=byEnergy?.[e]; const lit=info&&info.collected>0; const col=ENERGY_COLORS[e];
      return <div key={e} title={`${e}: ${info?.collected??0}/${info?.total??0}`}
        style={{width:7,height:7,borderRadius:2,background:lit?col:'rgba(255,255,255,0.04)',
          border:`1px solid ${lit?col+'60':'rgba(255,255,255,0.06)'}`,
          boxShadow:lit?`0 0 5px ${col}60`:'none',transition:'all 0.25s'}}/>; })}
  </div>;
}

function PodiumCard({ entry, rank, onClick, isOpen }: { entry:LeaderboardEntry; rank:1|2|3; onClick:()=>void; isOpen:boolean }) {
  const RANK_META = {
    1: { medal:'🥇', color:'var(--gold)', border:'rgba(255,215,0,0.3)', glow:'rgba(255,215,0,0.12)', label:'CHAMPION', delay:100 },
    2: { medal:'🥈', color:'var(--silver)', border:'rgba(184,200,224,0.2)', glow:'rgba(184,200,224,0.06)', label:'RUNNER-UP', delay:0 },
    3: { medal:'🥉', color:'var(--bronze)', border:'rgba(232,144,74,0.2)', glow:'rgba(232,144,74,0.08)', label:'3RD PLACE', delay:200 },
  };
  const m = RANK_META[rank];
  const variantMap = {1:'gold' as const,2:'silver' as const,3:'bronze' as const};
  return (
    <div onClick={onClick} className={`podium-card rank-${rank}${isOpen?' open':''}`}
      style={{animation:`fadeUp 0.5s ease ${m.delay}ms both`}}>
      <div style={{position:'absolute',top:12,left:14,fontSize:10,fontWeight:800,color:m.color,fontFamily:'var(--ff-display)',opacity:0.45}}>{m.label}</div>
      <div style={{position:'absolute',top:-40,left:'50%',transform:'translateX(-50%)',width:120,height:120,
        borderRadius:'50%',background:`radial-gradient(circle,${m.glow} 0%,transparent 70%)`,pointerEvents:'none'}}/>
      <div style={{textAlign:'center',paddingTop:14}}>
        <div style={{fontSize:rank===1?44:32,animation:'float 4s ease-in-out infinite',lineHeight:1,marginBottom:14}}>{m.medal}</div>
        <div style={{marginBottom:10}}><AddressDisplay address={entry.address} large={rank===1}/></div>
        <div style={{fontSize:rank===1?44:34,fontWeight:800,color:m.color,fontFamily:'var(--ff-display)',
          letterSpacing:'-0.02em',lineHeight:1,marginBottom:4,textShadow:`0 0 30px ${m.glow}`}}>
          {entry.collected}<span style={{fontSize:'0.38em',color:'var(--text2)',marginLeft:6,fontWeight:600}}>/{TOTAL_SPECIES}</span>
        </div>
        <div style={{fontSize:10,color:'var(--text2)',fontWeight:600,letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:12}}>species collected</div>
        <ProgressBar pct={parseFloat(entry.progress)} variant={variantMap[rank]} height={rank===1?8:5}/>
        <div style={{marginTop:10,display:'flex',gap:12,justifyContent:'center',fontSize:11,color:'var(--text2)',fontWeight:600}}>
          <span style={{color:m.color}}>{entry.progress}</span>
          <span style={{opacity:0.4}}>·</span>
          <span>{entry.totalTokensHeld} tokens</span>
        </div>
      </div>
    </div>
  );
}

function SkeletonRow() {
  return <tr style={{borderBottom:'1px solid var(--border)'}}>
    {[32,160,70,120,50,45,100,65].map((w,i)=>(
      <td key={i} style={{padding:'14px'}}><div className="skeleton" style={{height:8,width:w,borderRadius:4}}/></td>
    ))}
  </tr>;
}

/* Sprite with lazy loading + error fallback */
function SpeciesSprite({ src, name, size=48 }: { src:string; name:string; size?:number }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  if (failed || !src) return (
    <div style={{width:size,height:size,display:'flex',alignItems:'center',justifyContent:'center',
      background:'rgba(255,255,255,0.03)',borderRadius:4,fontSize:size*0.3,opacity:0.3}}>?</div>
  );
  return (
    <div style={{width:size,height:size,position:'relative',display:'flex',alignItems:'center',justifyContent:'center'}}>
      {!loaded&&<div className="skeleton" style={{position:'absolute',inset:0,borderRadius:4}}/>}
      <img src={src} alt={name} width={size} height={size} loading="lazy"
        onLoad={()=>setLoaded(true)} onError={()=>setFailed(true)}
        style={{imageRendering:'pixelated',display:'block',opacity:loaded?1:0,transition:'opacity 0.2s',position:'absolute'}}/>
    </div>
  );
}

function DetailPanel({
  entry, registryImages, registryData
}: {
  entry:LeaderboardEntry;
  registryImages:Record<string,{svg:string;png:string;name:string}>;
  registryData:Record<string,{name:string;energy:string}>;
}) {
  const [activeTab, setActiveTab] = useState<'energy'|'collection'>('energy');
  const checklist = entry.checklist ?? (()=>{
    const collected = new Set(entry.collectedSpeciesNums??[]);
    return Array.from({length:TOTAL_SPECIES},(_,i)=>{
      const num = String(i+1);
      return { number:num, name:registryData[num]?.name??`#${num}`, collected:collected.has(i+1) };
    });
  })();

  return (
    <div className="detail-panel">
      {/* Stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(100px,1fr))',gap:10,marginBottom:20}}>
        {([
          ['Collected',entry.collected,'var(--accent)'],
          ['Missing',entry.missing,entry.missing===0?'var(--green)':'var(--text2)'],
          ['Complete',entry.progress,'var(--bright)'],
          ['Tokens',entry.totalTokensHeld,'var(--amber)'],
        ] as [string,string|number,string][]).map(([l,v,c])=>(
          <div key={l} style={{background:'rgba(255,255,255,0.03)',border:'1px solid var(--border)',borderRadius:8,padding:'12px 14px'}}>
            <div style={{fontSize:20,fontWeight:800,color:c,fontFamily:'var(--ff-display)',lineHeight:1,marginBottom:4}}>{v}</div>
            <div style={{fontSize:10,color:'var(--text2)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.08em'}}>{l}</div>
          </div>
        ))}
        <a href={`https://opensea.io/${entry.address}`} target="_blank" rel="noreferrer"
          style={{background:'rgba(255,255,255,0.03)',border:'1px solid var(--border)',borderRadius:8,padding:'12px 14px',
            textDecoration:'none',display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',
            color:'var(--text2)',fontSize:11,fontWeight:700,letterSpacing:'0.06em',textTransform:'uppercase',transition:'all 0.18s',gap:4}}
          onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor='var(--accent)';(e.currentTarget as HTMLElement).style.color='var(--accent)';}}
          onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor='var(--border)';(e.currentTarget as HTMLElement).style.color='var(--text2)';}}>
          <span style={{fontSize:20}}>🌊</span>OpenSea ↗
        </a>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',gap:4,marginBottom:16,borderBottom:'1px solid var(--border)'}}>
        {(['energy','collection'] as const).map(tab=>(
          <button key={tab} onClick={()=>setActiveTab(tab)}
            style={{background:'none',border:'none',cursor:'pointer',padding:'8px 14px',
              fontSize:11,fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase',
              color:activeTab===tab?'var(--bright)':'var(--text2)',
              borderBottom:`2px solid ${activeTab===tab?'var(--accent)':'transparent'}`,
              marginBottom:-1,transition:'all 0.15s'}}>
            {tab==='energy'?'⚡ Energy':`🔲 Collection (${entry.collected}/${TOTAL_SPECIES})`}
          </button>
        ))}
      </div>

      {/* Energy tab */}
      {activeTab==='energy'&&(
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(100px,1fr))',gap:8}}>
          {ENERGY_TYPES.map((e,i)=>{
            const info=entry.byEnergy?.[e]??{collected:0,total:0};
            const pct=info.total?info.collected/info.total*100:0;
            const col=ENERGY_COLORS[e];
            return <div key={e} style={{background:'rgba(255,255,255,0.02)',border:`1px solid ${col}18`,
              borderRadius:8,padding:'10px',animation:`fadeUp 0.35s ease ${i*20}ms both`}}>
              <div style={{fontSize:16,marginBottom:5}}>{ENERGY_EMOJIS[e]}</div>
              <div style={{fontSize:9,fontWeight:700,color:col,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>{e}</div>
              <div style={{fontSize:15,fontWeight:800,color:col,fontFamily:'var(--ff-display)',marginBottom:5}}>
                {info.collected}<span style={{fontSize:9,color:'var(--text2)',fontWeight:500}}>/{info.total}</span>
              </div>
              <div className="pbar-wrap" style={{height:3}}>
                <div className="pbar-fill" style={{width:`${pct}%`,background:`linear-gradient(90deg,${col}60,${col})`}}/>
              </div>
            </div>;
          })}
        </div>
      )}

      {/* Collection tab */}
      {activeTab==='collection'&&(
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(72px,1fr))',gap:6,maxHeight:380,overflowY:'auto',paddingRight:4}}>
          {checklist.map((sp,i)=>{
            // KEY FIX: use .png for reliability (SVGs sometimes fail cross-origin), fall back to svg
            const imgData = registryImages[sp.number];
            const imgSrc = imgData?.png || imgData?.svg || '';
            return (
              <div key={sp.number} className={`species-cell${sp.collected?' collected':''}`}
                style={{opacity:sp.collected?1:0.2,animation:`fadeIn 0.2s ease ${Math.min(i*3,400)}ms both`}}>
                {sp.collected&&<div style={{position:'absolute',top:3,right:4,fontSize:7,color:'var(--cyan)',fontWeight:800}}>✓</div>}
                <SpeciesSprite src={imgSrc} name={sp.name} size={48}/>
                <div style={{fontSize:8,color:sp.collected?'var(--text)':'var(--text2)',fontFamily:'var(--ff-display)',
                  fontWeight:600,lineHeight:1.3,marginTop:3,wordBreak:'break-word',overflow:'hidden',
                  display:'-webkit-box' as 'flex',WebkitLineClamp:2,WebkitBoxOrient:'vertical' as 'vertical'}}>
                  {sp.name}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ══ MAIN PAGE ══ */
export default function CC0Masters() {
  const [data,setData]                         = useState<LeaderboardData|null>(null);
  const [loading,setLoading]                   = useState(true);
  const [error,setError]                       = useState<string|null>(null);
  const [registryImages,setRegistryImages]     = useState<Record<string,{svg:string;png:string;name:string}>>({});
  const [registryData,setRegistryData]         = useState<Record<string,{name:string;energy:string}>>({});
  const [openRow,setOpenRow]                   = useState<string|null>(null);
  const [sortKey,setSortKey]                   = useState<'collected'|'tokens'|'pct'>('collected');
  const [filterMode,setFilterMode]             = useState<'all'|'top10'|'top50'>('all');
  const [isAdmin,setIsAdmin]                   = useState(false);
  const [scanning,setScanning]                 = useState(false);
  const [scanPhase,setScanPhase]               = useState('');
  const [scanPct,setScanPct]                   = useState(0);
  const [scanDetail,setScanDetail]             = useState('');
  const [liveOwners,setLiveOwners]             = useState(0);
  const scanAbort = useRef(false);

  const fetchLeaderboard = useCallback(async()=>{
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/leaderboard');
      if (!res.ok) { setError('no_data'); return; }
      const json: LeaderboardData = await res.json();
      setData(json);
    } catch { setError('fetch_failed'); }
    finally { setLoading(false); }
  },[]);

  useEffect(()=>{
    fetchLeaderboard();
    // Load registry images (species num -> svg/png)
    fetch('https://api.cc0mon.com/registry/images').then(r=>r.json()).then(d=>{
      const images: Record<string,{svg:string;png:string;name:string}> = {};
      const rd: Record<string,{name:string;energy:string}> = {};
      for (const [k,v] of Object.entries(d.images||{})) {
        const e = v as {name:string;tokenId:number;svg:string;png:string};
        images[k] = { svg:e.svg, png:e.png, name:e.name };
        rd[k] = { name:e.name, energy:'' };
      }
      setRegistryImages(images);
      setRegistryData(rd);
    }).catch(()=>{});
    // Load registry for energy data
    fetch('https://api.cc0mon.com/registry').then(r=>r.json()).then(d=>{
      const rd: Record<string,{name:string;energy:string}> = {};
      for (const sp of (d.cc0mon||[])) rd[String(sp.number)]={name:sp.name,energy:sp.energy};
      setRegistryData(prev=>{ const next={...prev}; for(const [k,v] of Object.entries(rd)) next[k]={...next[k],...v}; return next; });
    }).catch(()=>{});
  },[fetchLeaderboard]);

  const checkAdmin = ()=>{ const pw=prompt('Admin password:'); if(pw==='cc0masters'){setIsAdmin(true);return true;} return false; };

  const startScan = async()=>{
    if (!isAdmin&&!checkAdmin()) return;
    scanAbort.current=false;
    setScanning(true); setScanPct(0); setScanPhase(''); setScanDetail(''); setLiveOwners(0);
    try {
      const collectors = await runOnChainScan(setScanPhase,setScanPct,setScanDetail,setLiveOwners,scanAbort,registryData);
      if (scanAbort.current) { setScanning(false); setScanPhase('CANCELLED'); return; }
      setScanPhase('SAVING…'); setScanPct(95); setScanDetail('Writing to storage...');
      collectors.sort((a,b)=>b.collected-a.collected);
      const scannedBlock = await fetch(ETH_RPC,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({jsonrpc:'2.0',method:'eth_blockNumber',id:1,params:[]})})
        .then(r=>r.json()).then(j=>parseInt(j.result,16)).catch(()=>0);
      const leaders = collectors.map((c,i)=>{ const {checklist:_cl,...rest}=c as typeof c&{checklist?:unknown}; return {rank:i+1,...rest}; });
      const saveRes = await fetch('/api/save',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({updatedAt:new Date().toISOString(),scannedBlock,totalOwners:collectors.length,totalTokensScanned:TOTAL_TOKENS,leaders})});
      if (!saveRes.ok) { const err=await saveRes.json(); throw new Error(err.error||'Save failed'); }
      setScanPct(100); setScanPhase('COMPLETE ✓');
      setTimeout(()=>{ setScanning(false); setScanPhase(''); fetchLeaderboard(); },1500);
    } catch(err) {
      setScanPhase('ERROR'); setScanDetail(String(err));
      setTimeout(()=>{ setScanning(false); setScanPhase(''); setScanDetail(''); },6000);
    }
  };

  const sorted = (data?.leaders??[]).slice()
    .sort((a,b)=>sortKey==='tokens'?b.totalTokensHeld-a.totalTokensHeld:sortKey==='pct'?parseFloat(b.progress)-parseFloat(a.progress):b.collected-a.collected)
    .filter((_,i)=>filterMode==='top10'?i<10:filterMode==='top50'?i<50:true);
  const completeCount = data?.leaders.filter(l=>l.collected===TOTAL_SPECIES).length??0;

  return (
    <div style={{background:'var(--bg)',color:'var(--text)',minHeight:'100vh',fontFamily:'var(--ff-display)',position:'relative'}}>

      {/* Background orbs */}
      <div style={{position:'fixed',inset:0,zIndex:0,pointerEvents:'none',overflow:'hidden'}}>
        <div style={{position:'absolute',top:'-20%',left:'-10%',width:'55%',height:'55%',
          background:'radial-gradient(ellipse,rgba(79,127,255,0.05) 0%,transparent 70%)',borderRadius:'50%'}}/>
        <div style={{position:'absolute',bottom:'-15%',right:'-5%',width:'45%',height:'45%',
          background:'radial-gradient(ellipse,rgba(123,95,255,0.04) 0%,transparent 70%)',borderRadius:'50%'}}/>
      </div>

      {/* Header */}
      <header style={{position:'relative',zIndex:10,borderBottom:'1px solid var(--border)',
        background:'rgba(8,11,16,0.85)',backdropFilter:'blur(20px)',padding:'22px 32px'}}>
        <div style={{maxWidth:1400,margin:'0 auto'}}>
          <div style={{display:'flex',alignItems:'center',gap:20,flexWrap:'wrap',justifyContent:'space-between'}}>
            <div style={{animation:'fadeUp 0.5s ease both'}}>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                <div className="glow-dot"/>
                <span style={{fontSize:11,fontWeight:700,color:'var(--text2)',letterSpacing:'0.15em',textTransform:'uppercase'}}>
                  Ethereum · ERC-721 · CC0
                </span>
              </div>
              <h1 style={{fontSize:'clamp(26px,5vw,50px)',fontWeight:800,letterSpacing:'-0.03em',lineHeight:0.95,
                background:'linear-gradient(135deg,#e8f0ff 0%,var(--cyan) 50%,var(--accent) 100%)',
                WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',backgroundClip:'text'}}>
                CC0MASTERS
              </h1>
              <p style={{fontSize:12,color:'var(--text2)',fontWeight:600,letterSpacing:'0.08em',marginTop:6,textTransform:'uppercase'}}>
                Who will collect them all?
              </p>
            </div>
            <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:12,animation:'fadeUp 0.5s ease 100ms both'}}>
              <div style={{display:'flex',gap:8}}>
                <button className="btn btn-secondary" onClick={fetchLeaderboard} disabled={scanning}>↺ Refresh</button>
                {scanning
                  ? <button className="btn btn-danger" onClick={()=>{scanAbort.current=true;}}>✕ Stop</button>
                  : <button className="btn btn-primary" onClick={startScan}>⬡ Scan Now</button>}
              </div>
              <div style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'flex-end'}}>
                {([
                  ['Collectors',data?.totalOwners??liveOwners,'var(--accent)'],
                  ['Species',TOTAL_SPECIES,'var(--cyan)'],
                  ['Full Dex',completeCount,'var(--gold)'],
                ] as [string,number,string][]).map(([label,val,color])=>(
                  <div key={label} className="stat-card" style={{minWidth:80,textAlign:'right'}}>
                    <div style={{fontSize:18,fontWeight:800,color,fontFamily:'var(--ff-display)',lineHeight:1,marginBottom:3}}>
                      {val>0?<AnimatedNumber value={val}/>:'—'}
                    </div>
                    <div style={{fontSize:10,color:'var(--text2)',fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase'}}>{label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {data&&!scanning&&(
            <div style={{marginTop:12,fontSize:11,color:'var(--text2)',fontWeight:500,opacity:0.6}}>
              Last updated {new Date(data.updatedAt).toLocaleString()}
              {data.scannedBlock?` · Block #${data.scannedBlock.toLocaleString()}`:''}
              {' · '}Auto-updates hourly
            </div>
          )}
        </div>
      </header>

      {/* Scan progress */}
      {scanning&&(
        <div style={{position:'relative',zIndex:10,background:'rgba(12,16,24,0.95)',borderBottom:'1px solid var(--border)',
          padding:'14px 32px',backdropFilter:'blur(16px)',animation:'fadeIn 0.2s ease both'}}>
          <div style={{maxWidth:1400,margin:'0 auto'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <div className="glow-dot" style={{background:'var(--cyan)',boxShadow:'0 0 6px var(--cyan),0 0 12px var(--cyan)'}}/>
                <span style={{fontSize:12,fontWeight:700,color:'var(--bright)',letterSpacing:'0.08em',textTransform:'uppercase'}}>
                  {scanPhase||'Scanning...'}
                </span>
              </div>
              <span style={{fontSize:14,fontWeight:800,color:'var(--cyan)'}}>{scanPct}%</span>
            </div>
            <div className="pbar-wrap" style={{height:6,marginBottom:6}}>
              <div className="pbar-fill" style={{width:`${scanPct}%`,transition:'width 0.4s ease'}}/>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--text2)'}}>
              <span>{scanDetail}</span>
              {liveOwners>0&&<span style={{color:'var(--accent)'}}>{liveOwners.toLocaleString()} owners found</span>}
            </div>
          </div>
        </div>
      )}

      {/* Main */}
      <main style={{position:'relative',zIndex:1,padding:'32px',maxWidth:1400,margin:'0 auto'}}>

        {/* Podium */}
        {!loading&&!error&&sorted.length>=3&&(
          <section style={{marginBottom:36}}>
            <div className="section-label" style={{marginBottom:20}}>Champion Podium</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1.12fr 1fr',gap:12,alignItems:'end'}}>
              <PodiumCard entry={sorted[1]} rank={2} onClick={()=>setOpenRow(openRow===sorted[1].address?null:sorted[1].address)} isOpen={openRow===sorted[1].address}/>
              <PodiumCard entry={sorted[0]} rank={1} onClick={()=>setOpenRow(openRow===sorted[0].address?null:sorted[0].address)} isOpen={openRow===sorted[0].address}/>
              <PodiumCard entry={sorted[2]} rank={3} onClick={()=>setOpenRow(openRow===sorted[2].address?null:sorted[2].address)} isOpen={openRow===sorted[2].address}/>
            </div>
            {[sorted[0],sorted[1],sorted[2]].map(e=>openRow===e.address&&(
              <div key={e.address} style={{marginTop:10,borderRadius:12,overflow:'hidden',border:'1px solid rgba(79,127,255,0.2)'}}>
                <DetailPanel entry={e} registryImages={registryImages} registryData={registryData}/>
              </div>
            ))}
          </section>
        )}

        {/* Filter/sort controls */}
        {!loading&&!error&&sorted.length>0&&(
          <div style={{display:'flex',gap:6,marginBottom:16,flexWrap:'wrap',alignItems:'center'}}>
            <span style={{fontSize:11,color:'var(--text2)',fontWeight:700,marginRight:4,textTransform:'uppercase',letterSpacing:'0.08em'}}>Show:</span>
            {(['all','top10','top50'] as const).map(f=>(
              <button key={f} className={`btn btn-filter${filterMode===f?' active':''}`} onClick={()=>setFilterMode(f)}>
                {f==='all'?'All':f==='top10'?'Top 10':'Top 50'}
              </button>
            ))}
            <div style={{width:1,height:18,background:'var(--border)',margin:'0 8px'}}/>
            <span style={{fontSize:11,color:'var(--text2)',fontWeight:700,marginRight:4,textTransform:'uppercase',letterSpacing:'0.08em'}}>Sort:</span>
            {(['collected','tokens','pct'] as const).map(s=>(
              <button key={s} className={`btn btn-filter${sortKey===s?' active':''}`} onClick={()=>setSortKey(s)}>
                {s==='collected'?'Species':s==='tokens'?'Tokens':'% Done'}
              </button>
            ))}
            <div style={{marginLeft:'auto',fontSize:11,color:'var(--text2)',fontWeight:600}}>{sorted.length.toLocaleString()} collectors</div>
          </div>
        )}

        {/* Rankings */}
        <section style={{marginBottom:32}}>
          <div className="section-label" style={{marginBottom:16}}>Full Rankings</div>
          {loading?(
            <div style={{background:'var(--glass)',border:'1px solid var(--border)',borderRadius:16,overflow:'hidden',backdropFilter:'blur(12px)'}}>
              <table className="lb-table">
                <thead><tr>{['#','Wallet','Species','Progress','%','Tokens','Energies','Missing'].map(h=><th key={h}>{h}</th>)}</tr></thead>
                <tbody>{Array.from({length:8}).map((_,i)=><SkeletonRow key={i}/>)}</tbody>
              </table>
            </div>
          ):error?(
            <div style={{background:'var(--glass)',border:'1px solid var(--border)',borderRadius:16,padding:'60px 24px',
              textAlign:'center',backdropFilter:'blur(12px)'}}>
              <div style={{fontSize:48,marginBottom:20,opacity:0.1}}>◎</div>
              <div style={{fontSize:16,fontWeight:700,color:'var(--text2)',marginBottom:10}}>No leaderboard data yet</div>
              <div style={{fontSize:13,color:'var(--text2)',opacity:0.5,marginBottom:24}}>Data updates hourly.</div>
              <button className="btn btn-secondary" style={{opacity:0.5}} onClick={startScan}>⬡ Admin Scan</button>
            </div>
          ):(
            <div style={{background:'var(--glass)',border:'1px solid var(--border)',borderRadius:16,overflow:'hidden',backdropFilter:'blur(12px)',animation:'fadeUp 0.4s ease both'}}>
              <div style={{overflowX:'auto'}}>
                <table className="lb-table">
                  <thead><tr>{['#','Wallet','Species','Progress','%','Tokens','Energies','Missing'].map(h=><th key={h}>{h}</th>)}</tr></thead>
                  <tbody>
                    {sorted.map((entry,i)=>{
                      const pct=parseFloat(entry.progress);
                      const isOpen=openRow===entry.address;
                      const rankColor=i===0?'var(--gold)':i===1?'var(--silver)':i===2?'var(--bronze)':'var(--text2)';
                      const variantArr=['gold','silver','bronze'] as const;
                      const pbarVariant=i<3?variantArr[i]:'blue';
                      return [
                        <tr key={entry.address} className={`lb-row${isOpen?' open':''}`}
                          onClick={()=>setOpenRow(isOpen?null:entry.address)}
                          style={{animation:`fadeUp 0.3s ease ${Math.min(i*18,500)}ms both`}}>
                          <td style={{width:42,textAlign:'center'}}>
                            <span style={{fontSize:i<3?15:12,fontWeight:800,color:rankColor,textShadow:i<3?`0 0 12px ${rankColor}60`:'none'}}>{i+1}</span>
                          </td>
                          <td><AddressDisplay address={entry.address}/></td>
                          <td>
                            <span style={{fontSize:i<3?17:14,fontWeight:800,color:rankColor,fontFamily:'var(--ff-display)'}}>{entry.collected}</span>
                            <span style={{fontSize:10,color:'var(--text2)',marginLeft:4,fontWeight:500}}>/ {TOTAL_SPECIES}</span>
                          </td>
                          <td style={{minWidth:100}}><ProgressBar pct={pct} variant={pbarVariant} height={5}/></td>
                          <td><span style={{fontSize:12,fontWeight:700,color:pct>80?'var(--bright)':'var(--text)'}}>{entry.progress}</span></td>
                          <td><span style={{fontSize:12,color:'var(--text2)',fontWeight:500}}>{entry.totalTokensHeld}</span></td>
                          <td><EnergyGrid byEnergy={entry.byEnergy}/></td>
                          <td>
                            <span style={{fontSize:11,fontWeight:700,
                              color:entry.missing===0?'var(--green)':entry.missing<10?'var(--amber)':'var(--text2)',
                              background:entry.missing===0?'rgba(34,197,94,0.1)':entry.missing<10?'rgba(255,190,62,0.08)':'transparent',
                              border:`1px solid ${entry.missing===0?'rgba(34,197,94,0.3)':entry.missing<10?'rgba(255,190,62,0.2)':'var(--border)'}`,
                              borderRadius:6,padding:'3px 8px',whiteSpace:'nowrap'}}>
                              {entry.missing===0?'✓ Complete':`${entry.missing} left`}
                            </span>
                          </td>
                        </tr>,
                        isOpen&&<tr key={`${entry.address}-d`}>
                          <td colSpan={8} style={{padding:0}}>
                            <DetailPanel entry={entry} registryImages={registryImages} registryData={registryData}/>
                          </td>
                        </tr>,
                      ];
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {/* Footer */}
        <footer style={{paddingTop:24,borderTop:'1px solid var(--border)',display:'flex',
          justifyContent:'space-between',flexWrap:'wrap',gap:12,alignItems:'center'}}>
          <div style={{fontSize:11,color:'var(--text2)',opacity:0.5,lineHeight:1.8}}>
            CC0MASTERS · All data on-chain · Ethereum Mainnet<br/>
            <span style={{fontSize:10,color:'var(--dim)',fontFamily:'var(--ff-mono)'}}>{CC0_CONTRACT}</span>
          </div>
          <div style={{display:'flex',gap:16,alignItems:'center'}}>
            {[['OpenSea','https://opensea.io/collection/cc0mon'],
              ['Etherscan',`https://etherscan.io/address/${CC0_CONTRACT}`],
              ['CC0mon.com','https://cc0mon.com']].map(([l,h])=>(
              <a key={l} href={h} target="_blank" rel="noreferrer"
                style={{fontSize:11,fontWeight:700,color:'var(--text2)',textDecoration:'none',
                  textTransform:'uppercase',letterSpacing:'0.06em',transition:'color 0.15s'}}
                onMouseEnter={e=>(e.currentTarget as HTMLElement).style.color='var(--accent)'}
                onMouseLeave={e=>(e.currentTarget as HTMLElement).style.color='var(--text2)'}>
                {l} ↗
              </a>
            ))}
          </div>
        </footer>
      </main>
    </div>
  );
}
