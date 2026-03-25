'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { LeaderboardData, LeaderboardEntry, CollectorData } from '@/lib/types';

const TOTAL_SPECIES  = 260;
const TOTAL_TOKENS   = 9999;
const CC0_CONTRACT   = '0xeeb036dbbd3039429c430657ed9836568da79d5f';
const MULTICALL3     = '0xcA11bde05977b3631167028862bE2a173976CA11';
const ETH_RPC        = '/api/rpc';

const ENERGY_TYPES = ['Fire','Ice','Grass','Electric','Ghost','Dragon','Metal','Toxic','Rock','Bug','Ocean','Earth','Underworld','Mythic','Celestial','Fossil'];
const ENERGY_EMOJIS: Record<string,string> = { Fire:'🔥',Ice:'❄️',Grass:'🌿',Electric:'⚡',Ghost:'👻',Dragon:'🐉',Metal:'⚙️',Toxic:'☠️',Rock:'🪨',Bug:'🐛',Ocean:'🌊',Earth:'🌍',Underworld:'🌑',Mythic:'✨',Celestial:'☀️',Fossil:'🦴' };
const ENERGY_COLORS: Record<string,string> = { Fire:'#ff6030',Ice:'#80e8ff',Grass:'#a0ff60',Electric:'#ffe040',Ghost:'#c080ff',Dragon:'#6080ff',Metal:'#a0c8d0',Toxic:'#a0ff20',Rock:'#c0a860',Bug:'#80d040',Ocean:'#40b0ff',Earth:'#c09040',Underworld:'#8840c0',Mythic:'#ff80c0',Celestial:'#ffd880',Fossil:'#d0b888' };
const HERO_SPRITE_NUMBERS = ['1','5','12','23','34','45','56','67','78','89','100','111','122','133','144','155','166','177','188','199','210','221','232','243','254','8','19','30','41','52','63','74','85','96','107','118','129','140','151','162','173','184','195','206','217','228','239','250'];

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
function pad32(hex: string) { return hex.padStart(64,'0'); }
function pad32hex(hex: string) { return hex.padStart(64,'0'); }

let _toastSetter: ((url: string|null)=>void) | null = null;
function fireToast(url: string) { _toastSetter?.(url); }

const ensCache = new Map<string, string | null>();
async function resolveENS(address: string): Promise<string | null> {
  const key = address.toLowerCase();
  if (ensCache.has(key)) return ensCache.get(key)!;
  try {
    const res = await fetch(`https://api.ensideas.com/ens/resolve/${key}`, { signal: AbortSignal.timeout(4000) });
    const d = await res.json();
    ensCache.set(key, d.name || null);
    return d.name || null;
  } catch { ensCache.set(key, null); return null; }
}

function AddressDisplay({ address }: { address: string }) {
  const [ens, setEns] = useState<string | null>(ensCache.get(address.toLowerCase()) ?? null);
  useEffect(() => { if (ens !== null) return; resolveENS(address).then(setEns); }, [address, ens]);
  const display = ens ?? (address.slice(0,6) + '…' + address.slice(-4));
  return (
    <a href={`https://opensea.io/${address}`} target="_blank" rel="noreferrer"
      onClick={e=>{ e.preventDefault(); e.stopPropagation(); fireToast(`https://opensea.io/${address}`); }}
      title={address} className="address-link"
      style={{ color: ens ? 'var(--lime-bright)' : 'var(--text)', textShadow: ens ? '0 0 8px rgba(168,255,64,0.4)' : 'none' }}>
      {display}
    </a>
  );
}

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
        const offsetVal = parseInt(raw.slice(128+i*64, 192+i*64), 16);
        const rs = 128 + offsetVal*2;
        const success = parseInt(raw.slice(rs, rs+64), 16) !== 0;
        const bro = parseInt(raw.slice(rs+64, rs+128), 16)*2;
        const bs = rs + bro;
        const bl = parseInt(raw.slice(bs, bs+64), 16);
        results.push({ success, data: raw.slice(bs+64, bs+64+bl*2) });
      }
      return results;
    } catch { if (attempt < rpcRetries) await sleep(2000); }
  }
  return [];
}

function makeOwnerOfCall(id: number) { return { target:CC0_CONTRACT, callData:'0x6352211e'+pad32(id.toString(16)) }; }
function makeTokenURICall(id: number) { return { target:CC0_CONTRACT, callData:'0xc87b56dd'+pad32(id.toString(16)) }; }

function decodeAddress(hex: string): string | null {
  if (!hex || hex.length < 64) return null;
  const addr = '0x'+hex.slice(24,64);
  return addr === '0x0000000000000000000000000000000000000000' ? null : addr.toLowerCase();
}

function decodeTokenURI(hex: string): {speciesName:string;energy:string;image:string}|null {
  try {
    const sl = parseInt(hex.slice(64,128),16);
    const sh = hex.slice(128,128+sl*2);
    const str = decodeURIComponent(escape(String.fromCharCode(...Array.from({length:sh.length/2},(_,i)=>parseInt(sh.slice(i*2,i*2+2),16)))));
    const b64 = str.split(',')[1];
    const j = JSON.parse(atob(b64));
    const nameAttr = j.attributes?.find((a:{trait_type:string})=>a.trait_type==='Name')?.value ?? j.name ?? '';
    const speciesName = nameAttr.replace(/ #\d+$/, '').trim();
    if (!speciesName) return null;
    return { speciesName, energy: j.attributes?.find((a:{trait_type:string})=>a.trait_type==='Energy')?.value??'', image: j.image??'' };
  } catch { return null; }
}

async function runOnChainScan(
  setPhase:(s:string)=>void, setPct:(n:number)=>void, setDetail:(s:string)=>void,
  setLiveOwners:(n:number)=>void, abortRef:React.MutableRefObject<boolean>,
  registryData:Record<string,{name:string;energy:string}>,
  setImages:(fn:(prev:Record<string,{svg:string;png:string;name:string}>)=>Record<string,{svg:string;png:string;name:string}>)=>void
): Promise<{collectors:CollectorData[];speciesSupply:Record<number,number>}> {
  const BATCH=500, URI_BATCH=50;
  setPhase('PHASE 1/3 — READING OWNERS');
  const tokenOwners=new Map<number,string>(), ownerTokens=new Map<string,number[]>();
  for (let s=1; s<=TOTAL_TOKENS&&!abortRef.current; s+=BATCH) {
    const e=Math.min(s+BATCH-1,TOTAL_TOKENS), ids=Array.from({length:e-s+1},(_,i)=>s+i);
    const r=await multicallBatch(ids.map(makeOwnerOfCall));
    for (let i=0;i<r.length;i++) {
      if (!r[i].success) continue;
      const a=decodeAddress(r[i].data); if (!a) continue;
      tokenOwners.set(ids[i],a);
      if (!ownerTokens.has(a)) ownerTokens.set(a,[]);
      ownerTokens.get(a)!.push(ids[i]);
    }
    setPct(Math.round(e/TOTAL_TOKENS*30)); setLiveOwners(ownerTokens.size);
    setDetail(`Tokens ${s}–${e} · ${ownerTokens.size} holders`);
    await sleep(200);
  }
  setPhase('PHASE 2/3 — READING SPECIES DATA');
  const tokenSpecies=new Map<number,{speciesName:string;energy:string;image:string}>();
  for (let s=1; s<=TOTAL_TOKENS&&!abortRef.current; s+=URI_BATCH) {
    const e=Math.min(s+URI_BATCH-1,TOTAL_TOKENS), ids=Array.from({length:e-s+1},(_,i)=>s+i);
    const r=await multicallBatch(ids.map(makeTokenURICall),2);
    for (let i=0;i<r.length;i++) { if (!r[i].success) continue; const p=decodeTokenURI(r[i].data); if (p) tokenSpecies.set(ids[i],p); }
    setPct(30+Math.round((e/TOTAL_TOKENS)*50));
    setDetail(`Species data: tokens ${s}–${e} (${tokenSpecies.size} decoded)`);
    await sleep(100);
  }
  setPhase('PHASE 3/3 — BUILDING LEADERBOARD'); setPct(82); setDetail('Computing dex completion...');
  const nameToNum=new Map<string,number>();
  for (const [numStr,info] of Object.entries(registryData)) {
    if (!info.name) continue;
    nameToNum.set(info.name.toLowerCase(), parseInt(numStr));
    if (info.energy) nameToNum.set(`${info.name.toLowerCase()}|${info.energy.toLowerCase()}`, parseInt(numStr));
  }
  const onChainImages: Record<string,{svg:string;png:string;name:string}> = {};
  for (const [,sp] of tokenSpecies) {
    if (!sp.image) continue;
    const numStr = Object.keys(registryData).find(k =>
      registryData[k].name?.toLowerCase() === sp.speciesName.toLowerCase() &&
      (!registryData[k].energy || registryData[k].energy?.toLowerCase() === sp.energy.toLowerCase())
    ) ?? Object.keys(registryData).find(k => registryData[k].name?.toLowerCase() === sp.speciesName.toLowerCase());
    if (numStr && !onChainImages[numStr]) onChainImages[numStr] = { svg: sp.image, png: sp.image, name: sp.speciesName };
  }
  if (Object.keys(onChainImages).length > 0) setImages(prev => ({ ...prev, ...onChainImages }));
  const speciesEnergy=new Map<number,string>();
  for (const [,sp] of tokenSpecies) {
    const num=nameToNum.get(`${sp.speciesName.toLowerCase()}|${sp.energy.toLowerCase()}`) ?? nameToNum.get(sp.speciesName.toLowerCase());
    if (num&&!speciesEnergy.has(num)) speciesEnergy.set(num,sp.energy);
  }
  const allSpecies=Array.from({length:TOTAL_SPECIES},(_,i)=>i+1).map(n=>({
    number:String(n), name:registryData[String(n)]?.name??`Species #${n}`, energy:speciesEnergy.get(n)??registryData[String(n)]?.energy??'',
  }));
  const collectors:CollectorData[]=[];
  for (const [address,tokenIds] of ownerTokens) {
    const cs=new Set<number>();
    for (const tid of tokenIds) {
      const sp=tokenSpecies.get(tid); if (!sp) continue;
      const num = nameToNum.get(`${sp.speciesName.toLowerCase()}|${sp.energy.toLowerCase()}`) ?? nameToNum.get(sp.speciesName.toLowerCase());
      if (num) cs.add(num);
    }
    const byEnergy:Record<string,{collected:number;total:number}>={};
    for (const et of ENERGY_TYPES) byEnergy[et]={total:allSpecies.filter(s=>s.energy===et).length,collected:allSpecies.filter(s=>s.energy===et&&cs.has(parseInt(s.number))).length};
    const checklist=allSpecies.map(s=>({number:s.number,name:s.name,collected:cs.has(parseInt(s.number))}));
    collectors.push({address,collected:cs.size,missing:TOTAL_SPECIES-cs.size,progress:((cs.size/TOTAL_SPECIES)*100).toFixed(1)+'%',totalTokensHeld:tokenIds.length,byEnergy,checklist,collectedSpeciesNums:Array.from(cs)});
  }
  const speciesSupply: Record<number,number> = {};
  for (const [,sp] of tokenSpecies) {
    const num = nameToNum.get(`${sp.speciesName.toLowerCase()}|${sp.energy.toLowerCase()}`) ?? nameToNum.get(sp.speciesName.toLowerCase());
    if (num) speciesSupply[num] = (speciesSupply[num]||0) + 1;
  }
  return { collectors, speciesSupply };
}

/* ══ UI COMPONENTS ══ */

function AnimatedNumber({ value, duration=900 }: { value:number; duration?:number }) {
  const [n, setN] = useState(0);
  const prev = useRef(0);
  useEffect(()=>{
    const start=prev.current,end=value,t0=performance.now();
    const tick=(now:number)=>{ const p=Math.min((now-t0)/duration,1); const cur=Math.round(start+(end-start)*(1-Math.pow(1-p,3))); setN(cur); prev.current=cur; if(p<1)requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  },[value,duration]);
  return <>{n.toLocaleString()}</>;
}

function ProgressBar({ pct, variant='green', height=6 }: { pct:number; variant?:'green'|'gold'|'silver'|'bronze'; height?:number }) {
  const [w, setW] = useState(0);
  useEffect(()=>{ const t=setTimeout(()=>setW(pct),120); return()=>clearTimeout(t); },[pct]);
  return (
    <div className="pbar-wrap" style={{height}}>
      <div className={`pbar-fill${variant!=='green'?' '+variant:''}`} style={{width:`${Math.max(w,0.3)}%`}}/>
    </div>
  );
}

function EnergyDots({ byEnergy }: { byEnergy: LeaderboardEntry['byEnergy'] }) {
  return (
    <div style={{display:'flex',gap:2,flexWrap:'wrap',maxWidth:90}}>
      {ENERGY_TYPES.map(e=>{
        const info=byEnergy?.[e]; const lit=info&&info.collected>0; const col=ENERGY_COLORS[e];
        return <div key={e} title={`${e}: ${info?.collected??0}/${info?.total??0}`}
          style={{width:8,height:8,background:lit?col:'rgba(255,255,255,0.04)',border:`1px solid ${lit?col:'rgba(255,255,255,0.08)'}`,boxShadow:lit?`0 0 5px ${col}90`:'none',transition:'all 0.2s'}}/>;
      })}
    </div>
  );
}

function proxyUrl(src: string): string {
  if (!src || !src.startsWith('https://api.cc0mon.com/')) return src;
  return '/api/sprite?url=' + encodeURIComponent(src);
}
const loadedUrls = new Set<string>();

function Sprite({ src, name, size=56, dimmed=false, className='' }: { src:string; name:string; size?:number; dimmed?:boolean; className?:string }) {
  const proxied = proxyUrl(src);
  const [status, setStatus] = useState<'loading'|'ok'|'err'>(!src ? 'err' : loadedUrls.has(proxied) ? 'ok' : 'loading');
  if (!src) return (
    <div style={{width:size,height:size,display:'flex',alignItems:'center',justifyContent:'center',background:'var(--bg2)',border:'1px solid var(--border)',fontSize:size*0.3,color:'var(--text-dim)',opacity:dimmed?0.15:0.4,imageRendering:'pixelated'}}>?</div>
  );
  return (
    <div style={{width:size,height:size,position:'relative',imageRendering:'pixelated',flexShrink:0}}>
      {status==='loading'&&<div className="skeleton" style={{position:'absolute',inset:0}}/>}
      {status==='err'&&<div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:size*0.3,color:'var(--text-dim)',opacity:dimmed?0.15:0.4}}>?</div>}
      <img src={proxied} alt={name} width={size} height={size} loading="eager" decoding="async"
        onLoad={()=>{ loadedUrls.add(proxied); setStatus('ok'); }}
        onError={()=>setStatus('err')}
        style={{imageRendering:'pixelated',display:'block',opacity:status==='ok'?(dimmed?0.18:1):0,transition:'opacity 0.2s',filter:dimmed?'grayscale(1)':'none'}}
        className={className}
      />
    </div>
  );
}

/* ── Sprite Marquee ── */
function SpriteParade({ images }: { images: Record<string,{svg:string;png:string;name:string}> }) {
  const doubled = [...HERO_SPRITE_NUMBERS, ...HERO_SPRITE_NUMBERS];
  return (
    <div className="parade-wrap">
      <div className="parade-edge parade-edge-left"/>
      <div className="parade-edge parade-edge-right"/>
      <div className="sprite-parade">
        {doubled.map((num, i) => {
          const imgData = images[num];
          if (!imgData) return null;
          return (
            <div key={`${num}-${i}`} className="parade-item" title={imgData.name}>
              <Sprite src={imgData.png||imgData.svg} name={imgData.name} size={48}/>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Confirm Dialog ── */
function ConfirmDialog({ url, onOk, onNo }: { url: string; onOk:()=>void; onNo:()=>void }) {
  return (
    <div className="confirm-overlay" onClick={onNo}>
      <div className="confirm-box" onClick={e=>e.stopPropagation()}>
        <div style={{textAlign:'center',marginBottom:20}}>
          <div style={{fontSize:32,marginBottom:12}}>🌊</div>
          <div style={{fontFamily:'var(--ff-pixel)',fontSize:11,color:'var(--lime-bright)',letterSpacing:2,marginBottom:10}}>OPENING OPENSEA</div>
          <div style={{fontFamily:'var(--ff-mono)',fontSize:11,color:'var(--text)',wordBreak:'break-all',background:'var(--bg)',border:'1px solid var(--border)',padding:'8px 12px',lineHeight:1.5}}>{url}</div>
        </div>
        <div style={{display:'flex',gap:10}}>
          <button className="btn btn-primary" onClick={onOk} style={{flex:1,justifyContent:'center'}}>✓ GO</button>
          <button className="btn btn-danger" onClick={onNo} style={{flex:1,justifyContent:'center'}}>✕ CANCEL</button>
        </div>
      </div>
    </div>
  );
}

/* ── Podium Card ── */
function PodiumCard({ entry, rank, onClick, isOpen }: { entry:LeaderboardEntry; rank:1|2|3; onClick:()=>void; isOpen:boolean }) {
  const MEDALS  = {1:'🥇', 2:'🥈', 3:'🥉'};
  const COLORS  = {1:'var(--gold)', 2:'var(--silver)', 3:'var(--bronze)'};
  const LABELS  = {1:'CHAMPION', 2:'2ND PLACE', 3:'3RD PLACE'};
  const VARIANTS= {1:'gold' as const, 2:'silver' as const, 3:'bronze' as const};
  const col = COLORS[rank];
  const rawCol = {1:'#ffd040',2:'#c0d8d0',3:'#d88c50'}[rank];

  return (
    <div onClick={onClick} className={`podium-card rank-${rank}${isOpen?' open':''}`}>
      <div className="podium-glow" style={{background:`radial-gradient(ellipse at 50% 0%, ${rawCol}22 0%, transparent 70%)`}}/>
      <div className="podium-top-line" style={{background:`linear-gradient(90deg, transparent, ${rawCol}, transparent)`}}/>
      <div className="podium-inner">
        <div className="podium-rank-badge" style={{color:col}}>{LABELS[rank]}</div>
        <div className="podium-medal">{MEDALS[rank]}</div>
        <div className="podium-address-row">
          <AddressDisplay address={entry.address}/>
        </div>
        <div className="podium-score" style={{color:col}}>
          {entry.collected}<span className="podium-score-denom">/{TOTAL_SPECIES}</span>
        </div>
        <div className="podium-score-label">SPECIES COLLECTED</div>
        <ProgressBar pct={parseFloat(entry.progress)} variant={VARIANTS[rank]} height={rank===1?8:5}/>
        <div className="podium-meta">
          <span style={{color:col}}>{entry.progress}</span>
          <span style={{color:'var(--text-dim)'}}>·</span>
          <span style={{color:'var(--text-dim)'}}>{entry.totalTokensHeld} tokens</span>
        </div>
      </div>
    </div>
  );
}

/* ── Detail Panel ── */
function DetailPanel({
  entry, images, registryData, onNavigate,
}: {
  entry: LeaderboardEntry;
  images: Record<string,{svg:string;png:string;name:string}>;
  registryData: Record<string,{name:string;energy:string}>;
  onNavigate?: (speciesNum: number) => void;
}) {
  const [tab, setTab] = useState<'energy'|'dex'>('dex');
  const checklist = entry.checklist ?? (()=>{
    const collected = new Set(entry.collectedSpeciesNums??[]);
    return Array.from({length:TOTAL_SPECIES},(_,i)=>{
      const num=String(i+1);
      const rname = registryData[num]?.name || images[num]?.name;
      return {number:num, name:rname&&rname.length>0?rname:`#${num}`, collected:collected.has(i+1)};
    });
  })();

  return (
    <div className="detail-panel">
      <div className="detail-stats">
        {([
          ['COLLECTED', String(entry.collected), 'var(--lime)'],
          ['MISSING',   String(entry.missing),   entry.missing===0 ? 'var(--lime-bright)' : 'var(--text)'],
          ['PROGRESS',  entry.progress,           'var(--lime-bright)'],
          ['TOKENS',    String(entry.totalTokensHeld), 'var(--amber)'],
        ] as [string,string,string][]).map(([l,v,c])=>(
          <div key={l} className="detail-stat-tile">
            <div className="detail-stat-top-line" style={{background:`linear-gradient(90deg,transparent,${c}50,transparent)`}}/>
            <div className="detail-stat-value" style={{color:c}}>{v}</div>
            <div className="detail-stat-label">{l}</div>
          </div>
        ))}
        <a href={`https://opensea.io/${entry.address}`} target="_blank" rel="noreferrer"
          onClick={e=>{ e.preventDefault(); fireToast(`https://opensea.io/${entry.address}`); }}
          className="detail-opensea-tile">
          <span style={{fontSize:22}}>🌊</span>
          <span>OPENSEA ▸</span>
        </a>
      </div>
      <div className="detail-tabs">
        <button className={`tab-btn${tab==='energy'?' active':''}`} onClick={()=>setTab('energy')}>⚡ ENERGY</button>
        <button className={`tab-btn${tab==='dex'?' active':''}`} onClick={()=>setTab('dex')}>
          🔲 DEX ({entry.collected}/{TOTAL_SPECIES})
        </button>
      </div>
      {tab==='energy'&&(
        <div className="energy-grid">
          {ENERGY_TYPES.map((et,i)=>{
            const info=entry.byEnergy?.[et]??{collected:0,total:0};
            const pct=info.total?info.collected/info.total*100:0;
            const col=ENERGY_COLORS[et];
            return (
              <div key={et} className="energy-tile" style={{borderColor:`${col}20`,animationDelay:`${i*15}ms`}}>
                <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:4}}>
                  <span style={{fontSize:14}}>{ENERGY_EMOJIS[et]}</span>
                  <span style={{fontFamily:'var(--ff-pixel)',fontSize:9,color:col,letterSpacing:1}}>{et.toUpperCase()}</span>
                </div>
                <div style={{fontFamily:'var(--ff-pixel)',fontSize:15,color:col,marginBottom:5,lineHeight:1}}>
                  {info.collected}<span style={{fontSize:10,color:'var(--text-dim)'}}>/{info.total}</span>
                </div>
                <div className="pbar-wrap" style={{height:3}}>
                  <div className="pbar-fill" style={{width:`${pct}%`,background:`linear-gradient(90deg,${col}50,${col})`,boxShadow:`0 0 4px ${col}80`}}/>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {tab==='dex'&&(
        <div className="dex-grid">
          {checklist.map((sp)=>{
            const imgData = images[sp.number];
            const src = imgData?.png || imgData?.svg || '';
            return (
              <div key={sp.number} className={`species-cell${sp.collected?' collected':''}`}
                title={`#${sp.number} ${sp.name}`}
                onClick={e=>{e.stopPropagation();onNavigate?.(parseInt(sp.number));}}>
                {sp.collected&&<div className="species-check">✓</div>}
                <Sprite src={src} name={sp.name} size={50} dimmed={!sp.collected}/>
                <div className="species-cell-name">
                  {sp.name&&!sp.name.startsWith('#')?sp.name:`#${sp.number}`}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function useMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(()=>{
    const mq = window.matchMedia('(max-width: 640px)');
    setMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  },[]);
  return mobile;
}

/* ══ MAIN PAGE ══ */
export default function CC0Masters() {
  const mobile = useMobile();
  const router = useRouter();
  const [confirm, setConfirm] = useState<string|null>(null);
  const [registryData, setRegistryData] = useState<Record<string,{name:string;energy:string}>>({});
  const [images, setImages] = useState<Record<string,{svg:string;png:string;name:string}>>({});
  const [leaderboard, setLeaderboard] = useState<LeaderboardData|null>(null);
  const [sort, setSort] = useState<{by:keyof LeaderboardEntry;asc:boolean}>({by:'collected',asc:false});
  const [filter, setFilter] = useState('');
  const [openRow, setOpenRow] = useState<string|null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanPhase, setScanPhase] = useState('');
  const [scanPct, setScanPct] = useState(0);
  const [scanDetail, setScanDetail] = useState('');
  const [liveOwners, setLiveOwners] = useState(0);
  const abortScanRef = useRef(false);

  useEffect(()=>{ _toastSetter = setConfirm; return()=>{ _toastSetter=null; }; },[]);

  const loadData = useCallback(async (forceFresh = false) => {
    try {
      const res = await fetch(`/api/leaderboard${forceFresh?'?fresh=true':''}`);
      if (!res.ok) throw new Error('fetch failed');
      const data: LeaderboardData & { images?: Record<string,{svg:string;png:string;name:string}>; registry?: Record<string,{name:string;energy:string}> } = await res.json();
      setLeaderboard(data);
      if (data.images) setImages(data.images);
      if (data.registry) setRegistryData(data.registry);
    } catch (e) { console.error('Failed to load leaderboard', e); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleScan = useCallback(async () => {
    if (scanning) { abortScanRef.current = true; setScanning(false); return; }
    setScanning(true); abortScanRef.current = false;
    setScanPhase('PREPARING'); setScanPct(0); setScanDetail(''); setLiveOwners(0);
    let reg = registryData;
    if (!reg || Object.keys(reg).length === 0) {
      try { const res = await fetch('/api/registry'); reg = await res.json(); setRegistryData(reg); }
      catch { setScanPhase('ERROR'); setScanDetail('Could not load species registry.'); setScanning(false); return; }
    }
    const { collectors, speciesSupply } = await runOnChainScan(setScanPhase, setScanPct, setScanDetail, setLiveOwners, abortScanRef, reg, setImages);
    if (abortScanRef.current) { setScanPhase('ABORTED'); }
    else {
      setScanPhase('SAVING RESULTS');
      try {
        await fetch('/api/save', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ collectors, speciesSupply, images }) });
        setScanPhase('COMPLETE'); await loadData(true);
      } catch { setScanPhase('ERROR'); setScanDetail('Failed to save data to server.'); }
    }
    setScanning(false);
  }, [scanning, registryData, loadData, images]);

  const sortedAndFiltered = useMemo(() => {
    if (!leaderboard?.leaders) return [];
    return [...leaderboard.leaders]
      .filter((e: LeaderboardEntry) =>
        e.address.toLowerCase().includes(filter.toLowerCase()) ||
        (ensCache.get(e.address.toLowerCase())||'').toLowerCase().includes(filter.toLowerCase())
      )
      .sort((a: LeaderboardEntry, b: LeaderboardEntry) => {
        const vA = a[sort.by], vB = b[sort.by];
        if (typeof vA === 'number' && typeof vB === 'number') return sort.asc ? vA - vB : vB - vA;
        if (typeof vA === 'string' && typeof vB === 'string') return sort.asc ? vA.localeCompare(vB) : vB.localeCompare(vA);
        return 0;
      });
  }, [leaderboard, sort, filter]);

  const podium    = useMemo(() => sortedAndFiltered.slice(0,3), [sortedAndFiltered]);
  const tableRows = useMemo(() => sortedAndFiltered.slice(mobile ? 0 : 3), [sortedAndFiltered, mobile]);

  const handleSort = (by: keyof LeaderboardEntry) =>
    setSort(prev => ({ by, asc: prev.by===by ? !prev.asc : false }));

  const handleRowClick = (address: string) =>
    setOpenRow(prev => prev===address ? null : address);

  if (!leaderboard) {
    return (
      <main style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center'}}>
        <div className="loading-screen">
          <div className="loading-logo">CC0-MASTERS</div>
          <div className="loading-bar-wrap"><div className="loading-bar-fill"/></div>
          <div className="loading-label">LOADING LEADERBOARD...</div>
        </div>
      </main>
    );
  }

  const updatedAt = leaderboard.updatedAt ? new Date(leaderboard.updatedAt).toLocaleString() : null;

  return (
    <main className="main-container">

      {/* HEADER */}
      <header className="site-header">
        <div className="site-header-inner">
          <div className="site-title-block">
            <h1 className="site-title">CC0<span style={{color:'var(--lime)'}}>-</span>MASTERS</h1>
            <p className="site-subtitle">The ultimate Pokédex leaderboard for cc0mon collectors</p>
          </div>
          <nav className="site-nav">
            {updatedAt && (
              <span className="updated-badge">
                <span className="live-dot"/>
                {updatedAt}
              </span>
            )}
            <button className="btn" onClick={()=>router.push('/library')}>📚 LIBRARY</button>
          </nav>
        </div>
      </header>

      {/* SPRITE PARADE */}
      <SpriteParade images={images}/>

      {/* PODIUM */}
      {podium.length > 0 && (
        <section className="podium-section">
          <div className="section-heading">
            <span className="section-heading-accent">▶</span> TOP COLLECTORS
          </div>
          <div className="podium-grid">
            {podium[1] && (
              <div className="podium-slot podium-slot-2">
                <PodiumCard entry={podium[1]} rank={2} onClick={()=>handleRowClick(podium[1].address)} isOpen={openRow===podium[1].address}/>
                <div className="podium-pedestal podium-pedestal-2"/>
              </div>
            )}
            {podium[0] && (
              <div className="podium-slot podium-slot-1">
                <PodiumCard entry={podium[0]} rank={1} onClick={()=>handleRowClick(podium[0].address)} isOpen={openRow===podium[0].address}/>
                <div className="podium-pedestal podium-pedestal-1"/>
              </div>
            )}
            {podium[2] && (
              <div className="podium-slot podium-slot-3">
                <PodiumCard entry={podium[2]} rank={3} onClick={()=>handleRowClick(podium[2].address)} isOpen={openRow===podium[2].address}/>
                <div className="podium-pedestal podium-pedestal-3"/>
              </div>
            )}
          </div>
          {podium.map(entry => openRow===entry.address && (
            <div key={entry.address} className="podium-detail-wrap">
              <DetailPanel entry={entry} images={images} registryData={registryData}
                onNavigate={num=>router.push(`/library?species=${num}`)}/>
            </div>
          ))}
        </section>
      )}

      {/* LEADERBOARD TABLE */}
      <section className="table-section">
        <div className="table-toolbar">
          <div className="section-heading" style={{margin:0}}>
            <span className="section-heading-accent">▶</span> FULL LEADERBOARD
            <span className="table-count">{sortedAndFiltered.length} collectors</span>
          </div>
          <input className="filter-input" type="text" placeholder="Filter by address or ENS…"
            value={filter} onChange={e=>setFilter(e.target.value)}/>
        </div>
        <div className="table-scroll-wrap">
          <table className="lb-table">
            <thead>
              <tr>
                <th className="th-rank">#</th>
                <th className="th-sortable" onClick={()=>handleSort('address')}>Collector</th>
                <th className="th-sortable" onClick={()=>handleSort('collected')}>
                  Collected {sort.by==='collected'&&(sort.asc?'↑':'↓')}
                </th>
                {!mobile && <th>Progress</th>}
                <th className="th-sortable" onClick={()=>handleSort('totalTokensHeld')}>
                  Tokens {sort.by==='totalTokensHeld'&&(sort.asc?'↑':'↓')}
                </th>
                {!mobile && <th>Energy</th>}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((entry: LeaderboardEntry) => (
                <>
                  <tr key={entry.address}
                    className={`lb-row${openRow===entry.address?' open':''}`}
                    onClick={()=>handleRowClick(entry.address)}>
                    <td className="td-rank">
                      <span className="rank-num">{sortedAndFiltered.indexOf(entry)+1}</span>
                    </td>
                    <td className="td-address"><AddressDisplay address={entry.address}/></td>
                    <td className="td-collected">
                      <span className="collected-num">{entry.collected}</span>
                      <span className="collected-denom">/{TOTAL_SPECIES}</span>
                    </td>
                    {!mobile && (
                      <td className="td-progress" style={{minWidth:120}}>
                        <ProgressBar pct={parseFloat(entry.progress)} height={5}/>
                        <span className="progress-pct">{entry.progress}</span>
                      </td>
                    )}
                    <td className="td-tokens">{entry.totalTokensHeld}</td>
                    {!mobile && <td className="td-energy"><EnergyDots byEnergy={entry.byEnergy}/></td>}
                  </tr>
                  {openRow===entry.address && (
                    <tr key={`${entry.address}-detail`}>
                      <td colSpan={mobile ? 4 : 6} style={{padding:0}}>
                        <DetailPanel entry={entry} images={images} registryData={registryData}
                          onNavigate={num=>router.push(`/library?species=${num}`)}/>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {confirm && (
        <ConfirmDialog url={confirm}
          onOk={()=>{ window.open(confirm,'_blank'); setConfirm(null); }}
          onNo={()=>setConfirm(null)}/>
      )}
    </main>
  );
}
