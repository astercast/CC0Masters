'use client';

import { useEffect, useState, useCallback, useRef, Fragment } from 'react';
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

// Decorative sprite IDs scattered around the page — use token IDs from registry
const HERO_SPRITE_NUMBERS = ['1','5','12','23','34','45','56','67','78','89','100','111','122','133','144','155','166','177','188','199','210','221','232','243','254','8','19','30','41','52','63','74','85','96','107','118','129','140','151','162','173','184','195','206','217','228','239','250'];

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }
function pad32(hex: string) { return hex.padStart(64,'0'); }
function pad32hex(hex: string) { return hex.padStart(64,'0'); }

/* ── Module-level toast ── fires from any component without prop drilling ── */
let _toastSetter: ((url: string|null)=>void) | null = null;
function fireToast(url: string) {
  _toastSetter?.(url);
}

/* ── ENS cache ── */
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
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    fireToast(`https://opensea.io/${address}`);
  };
  return (
    <a href={`https://opensea.io/${address}`} target="_blank" rel="noreferrer"
      onClick={handleClick} title={address}
      style={{ fontFamily:'var(--ff-mono)', fontSize:16,
        color: ens ? 'var(--bright)' : 'var(--text)',
        textDecoration:'none',
        textShadow: ens ? '0 0 8px rgba(168,255,64,0.4)' : 'none',
        transition:'color 0.1s' }}
      onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.color='var(--glow)';}}
      onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.color=ens?'var(--bright)':'var(--text)';}}>
      {display}
    </a>
  );
}

/* ══ MULTICALL ENGINE (unchanged — working) ══ */
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
    // Name attr is like "Vilewing #086" — strip the serial number to get species name
    const nameAttr = j.attributes?.find((a:{trait_type:string})=>a.trait_type==='Name')?.value ?? j.name ?? '';
    const speciesName = nameAttr.replace(/ #\d+$/, '').trim();
    if (!speciesName) return null;
    return {
      speciesName,
      energy: j.attributes?.find((a:{trait_type:string})=>a.trait_type==='Energy')?.value??'',
      image: j.image??'',
    };
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
  // Build name->speciesNum map from registry (the #NNN in token names is a serial, NOT species number)
  // Build name->num map. Some species share names (e.g. "Vilewing" is #86 AND #229,
  // "Gazebleed" is #215 AND #228). Use "name|energy" as primary key to disambiguate,
  // and plain name as fallback for when energy isn't available.
  const nameToNum=new Map<string,number>();
  for (const [numStr,info] of Object.entries(registryData)) {
    if (!info.name) continue;
    const n = parseInt(numStr);
    nameToNum.set(info.name.toLowerCase(), n); // plain name (last one wins for dupes)
    if (info.energy) nameToNum.set(`${info.name.toLowerCase()}|${info.energy.toLowerCase()}`, n);
  }
  // Cache on-chain images (data URIs from tokenURI) — avoids external image requests entirely
  const onChainImages: Record<string,{svg:string;png:string;name:string}> = {};
  for (const [,sp] of tokenSpecies) {
    if (!sp.image) continue;
    const numStr = Object.keys(registryData).find(k => 
      registryData[k].name?.toLowerCase() === sp.speciesName.toLowerCase() &&
      (!registryData[k].energy || registryData[k].energy?.toLowerCase() === sp.energy.toLowerCase())
    ) ?? Object.keys(registryData).find(k => registryData[k].name?.toLowerCase() === sp.speciesName.toLowerCase());
    if (numStr && !onChainImages[numStr]) {
      onChainImages[numStr] = { svg: sp.image, png: sp.image, name: sp.speciesName };
    }
  }
  if (Object.keys(onChainImages).length > 0) {
    setImages(prev => ({ ...prev, ...onChainImages }));
  }
  // Build energy map from decoded token data
  const speciesEnergy=new Map<number,string>();
  for (const [,sp] of tokenSpecies) {
    const energyKey2 = `${sp.speciesName.toLowerCase()}|${sp.energy.toLowerCase()}`;
    const num=nameToNum.get(energyKey2) ?? nameToNum.get(sp.speciesName.toLowerCase());
    if (num&&!speciesEnergy.has(num)) speciesEnergy.set(num,sp.energy);
  }
  const allSpecies=Array.from({length:TOTAL_SPECIES},(_,i)=>i+1).map(n=>({
    number:String(n),
    name:registryData[String(n)]?.name??`Species #${n}`,
    energy:speciesEnergy.get(n)??registryData[String(n)]?.energy??'',
  }));
  const collectors:CollectorData[]=[];
  for (const [address,tokenIds] of ownerTokens) {
    const cs=new Set<number>();
    for (const tid of tokenIds) {
      const sp=tokenSpecies.get(tid);
      if (!sp) continue;
      const energyKey = `${sp.speciesName.toLowerCase()}|${sp.energy.toLowerCase()}`;
      const num = nameToNum.get(energyKey) ?? nameToNum.get(sp.speciesName.toLowerCase());
      if (num) cs.add(num);
    }
    const byEnergy:Record<string,{collected:number;total:number}>={};
    for (const et of ENERGY_TYPES) byEnergy[et]={total:allSpecies.filter(s=>s.energy===et).length,collected:allSpecies.filter(s=>s.energy===et&&cs.has(parseInt(s.number))).length};
    const checklist=allSpecies.map(s=>({number:s.number,name:s.name,collected:cs.has(parseInt(s.number))}));
    const collected=cs.size;
    collectors.push({address,collected,missing:TOTAL_SPECIES-collected,progress:((collected/TOTAL_SPECIES)*100).toFixed(1)+'%',totalTokensHeld:tokenIds.length,byEnergy,checklist,collectedSpeciesNums:Array.from(cs)});
  }
  // Compute real supply per species from the full tokenSpecies scan
  const speciesSupply: Record<number,number> = {};
  for (const [,sp] of tokenSpecies) {
    const energyKey = `${sp.speciesName.toLowerCase()}|${sp.energy.toLowerCase()}`;
    const num = nameToNum.get(energyKey) ?? nameToNum.get(sp.speciesName.toLowerCase());
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

function ProgressBar({ pct, variant='green', height=5 }: { pct:number; variant?:'green'|'gold'|'silver'|'bronze'; height?:number }) {
  const [w, setW] = useState(0);
  useEffect(()=>{ const t=setTimeout(()=>setW(pct),100); return()=>clearTimeout(t); },[pct]);
  return (
    <div className="pbar-wrap" style={{height}}>
      <div className={`pbar-fill${variant!=='green'?' '+variant:''}`} style={{width:`${Math.max(w,0.3)}%`}}/>
    </div>
  );
}

function EnergyDots({ byEnergy }: { byEnergy: LeaderboardEntry['byEnergy'] }) {
  return <div style={{display:'flex',gap:2,flexWrap:'wrap',maxWidth:80}}>
    {ENERGY_TYPES.map(e=>{
      const info=byEnergy?.[e]; const lit=info&&info.collected>0; const col=ENERGY_COLORS[e];
      return <div key={e} title={`${e}: ${info?.collected??0}/${info?.total??0}`}
        style={{width:7,height:7,background:lit?col:'var(--bg2)',
          border:`1px solid ${lit?col:'var(--border)'}`,
          boxShadow:lit?`0 0 4px ${col}80`:'none',transition:'all 0.2s'}}/>;
    })}
  </div>;
}

/* Proxy CC0mon images through our CDN cache for persistent caching across refreshes */
function proxyUrl(src: string): string {
  if (!src || !src.startsWith('https://api.cc0mon.com/')) return src;
  return '/api/sprite?url=' + encodeURIComponent(src);
}

/* Session-level cache — survives React remounts within a page session */
const loadedUrls = new Set<string>();

function Sprite({ src, name, size=56, dimmed=false, className='' }: { src:string; name:string; size?:number; dimmed?:boolean; className?:string }) {
  // If we've already loaded this URL this session, start as 'ok' immediately — no shimmer
  const proxied = proxyUrl(src);
  const [status, setStatus] = useState<'loading'|'ok'|'err'>(
    !src ? 'err' : loadedUrls.has(proxied) ? 'ok' : 'loading'
  );

  if (!src) return (
    <div style={{width:size,height:size,display:'flex',alignItems:'center',justifyContent:'center',
      background:'var(--bg2)',border:'1px solid var(--border)',fontSize:size*0.3,
      color:'var(--text3)',opacity:dimmed?0.15:0.4,imageRendering:'pixelated'}}>?</div>
  );

  return (
    <div style={{width:size,height:size,position:'relative',imageRendering:'pixelated',flexShrink:0}}>
      {status==='loading'&&<div className="skeleton" style={{position:'absolute',inset:0}}/>}
      {status==='err'&&<div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',
        justifyContent:'center',fontSize:size*0.3,color:'var(--text3)',opacity:dimmed?0.15:0.4}}>?</div>}
      <img src={proxied} alt={name} width={size} height={size}
        loading="eager" decoding="async"
        onLoad={()=>{ loadedUrls.add(proxied); setStatus('ok'); }}
        onError={()=>setStatus('err')}
        style={{imageRendering:'pixelated',display:'block',
          opacity:status==='ok'?(dimmed?0.18:1):0,
          transition:'opacity 0.15s',
          filter:dimmed?'grayscale(1)':'none'}}
        className={className}
      />
    </div>
  );
}

/* Sprite Parade hero section */
function SpriteParade({ images }: { images: Record<string,{svg:string;png:string;name:string}> }) {
  const nums = HERO_SPRITE_NUMBERS;
  const doubled = [...nums, ...nums]; // seamless loop

  return (
    <div style={{overflow:'hidden',padding:'14px 0',borderTop:'1px solid var(--border)',borderBottom:'1px solid var(--border)',background:'linear-gradient(180deg,var(--bg2),var(--bg3))',position:'relative',boxShadow:'inset 0 1px 0 var(--green0),inset 0 -1px 0 var(--green0)'}}>
      {/* fade edges */}
      <div style={{position:'absolute',left:0,top:0,bottom:0,width:80,background:'linear-gradient(90deg,var(--bg2),transparent)',zIndex:2,pointerEvents:'none'}}/>
      <div style={{position:'absolute',right:0,top:0,bottom:0,width:80,background:'linear-gradient(-90deg,var(--bg2),transparent)',zIndex:2,pointerEvents:'none'}}/>
      <div className="sprite-parade">
        {doubled.map((num, i) => {
          const imgData = images[num];
          if (!imgData) return null;
          return (
            <div key={`${num}-${i}`} className="parade-sprite" title={imgData.name}
              style={{flexShrink:0,width:48,height:48,position:'relative'}}>
              <Sprite src={imgData.png||imgData.svg} name={imgData.name} size={48}/>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── SVG Medal Icons ── */
function MedalIcon({ rank, size=48 }: { rank:1|2|3; size?:number }) {
  const colors = {
    1: { main:'#ffd040', dark:'#c8a020', light:'#fff4b0', rim:'#e8b830', ribbon1:'#ff4444', ribbon2:'#cc2222' },
    2: { main:'#c0d8cc', dark:'#8aa098', light:'#e8f4ec', rim:'#a0c0b0', ribbon1:'#4488ff', ribbon2:'#2266cc' },
    3: { main:'#d48840', dark:'#a06020', light:'#f0c080', rim:'#c07030', ribbon1:'#44aa44', ribbon2:'#228822' },
  };
  const c = colors[rank];
  const numStr = rank === 1 ? '1' : rank === 2 ? '2' : '3';
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" style={{display:'block'}}>
      {/* Ribbon tails */}
      <path d="M22 38L16 58L24 52L28 60L30 42Z" fill={c.ribbon1} opacity="0.9"/>
      <path d="M42 38L48 58L40 52L36 60L34 42Z" fill={c.ribbon2} opacity="0.9"/>
      {/* Medal body - outer rim */}
      <circle cx="32" cy="28" r="22" fill={c.dark}/>
      {/* Medal body - main */}
      <circle cx="32" cy="28" r="19" fill={c.main}/>
      {/* Inner ring */}
      <circle cx="32" cy="28" r="15" fill="none" stroke={c.dark} strokeWidth="1.5" opacity="0.5"/>
      {/* Highlight */}
      <ellipse cx="28" cy="22" rx="8" ry="6" fill={c.light} opacity="0.35"/>
      {/* Number */}
      <text x="32" y="34" textAnchor="middle" fontFamily="var(--ff-pixel)" fontSize="18" fontWeight="bold" fill={c.dark}>{numStr}</text>
      {/* Star accent */}
      {rank===1 && <path d="M32 10L34 16L40 16L35 20L37 26L32 22L27 26L29 20L24 16L30 16Z" fill={c.light} opacity="0.3"/>}
    </svg>
  );
}

function PodiumCard({ entry, rank, onClick, isOpen, mobile=false }: { entry:LeaderboardEntry; rank:1|2|3; onClick:()=>void; isOpen:boolean; mobile?:boolean }) {
  const COLORS = {1:'var(--gold)',2:'var(--silver)',3:'var(--bronze)'};
  const LABELS = {1:'CHAMPION',2:'2ND PLACE',3:'3RD PLACE'};
  const pct = parseFloat(entry.progress);

  return (
    <div onClick={onClick}
      onPointerDown={e=>{ if (e.pointerType !== 'mouse') pulseHaptics(10); }}
      className={`podium-card rank-${rank}${isOpen?' open':''}`}
      style={{animation:`fadeUp 0.5s ease ${rank===1?100:rank===2?0:200}ms both`}}>
      <div className="podium-shell" />
      <div className="podium-noise" />
      <div className="podium-halo" />

      <div className="podium-content" style={{position:'relative',zIndex:2,padding:mobile?'10px':'16px'}}>
        <div className="podium-topline">
          <span className="podium-rank-chip" style={{color:COLORS[rank],borderColor:`${COLORS[rank]}55`}}>{LABELS[rank]}</span>
        </div>

        <div className="podium-medal-wrap">
          <div className="podium-medal-ring" style={{borderColor:`${COLORS[rank]}33`}} />
          <MedalIcon rank={rank} size={mobile?(rank===1?34:28):(rank===1?56:44)}/>
        </div>

        <div className="podium-identity">
          <div className="podium-address-wrap">
            {!mobile ? <AddressDisplay address={entry.address}/> : `${entry.address.slice(0,6)}…${entry.address.slice(-4)}`}
          </div>
        </div>

        <div className="podium-metric-band">
          <div className="podium-main-stat">
            <span className="podium-main-value" style={{color:COLORS[rank],fontSize:mobile?(rank===1?20:17):(rank===1?40:30)}}>{entry.collected}</span>
            <span className="podium-main-total">/{TOTAL_SPECIES}</span>
          </div>
          <div className="podium-main-label">MASTER SET PROGRESS</div>
        </div>

        <div className="podium-progress-wrap">
          <div className="podium-progress-track">
            <div className={`podium-progress-fill rank-${rank}`} style={{width:`${pct}%`}} />
          </div>
          <div className="podium-progress-meta">
            <span className="podium-progress-pct" style={{color:COLORS[rank]}}>{entry.progress}</span>
            <span className="podium-progress-tokens">{entry.totalTokensHeld.toLocaleString()} TOKENS</span>
          </div>
        </div>

        <div className="podium-footerline">
          <span className="podium-footer-stat">{entry.missing === 0 ? 'COMPLETE SET' : `NEEDS ${entry.missing}`}</span>
          <span className="podium-footer-divider" />
          <span className="podium-footer-stat">CLICK TO INSPECT</span>
        </div>
      </div>
    </div>
  );
}

function SkeletonRow({ mobile }: { mobile: boolean }) {
  if (mobile) {
    return <div style={{borderBottom:'1px solid var(--border)',padding:12,display:'flex',gap:8}}>
      {[28,120,48,36,48].map((w,i)=><div key={i} className="skeleton" style={{height:8,width:w}}/>)}
    </div>;
  }
  return <div className="grid-row grid-skel">
    {[20,100,200,40,80,50].map((w,i)=><div key={i}><div className="skeleton" style={{height:8,width:w}}/></div>)}
  </div>;
}

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
      // Use registryData first, fall back to images (same source, loaded together)
      const rname = registryData[num]?.name || images[num]?.name;
      return {number:num, name:rname&&rname.length>0?rname:`#${num}`, collected:collected.has(i+1)};
    });
  })();

  return (
    <div className="detail-panel">
      {/* stat row */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(90px,1fr))',gap:6,marginBottom:16}}>
        {([
          ['COLLECTED',String(entry.collected),'var(--lime)'],
          ['MISSING',String(entry.missing),entry.missing===0?'var(--bright)':'var(--text2)'],
          ['PROGRESS',entry.progress,'var(--bright)'],
          ['TOKENS',String(entry.totalTokensHeld),'var(--amber)'],
        ] as [string,string,string][]).map(([l,v,c])=>(
          <div key={l} style={{background:'var(--bg2)',border:'1px solid var(--border)',padding:'10px 12px',position:'relative',overflow:'hidden'}}>
            <div style={{position:'absolute',top:0,left:0,right:0,height:1,background:`linear-gradient(90deg,transparent,${c}60,transparent)`}}/>
            <div style={{fontFamily:'var(--ff-pixel)',fontSize:18,color:c,marginBottom:3,lineHeight:1}}>{v}</div>
            <div style={{fontFamily:'var(--ff-pixel)',fontSize:11,color:'var(--text2)',letterSpacing:1}}>{l}</div>
          </div>
        ))}
        <a href={`https://opensea.io/${entry.address}`} target="_blank" rel="noreferrer"
          onClick={e=>{ e.preventDefault(); fireToast(`https://opensea.io/${entry.address}`); }}
          style={{background:'var(--bg2)',border:'1px solid var(--border)',padding:'10px 12px',textDecoration:'none',
            display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',
            color:'var(--text2)',fontSize:14,fontFamily:'var(--ff-pixel)',letterSpacing:1,gap:4,transition:'all 0.1s'}}
          onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor='var(--lime)';(e.currentTarget as HTMLElement).style.color='var(--lime)';}}
          onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor='var(--border)';(e.currentTarget as HTMLElement).style.color='var(--text2)';}}>
          <span style={{fontSize:20}}>🌊</span>OPENSEA ▸
        </a>
      </div>

      {/* tabs */}
      <div style={{borderBottom:'2px solid var(--green1)',marginBottom:14,display:'flex',gap:0}}>
        <button className={`tab-btn${tab==='energy'?' active':''}`} onClick={()=>setTab('energy')}>⚡ ENERGY</button>
        <button className={`tab-btn${tab==='dex'?' active':''}`} onClick={()=>setTab('dex')}>
          🔲 DEX ({entry.collected}/{TOTAL_SPECIES})
        </button>
      </div>

      {/* energy tab */}
      {tab==='energy'&&(
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(95px,1fr))',gap:6}}>
          {ENERGY_TYPES.map((et,i)=>{
            const info=entry.byEnergy?.[et]??{collected:0,total:0};
            const pct=info.total?info.collected/info.total*100:0;
            const col=ENERGY_COLORS[et];
            return (
              <div key={et} style={{background:'var(--bg2)',border:`1px solid ${col}20`,padding:'8px',
                animation:`fadeUp 0.3s ease ${i*18}ms both`}}>
                <div style={{display:'flex',alignItems:'center',gap:4,marginBottom:4}}>
                  <span style={{fontSize:16}}>{ENERGY_EMOJIS[et]}</span>
                  <span style={{fontFamily:'var(--ff-pixel)',fontSize:11,color:col,letterSpacing:1}}>{et.toUpperCase()}</span>
                </div>
                <div style={{fontFamily:'var(--ff-pixel)',fontSize:16,color:col,marginBottom:5}}>
                  {info.collected}<span style={{fontSize:12,color:'var(--text2)'}}>/{info.total}</span>
                </div>
                <div className="pbar-wrap" style={{height:3}}>
                  <div className="pbar-fill" style={{width:`${pct}%`,background:`linear-gradient(90deg,${col}50,${col})`}}/>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* dex tab */}
      {tab==='dex'&&(
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(68px,1fr))',gap:4,
          maxHeight:520,overflowY:'auto',paddingRight:4,
          scrollbarWidth:'thin',scrollbarColor:'var(--green1) var(--bg)'}}>
          {checklist.map((sp)=>{
            const imgData = images[sp.number];
            const src = imgData?.png || imgData?.svg || '';
            return (
              <div key={sp.number} className={`species-cell${sp.collected?' collected':''}`}
                title={`#${sp.number} ${sp.name} — open in Library`}
                style={{cursor:'pointer'}}
                onClick={e=>{e.stopPropagation();onNavigate?.(parseInt(sp.number));}}>
                {sp.collected&&(
                  <div style={{position:'absolute',top:2,right:3,fontFamily:'var(--ff-pixel)',fontSize:10,color:'var(--lime)'}}>✓</div>
                )}
                <Sprite src={src} name={sp.name} size={52} dimmed={!sp.collected}/>
                <div style={{
                  fontFamily:'var(--ff-pixel)',
                  fontSize:'clamp(6px,1.2vw,10px)',
                  color:sp.collected?'var(--text)':'var(--text3)',
                  lineHeight:1.4,marginTop:2,
                  whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',
                  width:'100%',textAlign:'center'}}>
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

/* ══ MAIN PAGE ══ */
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

function pulseHaptics(pattern: number | number[] = 12) {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
  navigator.vibrate(pattern);
}

export default function CC0Masters() {
  const mobile = useMobile();
  const router = useRouter();
  const [confirm,setConfirm] = useState<string|null>(null); // holds pending URL
  useEffect(()=>{ _toastSetter = (url)=>setConfirm(url); return()=>{ _toastSetter=null; }; },[]);
  const [data,setData]                   = useState<LeaderboardData|null>(null);
  const [loading,setLoading]             = useState(true);
  const [error,setError]                 = useState<string|null>(null);
  const [images,setImages]               = useState<Record<string,{svg:string;png:string;name:string}>>({});
  const [registryData,setRegistryData]   = useState<Record<string,{name:string;energy:string}>>({});
  const [openRow,setOpenRow]             = useState<string|null>(null);
  const [filter,setFilter]               = useState<'all'|'top10'|'top50'>('top10');
  const [walletSearch,setWalletSearch]   = useState('');
  const [isAdmin,setIsAdmin]             = useState(false);
  const [scanning,setScanning]           = useState(false);
  const [scanPhase,setScanPhase]         = useState('');
  const [scanPct,setScanPct]             = useState(0);
  const [scanDetail,setScanDetail]       = useState('');
  const [liveOwners,setLiveOwners]       = useState(0);
  const [lastRefreshed,setLastRefreshed] = useState<Date|null>(null);
  const [nextRefreshIn,setNextRefreshIn] = useState(300);
  // Seconds until next top-of-hour cron run
  const getCronSecondsLeft = () => {
    const now = new Date();
    return 3600 - (now.getMinutes() * 60 + now.getSeconds());
  };
  const [cronSecondsLeft,setCronSecondsLeft] = useState(getCronSecondsLeft);
  const scanAbort = useRef(false);
  const rowRefs = useRef<Record<string,HTMLElement|null>>({});
  const rankingsRef = useRef<HTMLDivElement|null>(null);

  const handlePodiumClick = (address: string) => {
    pulseHaptics([12, 18, 12]);
    setOpenRow(address);
    const rankingsTop = rankingsRef.current
      ? window.scrollY + rankingsRef.current.getBoundingClientRect().top - 18
      : null;

    if (rankingsTop !== null) {
      window.scrollTo({ top: Math.max(0, rankingsTop), behavior: 'smooth' });
    }

    setTimeout(()=>{
      const el = rowRefs.current[address];
      if (el) el.scrollIntoView({ behavior:'smooth', block:'center' });
      else rankingsRef.current?.scrollIntoView({ behavior:'smooth', block:'start' });
    }, 360);
  };

  const fetchLeaderboard = useCallback(async()=>{
    setLoading(true); setError(null);
    try {
      const res=await fetch('/api/leaderboard');
      if (!res.ok) { setError('no_data'); return; }
      setData(await res.json());
      setLastRefreshed(new Date());
      setNextRefreshIn(300);
    } catch { setError('fetch_failed'); }
    finally { setLoading(false); }
  },[]);

  // Auto-refresh: poll every 5 min and on tab focus
  useEffect(()=>{
    fetchLeaderboard();
    const interval = setInterval(fetchLeaderboard, 5 * 60 * 1000);
    const onVisible = () => { if (document.visibilityState === 'visible') fetchLeaderboard(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onVisible); };
  }, [fetchLeaderboard]);

  // Countdowns
  useEffect(()=>{
    const t = setInterval(()=>{
      setNextRefreshIn(n=>Math.max(0,n-1));
      setCronSecondsLeft(getCronSecondsLeft());
    },1000);
    return()=>clearInterval(t);
  },[]);

  useEffect(()=>{
    // Fetch registry images — contains { svg, png } per species number
    fetch('/api/registry').then(r=>r.json()).then(d=>{
      const imgs: Record<string,{svg:string;png:string;name:string}> = {};
      const rd: Record<string,{name:string;energy:string}> = {};
      for (const [k,v] of Object.entries(d.images||{})) {
        const e=v as {name:string;svg:string;png:string};
        imgs[k]={svg:e.svg,png:e.png,name:e.name};
        rd[k]={name:e.name,energy:''};
      }
      setImages(imgs);
      setRegistryData(rd);
    }).catch(()=>{});
    fetch('https://api.cc0mon.com/registry').then(r=>r.json()).then(d=>{
      const rd:Record<string,{name:string;energy:string}>={};
      for (const sp of (d.cc0mon||[])) rd[String(sp.number)]={name:sp.name,energy:sp.energy};
      setRegistryData(prev=>{ const n={...prev}; for(const [k,v] of Object.entries(rd)) n[k]={...n[k],...v}; return n; });
    }).catch(()=>{});
  },[]);

  useEffect(()=>{
    if (mobile) return;
    if (!window.matchMedia('(pointer: fine)').matches) return;
    return () => {
    };
  }, [mobile]);

  const startScan = async()=>{
    if (!isAdmin) {
      const pw=prompt('Admin password:');
      if (pw!=='cc0masters') return;
      setIsAdmin(true);
    }
    scanAbort.current=false;
    setScanning(true); setScanPct(0); setScanPhase(''); setScanDetail(''); setLiveOwners(0);
    try {
      const {collectors,speciesSupply}=await runOnChainScan(setScanPhase,setScanPct,setScanDetail,setLiveOwners,scanAbort,registryData,setImages);
      if (scanAbort.current) { setScanning(false); return; }
      setScanPhase('SAVING...'); setScanPct(95); setScanDetail('Writing to storage...');
      collectors.sort((a,b)=>b.collected-a.collected);
      const scannedBlock=await fetch(ETH_RPC,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({jsonrpc:'2.0',method:'eth_blockNumber',id:1,params:[]})})
        .then(r=>r.json()).then(j=>parseInt(j.result,16)).catch(()=>0);
      const leaders=collectors.map((c,i)=>{ const {checklist:_,...rest}=c as typeof c&{checklist?:unknown}; return {rank:i+1,...rest}; });
      const sr=await fetch('/api/save',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({updatedAt:new Date().toISOString(),scannedBlock,totalOwners:collectors.length,totalTokensScanned:TOTAL_TOKENS,leaders,speciesSupply})});
      if (!sr.ok) { const e=await sr.json(); throw new Error(e.error||'Save failed'); }
      setScanPct(100); setScanPhase('COMPLETE ✓');
      setTimeout(()=>{ setScanning(false); setScanPhase(''); fetchLeaderboard(); },1500);
    } catch(err) {
      setScanPhase('ERROR'); setScanDetail(String(err));
      setTimeout(()=>{ setScanning(false); setScanPhase(''); setScanDetail(''); },6000);
    }
  };

  // Force-correct the known full-dex holder (species 229 "Vilewing" was
  // mismapped by old scan code — CC0mon API confirms they have all 260)
  // Force-correct known missing species for the full-dex holder.
  // "Vilewing" = species 86 (Bug) AND 229 (Underworld) — same name, different energy
  // "Gazebleed" = species 215 (Underworld) AND 228 (Underworld) — same name, different energy
  // Old nameToNum map collision dropped one of each pair. Fixed in scan but blob has stale data.
  const FULL_DEX_HOLDER = '0x1ea0fca88df648041acda284014fe2a84f78dd26';
  const FORCED_SPECIES = [86, 215, 228, 229]; // both Vileings + both Gazeblee ds
  const correctedLeaders = (data?.leaders??[]).map(e => {
    if (e.address.toLowerCase() === FULL_DEX_HOLDER) {
      const nums = e.collectedSpeciesNums ?? [];
      const fixed = [...new Set([...nums, ...FORCED_SPECIES])];
      const collected = Math.max(fixed.length, 260);
      return { ...e, collectedSpeciesNums: fixed, collected, missing: 260 - collected, progress: ((collected/260)*100).toFixed(1)+'%' };
    }
    return e;
  });

  const walletSearchLower = walletSearch.toLowerCase().trim();
  const sorted = correctedLeaders.slice()
    .sort((a,b)=>b.collected-a.collected)
    .filter(e => {
      if (walletSearchLower) {
        return e.address.toLowerCase().includes(walletSearchLower);
      }
      return filter==='top10'?true:true; // show all when searching
    })
    .filter((_,i) => {
      if (walletSearchLower) return true; // no limit when searching
      return filter==='top10'?i<10:filter==='top50'?i<50:true;
    });
  const completeCount = correctedLeaders.filter(l=>l.collected===TOTAL_SPECIES).length;


  return (
    <div style={{background:'var(--black)',color:'var(--text)',minHeight:'100vh',fontFamily:'var(--ff-mono)'}}>

      {/* Energy type rainbow bar */}
      <div className="energy-bar" style={{position:'fixed',top:0,left:0,right:0,zIndex:9999,pointerEvents:'none'}}/>
      {/* moving scanline */}
      <div style={{position:'fixed',top:3,left:0,right:0,height:3,zIndex:9996,pointerEvents:'none',
        background:'linear-gradient(180deg,transparent,rgba(124,232,50,0.06),transparent)',
        animation:'scanline 8s linear infinite',opacity:0.7}}/>
      {/* Floating pixel particles */}
      <div className="particles-wrap" aria-hidden="true">
        {[...Array(18)].map((_,i)=>(
          <div key={i} className="particle" style={{
            left:`${(i*5.5+7)%100}%`,
            animationDuration:`${8+i*1.3}s`,
            animationDelay:`${i*0.7}s`,
            background:i%4===0?'var(--gold)':i%4===1?'#40b0ff':i%4===2?'#c080ff':'var(--lime)',
            width:i%3===0?3:2,height:i%3===0?3:2,
          }}/>
        ))}
      </div>

      {/* Toast notification */}
      {confirm&&(
        <div style={{
          position:'fixed',inset:0,zIndex:99999,
          background:'rgba(0,0,0,0.75)',
          display:'flex',alignItems:'center',justifyContent:'center',
          animation:'fadeIn 0.15s ease both',
        }} onClick={()=>setConfirm(null)}>
          <div style={{
            background:'var(--bg2)',border:'2px solid var(--green2)',
            boxShadow:'0 0 40px rgba(124,232,50,0.2), 0 8px 32px rgba(0,0,0,0.8)',
            padding:'28px 32px',maxWidth:360,width:'90%',
            animation:'fadeUp 0.2s ease both',
            position:'relative',
          }} onClick={e=>e.stopPropagation()}>
            {/* corner brackets */}
            {[[0,0,'top','left'],[0,0,'top','right'],[0,0,'bottom','left'],[0,0,'bottom','right']].map((_,i)=>(
              <div key={i} style={{position:'absolute',
                top:i<2?6:undefined,bottom:i>=2?6:undefined,
                left:i%2===0?6:undefined,right:i%2===1?6:undefined,
                width:10,height:10,
                borderTop:i<2?'2px solid var(--lime)':undefined,
                borderBottom:i>=2?'2px solid var(--lime)':undefined,
                borderLeft:i%2===0?'2px solid var(--lime)':undefined,
                borderRight:i%2===1?'2px solid var(--lime)':undefined,
              }}/>
            ))}
            <div style={{textAlign:'center',marginBottom:20}}>
              <div style={{fontSize:32,marginBottom:10}}>🌊</div>
              <div style={{fontFamily:'var(--ff-pixel)',fontSize:13,color:'var(--bright)',letterSpacing:2,marginBottom:8}}>
                OPENING OPENSEA
              </div>
              <div style={{fontFamily:'var(--ff-mono)',fontSize:11,color:'var(--text2)',wordBreak:'break-all',
                background:'var(--bg)',border:'1px solid var(--border)',padding:'6px 10px',
                letterSpacing:0.5}}>
                {confirm}
              </div>
            </div>
            <div style={{display:'flex',gap:10,justifyContent:'center'}}>
              <button className="btn btn-primary" onClick={()=>{ window.open(confirm,'_blank','noopener'); setConfirm(null); }}
                style={{flex:1,justifyContent:'center',letterSpacing:2}}>
                ✓ CONFIRM
              </button>
              <button className="btn btn-danger" onClick={()=>setConfirm(null)}
                style={{flex:1,justifyContent:'center',letterSpacing:2}}>
                ✕ CANCEL
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ HEADER ══ */}
      <header style={{background:'var(--bg2)',borderBottom:'2px solid var(--green1)',padding:'0',position:'relative'}}>

        {/* top bar */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:mobile?'6px 12px':'10px 24px',
          borderBottom:'1px solid var(--border)',background:'var(--bg)',flexWrap:'wrap',gap:4}}>
          <div style={{fontFamily:'var(--ff-pixel)',fontSize:mobile?9:14,color:'var(--text2)',letterSpacing:mobile?1:2}}>
            <span style={{color:'var(--green2)'}}>▶</span>{mobile?' ETH':' ETHEREUM MAINNET · ERC-721'}{data?.scannedBlock&&!mobile?` · BLOCK #${data.scannedBlock.toLocaleString()}`:''}
          </div>
          <div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
            {!mobile&&<span style={{fontFamily:'var(--ff-pixel)',fontSize:12,color:'var(--text3)',letterSpacing:1}}>
              CRON: <span style={{color:'var(--text2)'}}>{Math.floor(cronSecondsLeft/60)}:{String(cronSecondsLeft%60).padStart(2,'0')}</span>
            </span>}
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <div style={{width:7,height:7,background:'var(--lime)',borderRadius:0,
                boxShadow:'0 0 8px var(--lime), 0 0 16px rgba(124,232,50,0.4)',animation:'pulse 1.5s ease-in-out infinite'}}/>
              <span style={{fontFamily:'var(--ff-pixel)',fontSize:14,color:'var(--lime)',letterSpacing:2}}>LIVE</span>
            </div>
          </div>
        </div>

        {/* main header content */}
        <div style={{padding:mobile?'16px 12px 12px':'24px 24px 20px',display:'flex',alignItems:mobile?'flex-start':'flex-end',gap:mobile?12:24,flexWrap:'wrap'}}>

          {/* Logo block */}
          <div style={{flex:'0 0 auto',animation:'fadeUp 0.5s ease both'}}>
            {/* glitch title */}
            <div style={{position:'relative',marginBottom:6}}>
              <div style={{fontFamily:'var(--ff-pixel)',fontSize:'clamp(28px,6vw,56px)',
                color:'var(--bright)',lineHeight:0.9,letterSpacing:2,
                textShadow:'0 0 10px var(--lime), 0 0 30px rgba(124,232,50,0.5), 3px 3px 0 rgba(0,0,0,0.8)',
              }}>
                CC0MASTERS
              </div>
              {/* chromatic aberration layer */}
              <div style={{position:'absolute',top:0,left:0,fontFamily:'var(--ff-pixel)',
                fontSize:'clamp(28px,6vw,56px)',color:'rgba(255,0,80,0.15)',lineHeight:0.9,
                letterSpacing:2,transform:'translate(-2px,0)',userSelect:'none',pointerEvents:'none'}}>
                CC0MASTERS
              </div>
              <div style={{position:'absolute',top:0,left:0,fontFamily:'var(--ff-pixel)',
                fontSize:'clamp(28px,6vw,56px)',color:'rgba(0,220,255,0.15)',lineHeight:0.9,
                letterSpacing:2,transform:'translate(2px,0)',userSelect:'none',pointerEvents:'none'}}>
                CC0MASTERS
              </div>
            </div>
            <div style={{fontFamily:'var(--ff-pixel)',fontSize:12,color:'var(--text2)',letterSpacing:3,marginBottom:4}}>
              WHO WILL COLLECT THEM ALL<span className="blink">_</span>
            </div>
            <div className="title-underline"/>
          </div>

          {/* Stats */}
          <div style={{display:mobile?'grid':'flex',gridTemplateColumns:mobile?'1fr 1fr':undefined,gap:6,flexWrap:'wrap',animation:'fadeUp 0.5s ease 80ms both',width:mobile?'100%':undefined}}>
            {([
              {label:'COLLECTORS',value:data?.totalOwners??liveOwners,color:'var(--lime)',icon:'◈'},
              {label:'SPECIES',value:TOTAL_SPECIES,color:'var(--bright)',icon:'◉'},
              {label:'FULL DEX',value:completeCount,color:'var(--gold)',icon:'★'},
              {label:'ON-CHAIN',value:TOTAL_TOKENS,color:'var(--cyan)',icon:'⬡'},
            ]).map(({label,value,color,icon})=>(
              <div key={label} style={{
                background:'linear-gradient(160deg,var(--bg3) 0%,var(--panel) 100%)',
                border:`1px solid ${color}25`,
                padding:'14px 18px 12px',
                position:'relative',
                minWidth:mobile?0:96,
                boxShadow:`0 4px 24px ${color}06, inset 0 1px 0 ${color}20`}}>
                {/* top accent line */}
                <div style={{position:'absolute',top:0,left:0,right:0,height:2,
                  background:`linear-gradient(90deg,transparent,${color}80,transparent)`}}/>
                {/* bottom accent line */}
                <div style={{position:'absolute',bottom:0,left:0,right:0,height:1,
                  background:`linear-gradient(90deg,transparent,${color}20,transparent)`}}/>
                {/* corner icon — contained, not clipping */}
                <div style={{
                  position:'absolute',top:8,right:10,
                  fontFamily:'var(--ff-pixel)',fontSize:20,
                  color:`${color}20`,lineHeight:1,
                  pointerEvents:'none',userSelect:'none'}}>{icon}</div>
                {/* value */}
                <div className="stat-num" style={{fontFamily:'var(--ff-pixel)',fontSize:26,color,lineHeight:1,marginBottom:6,
                  textShadow:color!=='var(--text2)'?`0 0 16px ${color}90`:'none',letterSpacing:-1}}>
                  {value>0?<AnimatedNumber value={value}/>:'--'}
                </div>
                {/* label */}
                <div style={{fontFamily:'var(--ff-pixel)',fontSize:11,color:'var(--text2)',letterSpacing:2,
                  textTransform:'uppercase'}}>{label}</div>
              </div>
            ))}
          </div>

          {/* Actions (right side) */}
          <div style={{marginLeft:mobile?0:'auto',width:mobile?'100%':undefined,display:'flex',gap:8,alignItems:'center',animation:'fadeUp 0.5s ease 150ms both',flexWrap:'wrap'}}>
            <button className="btn btn-primary" onClick={()=>router.push('/library')} style={{letterSpacing:1,fontSize:mobile?10:undefined}}>📖 {mobile?'LIBRARY':'CC0MON LIBRARY'}</button>
            <button className="btn" onClick={fetchLeaderboard} disabled={scanning||loading}
              style={{position:'relative',overflow:'hidden',fontSize:mobile?9:11,padding:mobile?'6px 10px':'7px 12px',letterSpacing:1}}>
              {loading?'↺ LOADING…':'↺ REFRESH'}
            </button>
          </div>
        </div>

        {data&&!scanning&&!mobile&&(
          <div style={{padding:'6px 24px 8px',fontFamily:'var(--ff-pixel)',fontSize:11,color:'var(--text3)',letterSpacing:1,
            borderTop:'1px solid var(--border)',display:'flex',gap:16,flexWrap:'wrap'}}>
            <span>DATA: {new Date(data.updatedAt).toUTCString().toUpperCase()}</span>
            {lastRefreshed&&<span style={{color:'var(--text2)'}}>· PAGE LOADED: {lastRefreshed.toUTCString().toUpperCase()}</span>}
            <span style={{marginLeft:'auto',color:'var(--green2)'}}>↻ AUTO-REFRESH EVERY 5 MIN · CRON: HOURLY</span>
          </div>
        )}
      </header>

      {/* ══ SPRITE PARADE ══ */}
      {Object.keys(images).length > 0 && <SpriteParade images={images}/>}

      {/* ══ SCAN PROGRESS ══ */}
      {scanning&&(
        <div style={{background:'var(--bg2)',borderBottom:'2px solid var(--green2)',padding:mobile?'10px 12px':'12px 24px',
          animation:'fadeIn 0.2s ease both'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
            <div style={{fontFamily:'var(--ff-pixel)',fontSize:12,color:'var(--lime)',letterSpacing:2}}>
              ⬡ {scanPhase||'SCANNING...'}
            </div>
            <div style={{display:'flex',gap:10,alignItems:'center'}}>
              <span style={{fontFamily:'var(--ff-pixel)',fontSize:14,color:'var(--glow)'}}>{scanPct}%</span>
              <button className="btn btn-danger" style={{padding:'5px 10px',fontSize:12}} onClick={()=>{scanAbort.current=true;}}>✕ STOP</button>
            </div>
          </div>
          <div className="pbar-wrap" style={{height:8,marginBottom:5}}>
            <div className="pbar-fill" style={{width:`${scanPct}%`,transition:'width 0.4s ease'}}/>
          </div>
          <div style={{display:'flex',justifyContent:'space-between',fontFamily:'var(--ff-pixel)',fontSize:11,color:'var(--text2)',letterSpacing:1}}>
            <span>{scanDetail}</span>
            {liveOwners>0&&<span style={{color:'var(--lime)'}}>{liveOwners.toLocaleString()} OWNERS FOUND</span>}
          </div>
        </div>
      )}

      {/* ══ MAIN CONTENT ══ */}
      <main style={{padding:mobile?'12px 12px':'20px 24px',maxWidth:1440,margin:'0 auto'}}>

        {/* PODIUM */}
        {!loading&&!error&&sorted.length>=3&&(
          <section style={{marginBottom:24}}>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
              <div className="podium-header-wrap" style={{width:'100%'}}>
                <div className="podium-header-badge">
                  <span className="podium-header-orb" />
                  <span className="podium-header-kicker">CHAMPION PODIUM</span>
                </div>
                <div className="podium-header-mainline">
                  <div className="podium-header-titleblock">
                  </div>
                  <div className="podium-header-count">{(data?.leaders?.length??0).toLocaleString()} COLLECTORS</div>
                </div>
                <div className="podium-header-rule" />
              </div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:mobile?'1fr 1fr 1fr':'1fr 1.1fr 1fr',gap:mobile?2:8,alignItems:mobile?'stretch':'end',marginBottom:8}}>
              <>
                <PodiumCard entry={sorted[1]} rank={2} onClick={()=>handlePodiumClick(sorted[1].address)} isOpen={openRow===sorted[1].address} mobile={mobile}/>
                <PodiumCard entry={sorted[0]} rank={1} onClick={()=>handlePodiumClick(sorted[0].address)} isOpen={openRow===sorted[0].address} mobile={mobile}/>
                <PodiumCard entry={sorted[2]} rank={3} onClick={()=>handlePodiumClick(sorted[2].address)} isOpen={openRow===sorted[2].address} mobile={mobile}/>
              </>
            </div>
          </section>
        )}

        {/* FILTER/SORT */}
        {!loading&&!error&&(
          <div style={{display:'flex',gap:5,marginBottom:12,flexWrap:'wrap',alignItems:'center'}}>
            {/* Wallet search */}
            <input
              type="text"
              placeholder={mobile?"SEARCH WALLET…":"SEARCH WALLET ADDRESS OR ENS…"}
              value={walletSearch}
              onChange={e=>setWalletSearch(e.target.value)}
              style={{fontFamily:'var(--ff-pixel)',fontSize:11,background:'var(--bg)',
                border:'1px solid var(--border)',color:'var(--text)',
                padding:'6px 12px',outline:'none',
                width:mobile?'100%':280,letterSpacing:0.5,
                transition:'border-color 0.1s'}}
              onFocus={e=>e.target.style.borderColor='var(--lime)'}
              onBlur={e=>e.target.style.borderColor='var(--border)'}
            />
            {walletSearch&&(
              <button className="btn btn-filter" onClick={()=>setWalletSearch('')} style={{fontSize:10}}>✕</button>
            )}
            {!walletSearch&&<span style={{fontFamily:'var(--ff-pixel)',fontSize:11,color:'var(--text2)',marginRight:3,marginLeft:4}}>SHOW:</span>}
            {(['all','top10','top50'] as const).map(f=>(
              <button key={f} className={`btn btn-filter${filter===f?' active':''}`} onClick={()=>setFilter(f)}>
                {f==='all'?'ALL':f==='top10'?'TOP 10':'TOP 50'}
              </button>
            ))}

            {!walletSearch&&<div style={{marginLeft:'auto',fontFamily:'var(--ff-pixel)',fontSize:11,color:'var(--text2)'}}>
              {sorted.length.toLocaleString()} COLLECTORS
            </div>}
            {walletSearch&&<div style={{marginLeft:'auto',fontFamily:'var(--ff-pixel)',fontSize:11,color:'var(--lime)'}}>
              {sorted.length} RESULT{sorted.length!==1?'S':''}
            </div>}
          </div>
        )}

        {/* RANKINGS TABLE */}
        <div ref={rankingsRef}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
            <div style={{fontFamily:'var(--ff-pixel)',fontSize:11,color:'var(--bright)',letterSpacing:3,
              background:'var(--bg3)',border:'2px solid var(--green1)',padding:'6px 14px',
              display:'flex',alignItems:'center',gap:8,whiteSpace:'nowrap'}}>
              <span style={{color:'var(--green2)',fontSize:10}}>◆</span> FULL RANKINGS
            </div>
            <div style={{flex:1,height:2,background:'repeating-linear-gradient(90deg,var(--green1) 0,var(--green1) 4px,transparent 4px,transparent 8px)'}}/>
          </div>

          {loading?(
            <div className="px-border" style={{background:'var(--panel)',overflow:'hidden'}}>
              {mobile?(
                <div>
                  {Array.from({length:6}).map((_,i)=>(
                    <div key={i} style={{padding:'10px 12px',borderBottom:'1px solid var(--border)',display:'flex',flexDirection:'column',gap:8}}>
                      <div style={{display:'flex',gap:8}}>
                        <div className="skeleton" style={{width:22,height:14}}/>
                        <div className="skeleton" style={{flex:1,height:14}}/>
                        <div className="skeleton" style={{width:60,height:14}}/>
                      </div>
                      <div className="skeleton" style={{height:4,width:'100%'}}/>
                    </div>
                  ))}
                </div>
              ):(
                <div className="grid-table">
                  <div className="grid-table-hdr">
                    <div style={{justifyContent:'center'}}>#</div>
                    <div>WALLET</div>
                    <div>PROGRESS</div>
                    <div style={{justifyContent:'flex-end'}}>TOKENS</div>
                    <div style={{justifyContent:'center'}}>ENERGY</div>
                    <div style={{justifyContent:'center'}}>STATUS</div>
                  </div>
                  {Array.from({length:8}).map((_,i)=><SkeletonRow key={i} mobile={false}/>)}
                </div>
              )}
            </div>
          ):error?(
            <div className="px-border" style={{background:'var(--panel)',padding:'60px 24px',textAlign:'center'}}>
              <div style={{fontFamily:'var(--ff-pixel)',fontSize:32,color:'var(--border2)',marginBottom:14}}>◎</div>
              <div style={{fontFamily:'var(--ff-pixel)',fontSize:13,color:'var(--text2)',marginBottom:8,letterSpacing:2}}>NO LEADERBOARD DATA YET</div>
              <div style={{fontFamily:'var(--ff-pixel)',fontSize:11,color:'var(--text3)',lineHeight:3}}>
                DATA UPDATES HOURLY<br/>CHECK BACK SOON
              </div>
            </div>
          ):(
            <div className="px-border" style={{background:'var(--panel)',overflow:'hidden',animation:'fadeUp 0.4s ease both'}}>
              {mobile?(
                /* ── MOBILE: card list, no horizontal scroll ── */
                <div>
                  {sorted.map((entry,i)=>{
                    const pct=parseFloat(entry.progress);
                    const isOpen=openRow===entry.address;
                    const rankColor=i===0?'var(--gold)':i===1?'var(--silver)':i===2?'var(--bronze)':'var(--text2)';
                    const variantArr=['gold','silver','bronze'] as const;
                    const pv=i<3?variantArr[i]:'green';
                    return (
                      <div key={entry.address} ref={el=>{rowRefs.current[entry.address]=el;}}>
                        <div onClick={()=>setOpenRow(isOpen?null:entry.address)}
                          style={{
                            padding:'10px 12px',
                            borderBottom:'1px solid var(--border)',
                            borderLeft:i<3?`3px solid ${rankColor}`:'3px solid transparent',
                            background:isOpen?'rgba(124,232,50,0.04)':i===0?`linear-gradient(90deg,rgba(255,208,64,0.04),transparent)`
                              :i===1?`linear-gradient(90deg,rgba(144,184,160,0.03),transparent)`
                              :i===2?`linear-gradient(90deg,rgba(200,112,48,0.03),transparent)`:'',
                            cursor:'pointer',
                            animation:`fadeUp 0.3s ease ${Math.min(i*16,480)}ms both`,
                          }}>
                          {/* Row 1: rank + address + badge */}
                          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                            <span style={{fontFamily:'var(--ff-pixel)',fontSize:13,color:rankColor,
                              textShadow:i<3?`0 0 8px ${rankColor}`:'none',
                              minWidth:22,textAlign:'center',flexShrink:0}}>
                              {i+1}
                            </span>
                            <div style={{flex:1,overflow:'hidden'}}>
                              <AddressDisplay address={entry.address}/>
                            </div>
                            <span style={{fontFamily:'var(--ff-pixel)',fontSize:10,letterSpacing:0.5,flexShrink:0,
                              color:entry.missing===0?'var(--lime)':entry.missing<10?'var(--amber)':'var(--text2)',
                              border:`1px solid ${entry.missing===0?'var(--green2)':entry.missing<10?'rgba(255,160,64,0.4)':'var(--border)'}`,
                              background:entry.missing===0?'rgba(124,232,50,0.08)':'transparent',
                              padding:'2px 6px'}}>
                              {entry.missing===0?'✓ COMPLETE':`NEEDS ${entry.missing}`}
                            </span>
                          </div>
                          {/* Row 2: progress bar + species/pct */}
                          <div style={{display:'flex',alignItems:'center',gap:8}}>
                            <div style={{flex:1}}>
                              <ProgressBar pct={pct} variant={pv} height={4}/>
                            </div>
                            <span style={{fontFamily:'var(--ff-pixel)',fontSize:13,color:rankColor,flexShrink:0,
                              textShadow:i<3?`0 0 6px ${rankColor}60`:'none'}}>
                              {entry.collected}<span style={{fontSize:10,color:'var(--text3)',marginLeft:3}}>/{TOTAL_SPECIES}</span>
                            </span>
                            <span style={{fontFamily:'var(--ff-pixel)',fontSize:11,color:pct>80?'var(--bright)':'var(--text2)',flexShrink:0}}>
                              {entry.progress}
                            </span>
                          </div>
                        </div>
                        {isOpen&&<div style={{padding:0}}>
                          <DetailPanel entry={entry} images={images} registryData={registryData} onNavigate={n=>router.push(`/library?species=${n}`)}/>
                        </div>}
                      </div>
                    );
                  })}
                </div>
              ):(
                /* ── DESKTOP: full grid table ── */
                <div className="grid-table">
                  {/* HEADER ROW */}
                  <div className="grid-table-hdr">
                    <div style={{justifyContent:'center'}}>#</div>
                    <div>WALLET</div>
                    <div>PROGRESS</div>
                    <div style={{justifyContent:'flex-end'}}>TOKENS</div>
                    <div style={{justifyContent:'center'}}>ENERGY</div>
                    <div style={{justifyContent:'center'}}>STATUS</div>
                  </div>
                  {/* DATA ROWS */}
                  {sorted.map((entry,i)=>{
                    const pct=parseFloat(entry.progress);
                    const isOpen=openRow===entry.address;
                    const rankColor=i===0?'var(--gold)':i===1?'var(--silver)':i===2?'var(--bronze)':'var(--text3)';
                    const isTop3=i<3;
                    return <Fragment key={entry.address}>
                      <div ref={el=>{rowRefs.current[entry.address]=el;}} className={`grid-row${isOpen?' open':''}`}
                        onClick={()=>setOpenRow(isOpen?null:entry.address)}
                        style={{animation:`fadeUp 0.25s ease ${Math.min(i*14,420)}ms both`}}>
                        {/* # */}
                        <div style={{justifyContent:'center',borderLeft:isTop3?`3px solid ${rankColor}`:'3px solid transparent'}}>
                          <span style={{fontFamily:'var(--ff-pixel)',fontSize:isTop3?14:11,color:rankColor}}>{i+1}</span>
                        </div>
                        {/* WALLET */}
                        <div style={{overflow:'hidden'}}>
                          <AddressDisplay address={entry.address}/>
                        </div>
                        {/* PROGRESS */}
                        <div>
                          <div style={{display:'flex',alignItems:'center',gap:8,width:'100%'}}>
                            <span style={{
                              fontFamily:'var(--ff-pixel)',fontSize:isTop3?16:13,
                              color:isTop3?rankColor:'var(--text)',
                              minWidth:36,flexShrink:0,
                            }}>{entry.collected}</span>
                            <div style={{flex:1,height:8,background:'rgba(255,255,255,0.04)',borderRadius:1,overflow:'hidden'}}>
                              <div style={{
                                height:'100%',
                                width:`${pct}%`,
                                background:pct>=100
                                  ?'linear-gradient(90deg,var(--lime),var(--bright))'
                                  :pct>80?'linear-gradient(90deg,var(--green2),var(--lime))'
                                  :pct>50?'linear-gradient(90deg,var(--green1),var(--green2))'
                                  :'var(--green1)',
                                borderRadius:1,
                                transition:'width 0.6s ease',
                                boxShadow:pct>=80?'0 0 6px rgba(124,232,50,0.3)':'none',
                              }}/>
                            </div>
                            <span style={{
                              fontFamily:'var(--ff-mono)',fontSize:11,
                              color:pct>=100?'var(--lime)':pct>80?'var(--bright)':'var(--text3)',
                              flexShrink:0,minWidth:40,textAlign:'right',
                            }}>{entry.progress}</span>
                          </div>
                        </div>
                        {/* TOKENS */}
                        <div style={{justifyContent:'flex-end'}}>
                          <span style={{fontFamily:'var(--ff-mono)',fontSize:12,color:'var(--text2)'}}>{entry.totalTokensHeld.toLocaleString()}</span>
                        </div>
                        {/* ENERGY */}
                        <div style={{justifyContent:'center'}}>
                          <EnergyDots byEnergy={entry.byEnergy}/>
                        </div>
                        {/* STATUS */}
                        <div style={{justifyContent:'center'}}>
                          {entry.missing===0?(
                            <span style={{
                              fontFamily:'var(--ff-pixel)',fontSize:9,letterSpacing:1,
                              color:'var(--lime)',
                              border:'1px solid var(--green2)',
                              background:'rgba(124,232,50,0.1)',
                              padding:'3px 8px',
                            }}>✓ COMPLETE</span>
                          ):(
                            <span style={{
                              fontFamily:'var(--ff-pixel)',fontSize:9,
                              color:entry.missing<=10?'var(--amber)':entry.missing<=50?'var(--text2)':'var(--text3)',
                            }}>
                              NEEDS {entry.missing}
                            </span>
                          )}
                        </div>
                      </div>
                      {isOpen&&<div className="grid-detail">
                        <DetailPanel entry={entry} images={images} registryData={registryData} onNavigate={n=>router.push(`/library?species=${n}`)}/>
                      </div>}
                    </Fragment>;
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* ══ FOOTER ══ */}
      <footer style={{borderTop:'2px solid var(--green1)',background:'var(--bg2)',padding:mobile?'16px 12px':'20px 24px',marginTop:32}}>
        {/* second sprite parade (reversed speed) */}
        {Object.keys(images).length>0&&(
          <div style={{overflow:'hidden',marginBottom:16,padding:'8px 0',
            borderTop:'1px solid var(--border)',borderBottom:'1px solid var(--border)'}}>
            <div style={{display:'flex',gap:8,animation:'parade 100s linear infinite reverse',width:'max-content'}}>
              {[...HERO_SPRITE_NUMBERS.slice(24),...HERO_SPRITE_NUMBERS.slice(24)].map((num,i)=>{
                const imgData=images[num];
                if (!imgData) return null;
                return <div key={`f-${num}-${i}`} style={{flexShrink:0}}><Sprite src={imgData.png||imgData.svg} name={imgData.name} size={40}/></div>;
              })}
            </div>
          </div>
        )}

        <div style={{display:'flex',flexDirection:mobile?'column':'row',justifyContent:'space-between',flexWrap:'wrap',gap:12,alignItems:mobile?'flex-start':'flex-end'}}>
          <div>
            <div style={{fontFamily:'var(--ff-pixel)',fontSize:16,color:'var(--text2)',marginBottom:6,letterSpacing:2}}>CC0MASTERS</div>
            <div style={{fontFamily:'var(--ff-pixel)',fontSize:mobile?9:14,color:'var(--text3)',lineHeight:2.2,letterSpacing:1,maxWidth:'100%',overflow:'hidden'}}>
              {mobile?'ON-CHAIN · ETH MAINNET':'ALL DATA ON-CHAIN · ETHEREUM MAINNET'}<br/>
              <span style={{color:'var(--border2)',wordBreak:'break-all',fontSize:mobile?8:12}}>
                {CC0_CONTRACT}
              </span>
            </div>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:12,alignItems:mobile?'flex-start':'flex-end'}}>
            {/* CC0mon credit */}
            <div style={{fontFamily:'var(--ff-pixel)',fontSize:17,letterSpacing:2,
              textShadow:'0 0 16px rgba(124,232,50,0.2)'}}>
              <span style={{color:'var(--text2)'}}>CC0MON BY{' '}</span>
              <a href="https://x.com/SatoshisMom" target="_blank" rel="noreferrer"
                style={{color:'var(--lime)',textDecoration:'none',
                  textShadow:'0 0 10px rgba(124,232,50,0.5)'}}
                onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.color='var(--glow)';(e.currentTarget as HTMLElement).style.textShadow='0 0 18px rgba(200,255,80,0.7)';}}
                onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.color='var(--lime)';(e.currentTarget as HTMLElement).style.textShadow='0 0 10px rgba(124,232,50,0.5)';}}>
                @SATOSHISMOM
              </a>
            </div>
            {/* External links */}
            <div style={{display:'flex',gap:14,alignItems:'center',flexWrap:'wrap',justifyContent:mobile?'flex-start':'flex-end'}}>
              {[
                ['OPENSEA ▸','https://opensea.io/collection/cc0mon'],
                ['ETHERSCAN ▸',`https://etherscan.io/address/${CC0_CONTRACT}`],
                ['CC0MON.COM ▸','https://cc0mon.com'],
              ].map(([l,h])=>(
                <a key={l} href={h} target="_blank" rel="noreferrer"
                  style={{fontFamily:'var(--ff-pixel)',fontSize:14,color:'var(--text3)',textDecoration:'none',
                    letterSpacing:1,transition:'color 0.1s'}}
                  onMouseEnter={e=>(e.currentTarget as HTMLElement).style.color='var(--lime)'}
                  onMouseLeave={e=>(e.currentTarget as HTMLElement).style.color='var(--text3)'}>
                  {l}
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Community tools */}
        <div style={{marginTop:16,paddingTop:14,borderTop:'1px solid var(--border)',
          display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
          <span style={{fontFamily:'var(--ff-pixel)',fontSize:11,color:'var(--text3)',letterSpacing:1,lineHeight:1.8}}>
            ▶{' '}
            <a href="https://cc0mon-community.netlify.app/" target="_blank" rel="noreferrer"
              style={{color:'var(--bright)',textDecoration:'none'}}
              onMouseEnter={e=>(e.currentTarget as HTMLElement).style.color='var(--glow)'}
              onMouseLeave={e=>(e.currentTarget as HTMLElement).style.color='var(--bright)'}>
              CHECK OUT OTHER TOOLS ON OUR COMMUNITY PAGE
            </a>
            {' '}BY{' '}
            <a href="https://x.com/spell_web3" target="_blank" rel="noreferrer"
              style={{color:'var(--lime)',textDecoration:'none'}}
              onMouseEnter={e=>(e.currentTarget as HTMLElement).style.color='var(--glow)'}
              onMouseLeave={e=>(e.currentTarget as HTMLElement).style.color='var(--lime)'}>
              @SPELL_WEB3
            </a>
          </span>
        </div>

        {/* Hidden admin section */}
        <div style={{marginTop:20,paddingTop:14,borderTop:'1px solid var(--border)'}}>
          <details style={{fontFamily:'var(--ff-pixel)',fontSize:14,color:'var(--text3)'}}>
            <summary style={{cursor:'pointer',letterSpacing:1,listStyle:'none',display:'flex',alignItems:'center',gap:6,userSelect:'none'}}
              onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.color='var(--text2)';}}
              onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.color='var(--text3)';}}>
              <span>▶ ADMIN</span>
            </summary>
            <div style={{marginTop:10,display:'flex',gap:8,alignItems:'center'}}>
              {scanning?(
                <button className="btn btn-danger" onClick={()=>{scanAbort.current=true;}}>✕ STOP SCAN</button>
              ):(
                <button className="btn btn-primary" onClick={startScan}>⬡ ADMIN SCAN</button>
              )}
              <button className="btn" onClick={fetchLeaderboard} disabled={scanning}>↺ RELOAD DATA</button>
              <span style={{color:'var(--text3)',fontSize:10,letterSpacing:1,opacity:0.5}}>TRIGGERS A FULL ON-CHAIN SCAN (~5 MIN)</span>
            </div>
            {scanPhase&&<div style={{marginTop:8,color:'var(--lime)',letterSpacing:1}}>{scanPhase} {scanPct>0&&`— ${scanPct}%`}</div>}
          </details>
        </div>

        <div style={{marginTop:20,paddingTop:14,borderTop:'1px solid var(--border)',textAlign:'center'}}>
          <div style={{fontFamily:'var(--ff-pixel)',fontSize:16,color:'var(--text2)',letterSpacing:3,marginBottom:6,
            textShadow:'0 0 20px rgba(124,232,50,0.15)'}}>
            BUILT BY{' '}
            <a href="https://x.com/aster0x" target="_blank" rel="noreferrer"
              style={{color:'var(--lime)',textDecoration:'none',
                textShadow:'0 0 12px rgba(124,232,50,0.4)'}}
              onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.color='var(--glow)';(e.currentTarget as HTMLElement).style.textShadow='0 0 20px rgba(200,255,80,0.6)';}}
              onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.color='var(--lime)';(e.currentTarget as HTMLElement).style.textShadow='0 0 12px rgba(124,232,50,0.4)';}}>
              @ASTER0X
            </a>
          </div>

        </div>
      </footer>
    </div>
  );
}
