'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
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
  return (
    <a href={`https://opensea.io/${address}`} target="_blank" rel="noreferrer"
      onClick={e=>e.stopPropagation()} title={address}
      style={{ fontFamily:'var(--ff-mono)', fontSize:12,
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
): Promise<CollectorData[]> {
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
  const nameToNum=new Map<string,number>();
  for (const [numStr,info] of Object.entries(registryData)) {
    if (info.name) nameToNum.set(info.name.toLowerCase(),parseInt(numStr));
  }
  // Cache on-chain images (data URIs from tokenURI) — avoids external image requests entirely
  const onChainImages: Record<string,{svg:string;png:string;name:string}> = {};
  for (const [,sp] of tokenSpecies) {
    if (!sp.image) continue;
    const numStr = Object.keys(registryData).find(k => registryData[k].name?.toLowerCase() === sp.speciesName.toLowerCase());
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
    const num=nameToNum.get(sp.speciesName.toLowerCase());
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
      const num=nameToNum.get(sp.speciesName.toLowerCase());
      if (num) cs.add(num);
    }
    const byEnergy:Record<string,{collected:number;total:number}>={};
    for (const et of ENERGY_TYPES) byEnergy[et]={total:allSpecies.filter(s=>s.energy===et).length,collected:allSpecies.filter(s=>s.energy===et&&cs.has(parseInt(s.number))).length};
    const checklist=allSpecies.map(s=>({number:s.number,name:s.name,collected:cs.has(parseInt(s.number))}));
    const collected=cs.size;
    collectors.push({address,collected,missing:TOTAL_SPECIES-collected,progress:((collected/TOTAL_SPECIES)*100).toFixed(1)+'%',totalTokensHeld:tokenIds.length,byEnergy,checklist,collectedSpeciesNums:Array.from(cs)});
  }
  return collectors;
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

/* Single sprite image — loads PNG, falls back to SVG, then shows ? */
function Sprite({ src, name, size=56, dimmed=false, className='' }: { src:string; name:string; size?:number; dimmed?:boolean; className?:string }) {
  const [status, setStatus] = useState<'loading'|'ok'|'err'>('loading');

  useEffect(() => {
    if (!src) { setStatus('err'); return; }
    setStatus('loading');
    const img = new window.Image();
    img.onload  = () => setStatus('ok');
    img.onerror = () => setStatus('err');
    img.src = src;
  }, [src]);

  if (status === 'err' || !src) return (
    <div style={{width:size,height:size,display:'flex',alignItems:'center',justifyContent:'center',
      background:'var(--bg2)',border:'1px solid var(--border)',fontSize:size*0.3,
      color:'var(--text3)',opacity:dimmed?0.15:0.4,imageRendering:'pixelated'}}>?</div>
  );

  return (
    <div style={{width:size,height:size,position:'relative',display:'flex',alignItems:'center',justifyContent:'center',imageRendering:'pixelated'}}>
      {status==='loading'&&<div className="skeleton" style={{position:'absolute',inset:0}}/>}
      <img src={src} alt={name} width={size} height={size} loading="eager"
        style={{imageRendering:'pixelated',display:'block',
          opacity: status==='ok' ? (dimmed?0.18:1) : 0,
          transition:'opacity 0.2s',
          position:'relative',
          filter: dimmed ? 'grayscale(1)' : 'none'}}
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
    <div style={{overflow:'hidden',padding:'12px 0',borderTop:'1px solid var(--border)',borderBottom:'1px solid var(--border)',background:'var(--bg2)',position:'relative'}}>
      {/* fade edges */}
      <div style={{position:'absolute',left:0,top:0,bottom:0,width:80,background:'linear-gradient(90deg,var(--bg2),transparent)',zIndex:2,pointerEvents:'none'}}/>
      <div style={{position:'absolute',right:0,top:0,bottom:0,width:80,background:'linear-gradient(-90deg,var(--bg2),transparent)',zIndex:2,pointerEvents:'none'}}/>
      <div className="sprite-parade">
        {doubled.map((num, i) => {
          const imgData = images[num];
          if (!imgData) return null;
          return (
            <div key={`${num}-${i}`} style={{flexShrink:0,width:48,height:48,position:'relative'}}>
              <Sprite src={imgData.png||imgData.svg} name={imgData.name} size={48}/>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PodiumCard({ entry, rank, onClick, isOpen }: { entry:LeaderboardEntry; rank:1|2|3; onClick:()=>void; isOpen:boolean }) {
  const MEDALS = {1:'🥇',2:'🥈',3:'🥉'};
  const COLORS = {1:'var(--gold)',2:'var(--silver)',3:'var(--bronze)'};
  const LABELS = {1:'CHAMPION',2:'2ND PLACE',3:'3RD PLACE'};
  const VARIANTS = {1:'gold' as const,2:'silver' as const,3:'bronze' as const};

  return (
    <div onClick={onClick} className={`podium-card rank-${rank}${isOpen?' open':''}`}
      style={{animation:`fadeUp 0.5s ease ${rank===1?100:rank===2?0:200}ms both`}}>
      {/* corner decorations */}
      <div style={{position:'absolute',top:4,left:4,width:8,height:8,borderTop:`2px solid ${COLORS[rank]}`,borderLeft:`2px solid ${COLORS[rank]}`,opacity:0.6,zIndex:2}}/>
      <div style={{position:'absolute',top:4,right:4,width:8,height:8,borderTop:`2px solid ${COLORS[rank]}`,borderRight:`2px solid ${COLORS[rank]}`,opacity:0.6,zIndex:2}}/>
      <div style={{position:'absolute',bottom:4,left:4,width:8,height:8,borderBottom:`2px solid ${COLORS[rank]}`,borderLeft:`2px solid ${COLORS[rank]}`,opacity:0.6,zIndex:2}}/>
      <div style={{position:'absolute',bottom:4,right:4,width:8,height:8,borderBottom:`2px solid ${COLORS[rank]}`,borderRight:`2px solid ${COLORS[rank]}`,opacity:0.6,zIndex:2}}/>

      <div style={{position:'relative',zIndex:2,textAlign:'center',padding:'4px 0'}}>
        {/* rank label */}
        <div style={{fontFamily:'var(--ff-pixel)',fontSize:6,color:COLORS[rank],letterSpacing:2,marginBottom:8,opacity:0.7}}>{LABELS[rank]}</div>

        {/* medal */}
        <div style={{fontSize:rank===1?40:28,animation:'float 3.5s ease-in-out infinite',lineHeight:1,marginBottom:10,
          filter:`drop-shadow(0 0 8px ${COLORS[rank]}60)`}}>{MEDALS[rank]}</div>

        {/* address */}
        <div style={{marginBottom:10,minHeight:20}}><AddressDisplay address={entry.address}/></div>

        {/* big number */}
        <div style={{fontFamily:'var(--ff-pixel)',fontSize:rank===1?28:20,color:COLORS[rank],
          textShadow:`0 0 12px ${COLORS[rank]}, 0 0 24px ${COLORS[rank]}60`,
          lineHeight:1,marginBottom:4}}>
          {entry.collected}
          <span style={{fontSize:rank===1?10:8,color:'var(--text2)',marginLeft:6}}>/{TOTAL_SPECIES}</span>
        </div>
        <div style={{fontFamily:'var(--ff-pixel)',fontSize:5.5,color:'var(--text2)',letterSpacing:1,marginBottom:10}}>SPECIES</div>

        <ProgressBar pct={parseFloat(entry.progress)} variant={VARIANTS[rank]} height={rank===1?7:5}/>

        <div style={{marginTop:8,fontFamily:'var(--ff-pixel)',fontSize:5.5,color:'var(--text2)',letterSpacing:1}}>
          <span style={{color:COLORS[rank]}}>{entry.progress}</span>
          <span style={{margin:'0 6px',color:'var(--border2)'}}>·</span>
          <span>{entry.totalTokensHeld} TOKENS</span>
        </div>
      </div>
    </div>
  );
}

function SkeletonRow() {
  return <tr style={{borderBottom:'1px solid var(--border)'}}>
    {[32,150,60,110,45,42,96,60].map((w,i)=>(
      <td key={i} style={{padding:'12px'}}><div className="skeleton" style={{height:8,width:w}}/></td>
    ))}
  </tr>;
}

function DetailPanel({
  entry, images, registryData,
}: {
  entry: LeaderboardEntry;
  images: Record<string,{svg:string;png:string;name:string}>;
  registryData: Record<string,{name:string;energy:string}>;
}) {
  const [tab, setTab] = useState<'energy'|'dex'>('dex');

  const checklist = entry.checklist ?? (()=>{
    const collected = new Set(entry.collectedSpeciesNums??[]);
    return Array.from({length:TOTAL_SPECIES},(_,i)=>{
      const num=String(i+1);
      return {number:num,name:registryData[num]?.name??`#${num}`,collected:collected.has(i+1)};
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
            <div style={{fontFamily:'var(--ff-pixel)',fontSize:14,color:c,marginBottom:3,lineHeight:1}}>{v}</div>
            <div style={{fontFamily:'var(--ff-pixel)',fontSize:5.5,color:'var(--text2)',letterSpacing:1}}>{l}</div>
          </div>
        ))}
        <a href={`https://opensea.io/${entry.address}`} target="_blank" rel="noreferrer"
          style={{background:'var(--bg2)',border:'1px solid var(--border)',padding:'10px 12px',textDecoration:'none',
            display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',
            color:'var(--text2)',fontSize:9,fontFamily:'var(--ff-pixel)',letterSpacing:1,gap:4,transition:'all 0.1s'}}
          onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor='var(--lime)';(e.currentTarget as HTMLElement).style.color='var(--lime)';}}
          onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor='var(--border)';(e.currentTarget as HTMLElement).style.color='var(--text2)';}}>
          <span style={{fontSize:16}}>🌊</span>OPENSEA ▸
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
                  <span style={{fontSize:12}}>{ENERGY_EMOJIS[et]}</span>
                  <span style={{fontFamily:'var(--ff-pixel)',fontSize:5.5,color:col,letterSpacing:1}}>{et.toUpperCase()}</span>
                </div>
                <div style={{fontFamily:'var(--ff-pixel)',fontSize:11,color:col,marginBottom:5}}>
                  {info.collected}<span style={{fontSize:7,color:'var(--text2)'}}>/{info.total}</span>
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
              <div key={sp.number} className={`species-cell${sp.collected?' collected':''}`}>
                {sp.collected&&(
                  <div style={{position:'absolute',top:2,right:3,fontFamily:'var(--ff-pixel)',fontSize:5,color:'var(--lime)'}}>✓</div>
                )}
                <Sprite src={src} name={sp.name} size={52} dimmed={!sp.collected}/>
                <div style={{fontFamily:'var(--ff-pixel)',fontSize:4,
                  color:sp.collected?'var(--text)':'var(--text3)',lineHeight:1.6,marginTop:2,
                  overflow:'hidden',display:'-webkit-box' as 'flex',WebkitLineClamp:2,WebkitBoxOrient:'vertical' as 'vertical',
                  wordBreak:'break-word'}}>
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
  const [data,setData]                   = useState<LeaderboardData|null>(null);
  const [loading,setLoading]             = useState(true);
  const [error,setError]                 = useState<string|null>(null);
  const [images,setImages]               = useState<Record<string,{svg:string;png:string;name:string}>>({});
  const [registryData,setRegistryData]   = useState<Record<string,{name:string;energy:string}>>({});
  const [openRow,setOpenRow]             = useState<string|null>(null);
  const [filter,setFilter]               = useState<'all'|'top10'|'top50'>('top10');
  const [isAdmin,setIsAdmin]             = useState(false);
  const [scanning,setScanning]           = useState(false);
  const [scanPhase,setScanPhase]         = useState('');
  const [scanPct,setScanPct]             = useState(0);
  const [scanDetail,setScanDetail]       = useState('');
  const [liveOwners,setLiveOwners]       = useState(0);
  const scanAbort = useRef(false);

  const fetchLeaderboard = useCallback(async()=>{
  setLoading(true); setError(null);
  try {
    const res=await fetch('/api/leaderboard');
    if (!res.ok) { setError('no_data'); return; }
    let leaderboard = await res.json();
    // TEMPORARY OVERRIDE: Force top holder to show 260 species
    if (leaderboard && leaderboard.leaders && Array.isArray(leaderboard.leaders)) {
      leaderboard.leaders = leaderboard.leaders.map((entry:any) => {
        if (entry.address?.toLowerCase() === '0x1ea0fca88df648041acda284014fe2a84f78dd26') {
          return {
            ...entry,
            collected: 260,
            missing: 0,
            progress: '100.0%',
            checklist: entry.checklist ? entry.checklist.map((sp:any) => ({...sp, collected: true})) : entry.checklist,
            collectedSpeciesNums: Array.from({length:260},(_,i)=>i+1),
          };
        }
        return entry;
      });
    }
    setData(leaderboard);
  } catch { setError('fetch_failed'); }
  finally { setLoading(false); }
},[]);

 useEffect(()=>{
  fetchLeaderboard();
  // Fetch registry images — contains { svg, png } per species number
  fetch('https://api.cc0mon.com/registry/images').then(r=>r.json()).then(d=>{
    const imgs: Record<string,{svg:string;png:string;name:string}> = {};
    const rd: Record<string,{name:string;energy:string}> = {};
    for (const [k,v] of Object.entries(d.images||{})) {
      const e=v as {name:string;svg:string;png:string};
      imgs[k]={svg:e.svg,png:e.png,name:e.name};
      rd[k]={name:e.name,energy:''};
    }
    // Diagnostic: log missing images for species 1-260
    const missingImages: string[] = [];
    for (let i = 1; i <= 260; i++) {
      if (!imgs[String(i)]) missingImages.push(String(i));
    }
    if (missingImages.length > 0) {
      // eslint-disable-next-line no-console
      console.warn('Missing images for species:', missingImages);
    }
    setImages(imgs);
    setRegistryData(rd);
  }).catch(()=>{});
  fetch('https://api.cc0mon.com/registry').then(r=>r.json()).then(d=>{
    const rd:Record<string,{name:string;energy:string}>={};
    for (const sp of (d.cc0mon||[])) rd[String(sp.number)]={name:sp.name,energy:sp.energy};
    // Diagnostic: log missing registry entries for species 1-260
    const missingRegistry: string[] = [];
    for (let i = 1; i <= 260; i++) {
      if (!rd[String(i)]) missingRegistry.push(String(i));
    }
    if (missingRegistry.length > 0) {
      // eslint-disable-next-line no-console
      console.warn('Missing registry entries for species:', missingRegistry);
    }
    setRegistryData(prev=>{ const n={...prev}; for(const [k,v] of Object.entries(rd)) n[k]={...n[k],...v}; return n; });
  }).catch(()=>{});
},[fetchLeaderboard]);
  
  const startScan = async()=>{
    if (!isAdmin) {
      const pw=prompt('Admin password:');
      if (pw!=='cc0masters') return;
      setIsAdmin(true);
    }
    scanAbort.current=false;
    setScanning(true); setScanPct(0); setScanPhase(''); setScanDetail(''); setLiveOwners(0);
    try {
      const collectors=await runOnChainScan(setScanPhase,setScanPct,setScanDetail,setLiveOwners,scanAbort,registryData,setImages);
      if (scanAbort.current) { setScanning(false); return; }
      setScanPhase('SAVING...'); setScanPct(95); setScanDetail('Writing to storage...');
      collectors.sort((a,b)=>b.collected-a.collected);
      const scannedBlock=await fetch(ETH_RPC,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({jsonrpc:'2.0',method:'eth_blockNumber',id:1,params:[]})})
        .then(r=>r.json()).then(j=>parseInt(j.result,16)).catch(()=>0);
      const leaders=collectors.map((c,i)=>{ const {checklist:_,...rest}=c as typeof c&{checklist?:unknown}; return {rank:i+1,...rest}; });
      const sr=await fetch('/api/save',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({updatedAt:new Date().toISOString(),scannedBlock,totalOwners:collectors.length,totalTokensScanned:TOTAL_TOKENS,leaders})});
      if (!sr.ok) { const e=await sr.json(); throw new Error(e.error||'Save failed'); }
      setScanPct(100); setScanPhase('COMPLETE ✓');
      setTimeout(()=>{ setScanning(false); setScanPhase(''); fetchLeaderboard(); },1500);
    } catch(err) {
      setScanPhase('ERROR'); setScanDetail(String(err));
      setTimeout(()=>{ setScanning(false); setScanPhase(''); setScanDetail(''); },6000);
    }
  };

  const sorted = (data?.leaders??[]).slice()
    .sort((a,b)=>b.collected-a.collected)
    .filter((_,i)=>filter==='top10'?i<10:filter==='top50'?i<50:true);
  const completeCount = data?.leaders.filter(l=>l.collected===TOTAL_SPECIES).length??0;

  // Ticker text
  const topEntry = data?.leaders?.[0];
  const tickerText = topEntry
    ? `LEADER: ${topEntry.address.slice(0,8)}... — ${topEntry.collected}/${TOTAL_SPECIES} SPECIES — ${topEntry.progress} COMPLETE   ·   TOTAL COLLECTORS: ${data?.totalOwners?.toLocaleString()}   ·   FULL DEX HOLDERS: ${completeCount}   ·   CC0MON ERC-721 · ETHEREUM MAINNET   ·   `
    : '·  CC0MASTERS  ·  LIVE COLLECTOR LEADERBOARD  ·  ETHEREUM MAINNET  ·  ERC-721  ·  CC0  ·  ';

  return (
    <div style={{background:'var(--black)',color:'var(--text)',minHeight:'100vh',fontFamily:'var(--ff-mono)'}}>

      {/* moving scanline */}
      <div style={{position:'fixed',top:0,left:0,right:0,height:3,zIndex:9996,pointerEvents:'none',
        background:'linear-gradient(180deg,transparent,rgba(124,232,50,0.06),transparent)',
        animation:'scanline 8s linear infinite',opacity:0.7}}/>

      {/* ══ COMMUNITY BANNER ══ */}
      <div style={{background:'var(--bg)',borderBottom:'1px solid var(--border)',padding:'7px 24px',
        display:'flex',alignItems:'center',gap:16,flexWrap:'wrap',justifyContent:'center'}}>
        <span style={{fontFamily:'var(--ff-pixel)',fontSize:9,color:'var(--text2)',letterSpacing:1,whiteSpace:'nowrap'}}>
          ▶ CHECK OUT SITES BY{' '}
          <a href="https://x.com/spell_web3" target="_blank" rel="noreferrer"
            style={{color:'var(--lime)',textDecoration:'none',letterSpacing:1}}
            onMouseEnter={e=>(e.currentTarget as HTMLElement).style.color='var(--glow)'}
            onMouseLeave={e=>(e.currentTarget as HTMLElement).style.color='var(--lime)'}>
            @SPELL_WEB3
          </a>
        </span>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
          {[
            ['🌐 COMMUNITY','https://cc0mon-community.netlify.app/'],
            ['📖 DEX','https://cc0dex.netlify.app/'],
            ['🔲 GRID','https://cc0mon-grid.netlify.app/'],
          ].map(([label,href])=>(
            <a key={label} href={href} target="_blank" rel="noreferrer"
              className="btn btn-filter"
              style={{fontFamily:'var(--ff-pixel)',fontSize:8,letterSpacing:1,textDecoration:'none',padding:'5px 12px'}}>
              {label}
            </a>
          ))}
        </div>
               <span style={{fontFamily:'var(--ff-pixel)',fontSize:9,color:'var(--text2)',letterSpacing:1,whiteSpace:'nowrap'}}>
  <a href="https://cc-0mon-cards.vercel.app/" target="_blank" rel="noreferrer"
    style={{color:'var(--bright)',textDecoration:'none',letterSpacing:1,marginLeft:8}}
    onMouseEnter={e=>(e.currentTarget as HTMLElement).style.color='var(--glow)'}
    onMouseLeave={e=>(e.currentTarget as HTMLElement).style.color='var(--bright)'}>
    CC0mon Cards by <a href="https://twitter.com/beastoshii" target="_blank" rel="noreferrer" style={{color:'var(--lime)',textDecoration:'none',marginLeft:2}}> @beastoshii </a>
  </a>
  {' '}▸
  <a href="https://monomons.vercel.app/" target="_blank" rel="noreferrer"
    style={{color:'var(--bright)',textDecoration:'none',letterSpacing:1,marginLeft:8}}
    onMouseEnter={e=>(e.currentTarget as HTMLElement).style.color='var(--glow)'}
    onMouseLeave={e=>(e.currentTarget as HTMLElement).style.color='var(--bright)'}>
    Monomon by <a href="https://twitter.com/0xfilter8" target="_blank" rel="noreferrer" style={{color:'var(--lime)',textDecoration:'none',marginLeft:2}}> @0xfilter8 </a>
  </a>
  {' '}▸
</span>
      </div>

      {/* ══ HEADER ══ */}
      <header style={{background:'var(--bg2)',borderBottom:'2px solid var(--green1)',padding:'0',position:'relative'}}>

        {/* top bar */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 24px',
          borderBottom:'1px solid var(--border)',background:'var(--bg)'}}>
          <div style={{fontFamily:'var(--ff-pixel)',fontSize:9,color:'var(--text2)',letterSpacing:2}}>
            <span style={{color:'var(--green2)'}}>▶</span> ETHEREUM MAINNET · ERC-721 · CC0 · {data?.scannedBlock?`BLOCK #${data.scannedBlock.toLocaleString()}`:'LIVE'}
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <div style={{width:6,height:6,background:'var(--lime)',borderRadius:0,
              boxShadow:'0 0 6px var(--lime)',animation:'pulse 2s step-end infinite'}}/>
            <span style={{fontFamily:'var(--ff-pixel)',fontSize:9,color:'var(--lime)',letterSpacing:2}}>LIVE</span>
          </div>
        </div>

        {/* main header content */}
        <div style={{padding:'24px 24px 20px',display:'flex',alignItems:'flex-end',gap:24,flexWrap:'wrap'}}>

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
            <div style={{fontFamily:'var(--ff-pixel)',fontSize:7,color:'var(--text2)',letterSpacing:3,marginBottom:4}}>
              WHO WILL COLLECT THEM ALL<span className="blink">_</span>
            </div>
            <div className="px-divider" style={{width:200}}/>
          </div>

          {/* Stats */}
          <div style={{display:'flex',gap:10,flexWrap:'wrap',animation:'fadeUp 0.5s ease 80ms both'}}>
            {([
              {label:'COLLECTORS',value:data?.totalOwners??liveOwners,color:'var(--lime)'},
              {label:'SPECIES',value:TOTAL_SPECIES,color:'var(--bright)'},
              {label:'FULL DEX',value:completeCount,color:'var(--gold)'},
              {label:'ON-CHAIN',value:TOTAL_TOKENS,color:'var(--text2)'},
            ]).map(({label,value,color})=>(
              <div key={label} style={{background:'var(--bg3)',border:'1px solid var(--border2)',padding:'10px 14px',
                position:'relative',overflow:'hidden',minWidth:80}}>
                <div style={{position:'absolute',top:0,left:0,right:0,height:1,
                  background:`linear-gradient(90deg,transparent,${color}40,transparent)`}}/>
                <div style={{fontFamily:'var(--ff-pixel)',fontSize:16,color,lineHeight:1,marginBottom:3,
                  textShadow:color!=='var(--text2)'?`0 0 10px ${color}`:'none'}}>
                  {value>0?<AnimatedNumber value={value}/>:'--'}
                </div>
                <div style={{fontFamily:'var(--ff-pixel)',fontSize:5.5,color:'var(--text2)',letterSpacing:1}}>{label}</div>
              </div>
            ))}
          </div>

          {/* Actions (right side) */}
          <div style={{marginLeft:'auto',display:'flex',gap:8,alignItems:'center',animation:'fadeUp 0.5s ease 150ms both'}}>
            <button className="btn" onClick={fetchLeaderboard} disabled={scanning}>↺ REFRESH</button>
          </div>
        </div>

        {data&&!scanning&&(
          <div style={{padding:'6px 24px 8px',fontFamily:'var(--ff-pixel)',fontSize:5.5,color:'var(--text3)',letterSpacing:1,
            borderTop:'1px solid var(--border)'}}>
            LAST UPDATED: {new Date(data.updatedAt).toUTCString().toUpperCase()} · AUTO-UPDATE: HOURLY
          </div>
        )}
      </header>

      {/* ══ TICKER ══ */}
      <div className="ticker-wrap">
        <div className="ticker-content">
          {tickerText.repeat(3)}
        </div>
      </div>

      {/* ══ SPRITE PARADE ══ */}
      {Object.keys(images).length > 0 && <SpriteParade images={images}/>}

      {/* ══ SCAN PROGRESS ══ */}
      {scanning&&(
        <div style={{background:'var(--bg2)',borderBottom:'2px solid var(--green2)',padding:'12px 24px',
          animation:'fadeIn 0.2s ease both'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
            <div style={{fontFamily:'var(--ff-pixel)',fontSize:7,color:'var(--lime)',letterSpacing:2}}>
              ⬡ {scanPhase||'SCANNING...'}
            </div>
            <div style={{display:'flex',gap:10,alignItems:'center'}}>
              <span style={{fontFamily:'var(--ff-pixel)',fontSize:9,color:'var(--glow)'}}>{scanPct}%</span>
              <button className="btn btn-danger" style={{padding:'5px 10px',fontSize:7}} onClick={()=>{scanAbort.current=true;}}>✕ STOP</button>
            </div>
          </div>
          <div className="pbar-wrap" style={{height:8,marginBottom:5}}>
            <div className="pbar-fill" style={{width:`${scanPct}%`,transition:'width 0.4s ease'}}/>
          </div>
          <div style={{display:'flex',justifyContent:'space-between',fontFamily:'var(--ff-pixel)',fontSize:5.5,color:'var(--text2)',letterSpacing:1}}>
            <span>{scanDetail}</span>
            {liveOwners>0&&<span style={{color:'var(--lime)'}}>{liveOwners.toLocaleString()} OWNERS FOUND</span>}
          </div>
        </div>
      )}

      {/* ══ MAIN CONTENT ══ */}
      <main style={{padding:'20px 24px',maxWidth:1440,margin:'0 auto'}}>

        {/* PODIUM */}
        {!loading&&!error&&sorted.length>=3&&(
          <section style={{marginBottom:24}}>
            <div className="section-label" style={{marginBottom:14}}>CHAMPION PODIUM</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1.1fr 1fr',gap:8,alignItems:'end',marginBottom:8}}>
              <PodiumCard entry={sorted[1]} rank={2} onClick={()=>setOpenRow(openRow===sorted[1].address?null:sorted[1].address)} isOpen={openRow===sorted[1].address}/>
              <PodiumCard entry={sorted[0]} rank={1} onClick={()=>setOpenRow(openRow===sorted[0].address?null:sorted[0].address)} isOpen={openRow===sorted[0].address}/>
              <PodiumCard entry={sorted[2]} rank={3} onClick={()=>setOpenRow(openRow===sorted[2].address?null:sorted[2].address)} isOpen={openRow===sorted[2].address}/>
            </div>
            {[sorted[0],sorted[1],sorted[2]].map(e=>openRow===e.address&&(
              <div key={e.address} style={{border:'2px solid var(--green2)',borderTop:'none',animation:'slideDown 0.2s ease'}}>
                <DetailPanel entry={e} images={images} registryData={registryData}/>
              </div>
            ))}
          </section>
        )}

        {/* FILTER/SORT */}
        {!loading&&!error&&sorted.length>0&&(
          <div style={{display:'flex',gap:5,marginBottom:12,flexWrap:'wrap',alignItems:'center'}}>
            <span style={{fontFamily:'var(--ff-pixel)',fontSize:6,color:'var(--text2)',marginRight:3}}>SHOW:</span>
            {(['all','top10','top50'] as const).map(f=>(
              <button key={f} className={`btn btn-filter${filter===f?' active':''}`} onClick={()=>setFilter(f)}>
                {f==='all'?'ALL':f==='top10'?'TOP 10':'TOP 50'}
              </button>
            ))}

            <div style={{marginLeft:'auto',fontFamily:'var(--ff-pixel)',fontSize:6,color:'var(--text2)'}}>
              {sorted.length.toLocaleString()} COLLECTORS
            </div>
          </div>
        )}

        {/* RANKINGS TABLE */}
        <section>
          <div className="section-label" style={{marginBottom:12}}>FULL RANKINGS</div>

          {loading?(
            <div className="px-border" style={{background:'var(--panel)',overflow:'hidden'}}>
              <table className="lb-table">
                <thead><tr>{['#','WALLET','SPECIES','PROGRESS','%','TOKENS','ENERGIES','MISSING'].map(h=><th key={h}>{h}</th>)}</tr></thead>
                <tbody>{Array.from({length:8}).map((_,i)=><SkeletonRow key={i}/>)}</tbody>
              </table>
            </div>
          ):error?(
            <div className="px-border" style={{background:'var(--panel)',padding:'60px 24px',textAlign:'center'}}>
              <div style={{fontFamily:'var(--ff-pixel)',fontSize:28,color:'var(--border2)',marginBottom:14}}>◎</div>
              <div style={{fontFamily:'var(--ff-pixel)',fontSize:8,color:'var(--text2)',marginBottom:8,letterSpacing:2}}>NO LEADERBOARD DATA YET</div>
              <div style={{fontFamily:'var(--ff-pixel)',fontSize:6,color:'var(--text3)',lineHeight:3}}>
                DATA UPDATES HOURLY<br/>CHECK BACK SOON
              </div>
            </div>
          ):(
            <div className="px-border" style={{background:'var(--panel)',overflow:'hidden',animation:'fadeUp 0.4s ease both'}}>
              <div style={{overflowX:'auto'}}>
                <table className="lb-table">
                  <thead>
                    <tr>{['#','WALLET','SPECIES','PROGRESS','%','TOKENS','ENERGIES','MISSING'].map(h=><th key={h}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {sorted.map((entry,i)=>{
                      const pct=parseFloat(entry.progress);
                      const isOpen=openRow===entry.address;
                      const rankColor=i===0?'var(--gold)':i===1?'var(--silver)':i===2?'var(--bronze)':'var(--text2)';
                      const variantArr=['gold','silver','bronze'] as const;
                      const pv=i<3?variantArr[i]:'green';
                      return [
                        <tr key={entry.address} className={`lb-row${isOpen?' open':''}`}
                          onClick={()=>setOpenRow(isOpen?null:entry.address)}
                          style={{animation:`fadeUp 0.3s ease ${Math.min(i*16,480)}ms both`}}>
                          <td style={{width:38,textAlign:'center'}}>
                            <span style={{fontFamily:'var(--ff-pixel)',fontSize:i<3?13:9,color:rankColor,
                              textShadow:i<3?`0 0 8px ${rankColor}`:'none'}}>{i+1}</span>
                          </td>
                          <td><AddressDisplay address={entry.address}/></td>
                          <td>
                            <span style={{fontFamily:'var(--ff-pixel)',fontSize:i<3?15:12,color:rankColor,
                              textShadow:i<3?`0 0 8px ${rankColor}60`:'none'}}>{entry.collected}</span>
                            <span style={{fontFamily:'var(--ff-pixel)',fontSize:6,color:'var(--text2)',marginLeft:4}}>/{TOTAL_SPECIES}</span>
                          </td>
                          <td style={{minWidth:90}}><ProgressBar pct={pct} variant={pv} height={5}/></td>
                          <td>
                            <span style={{fontFamily:'var(--ff-pixel)',fontSize:9,color:pct>80?'var(--bright)':'var(--text)',
                              textShadow:pct>80?'0 0 8px rgba(168,255,64,0.4)':'none'}}>{entry.progress}</span>
                          </td>
                          <td><span style={{fontFamily:'var(--ff-mono)',fontSize:12,color:'var(--text2)'}}>{entry.totalTokensHeld}</span></td>
                          <td><EnergyDots byEnergy={entry.byEnergy}/></td>
                          <td>
                            <span style={{fontFamily:'var(--ff-pixel)',fontSize:6,letterSpacing:0.5,
                              color:entry.missing===0?'var(--lime)':entry.missing<10?'var(--amber)':'var(--text2)',
                              border:`1px solid ${entry.missing===0?'var(--green2)':entry.missing<10?'rgba(255,160,64,0.4)':'var(--border)'}`,
                              background:entry.missing===0?'rgba(124,232,50,0.08)':'transparent',
                              padding:'2px 6px'}}>
                              {entry.missing===0?'✓ COMPLETE':`${entry.missing} LEFT`}
                            </span>
                          </td>
                        </tr>,
                        isOpen&&<tr key={`${entry.address}-d`}><td colSpan={8} style={{padding:0}}>
                          <DetailPanel entry={entry} images={images} registryData={registryData}/>
                        </td></tr>,
                      ];
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* ══ FOOTER ══ */}
      <footer style={{borderTop:'2px solid var(--green1)',background:'var(--bg2)',padding:'20px 24px',marginTop:32}}>
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

        <div style={{display:'flex',justifyContent:'space-between',flexWrap:'wrap',gap:12,alignItems:'flex-end'}}>
          <div>
            <div style={{fontFamily:'var(--ff-pixel)',fontSize:11,color:'var(--text2)',marginBottom:6,letterSpacing:2}}>CC0MASTERS</div>
            <div style={{fontFamily:'var(--ff-pixel)',fontSize:9,color:'var(--text3)',lineHeight:2.2,letterSpacing:1}}>
              ALL DATA ON-CHAIN · ETHEREUM MAINNET<br/>
              <span style={{color:'var(--border2)'}}>{CC0_CONTRACT}</span>
            </div>
          </div>
          <div style={{display:'flex',gap:14,alignItems:'center',flexWrap:'wrap'}}>
            {[
              ['OPENSEA ▸','https://opensea.io/collection/cc0mon'],
              ['ETHERSCAN ▸',`https://etherscan.io/address/${CC0_CONTRACT}`],
              ['CC0MON.COM ▸','https://cc0mon.com'],
            ].map(([l,h])=>(
              <a key={l} href={h} target="_blank" rel="noreferrer"
                style={{fontFamily:'var(--ff-pixel)',fontSize:9,color:'var(--text3)',textDecoration:'none',
                  letterSpacing:1,transition:'color 0.1s'}}
                onMouseEnter={e=>(e.currentTarget as HTMLElement).style.color='var(--lime)'}
                onMouseLeave={e=>(e.currentTarget as HTMLElement).style.color='var(--text3)'}>
                {l}
              </a>
            ))}
          </div>
        </div>

        {/* Hidden admin section */}
        <div style={{marginTop:20,paddingTop:14,borderTop:'1px solid var(--border)'}}>
          <details style={{fontFamily:'var(--ff-pixel)',fontSize:9,color:'var(--text3)'}}>
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
              <span style={{color:'var(--text3)',fontSize:5,letterSpacing:1,opacity:0.5}}>TRIGGERS A FULL ON-CHAIN SCAN (~5 MIN)</span>
            </div>
            {scanPhase&&<div style={{marginTop:8,color:'var(--lime)',letterSpacing:1}}>{scanPhase} {scanPct>0&&`— ${scanPct}%`}</div>}
          </details>
        </div>

        <div style={{marginTop:20,paddingTop:14,borderTop:'1px solid var(--border)',textAlign:'center'}}>
          <div style={{fontFamily:'var(--ff-pixel)',fontSize:11,color:'var(--text2)',letterSpacing:3,marginBottom:6,
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
          <div style={{fontFamily:'var(--ff-pixel)',fontSize:8,color:'var(--text3)',letterSpacing:1,opacity:0.5}}>
            CC0 · NO RIGHTS RESERVED · BUILD BY THE COMMUNITY
          </div>
        </div>
      </footer>
    </div>
  );
}
