'use client';
import { useEffect, useState, Suspense, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

const CC0_CONTRACT = '0xeeb036dbbd3039429c430657ed9836568da79d5f';

const EC: Record<string,string> = {
  Fire:'#ff6030',Ice:'#80e8ff',Grass:'#a0ff60',Electric:'#ffe040',Ghost:'#c080ff',
  Dragon:'#6080ff',Metal:'#a0c8d0',Toxic:'#a0ff20',Rock:'#c0a860',Bug:'#80d040',
  Ocean:'#40b0ff',Earth:'#c09040',Underworld:'#a060e0',Mythic:'#ff80c0',
  Celestial:'#ffd880',Fossil:'#d0b888',
};
const RC: Record<string,string> = {
  Common:'#6a8a60', Uncommon:'#7ee832', Rare:'#40b0ff', Epic:'#c080ff', Legendary:'#ffd040',
};
const RARITY_ORDER = ['Common','Uncommon','Rare','Epic','Legendary'];
const RARITY_SORT_ORDER: Record<string,number> = { Legendary:0, Epic:1, Rare:2, Uncommon:3, Common:4 };

// Approximate supply by rarity tier (9999 total / 260 species * rarity factor)
const SUPPLY_EST: Record<string,number> = {
  Common:Math.round(9999/260*1.8), Uncommon:Math.round(9999/260*1.1),
  Rare:Math.round(9999/260*0.65), Epic:Math.round(9999/260*0.3), Legendary:Math.round(9999/260*0.12),
};

let _dlgSetter: ((url:string|null)=>void)|null = null;
function goLink(url: string) { _dlgSetter?.(url); }

interface Species { number:number; name:string; energy:string; rarity:string; png?:string; svg?:string; }

/* ── Shared confirm dialog ── */
function ConfirmDlg({url,onOk,onNo}:{url:string;onOk:()=>void;onNo:()=>void}) {
  return (
    <div style={{position:'fixed',inset:0,zIndex:99999,background:'rgba(0,0,0,0.82)',display:'flex',
      alignItems:'center',justifyContent:'center'}} onClick={onNo}>
      <div style={{background:'var(--bg2)',border:'2px solid var(--green2)',padding:'28px 32px',
        maxWidth:380,width:'90%',animation:'fadeUp 0.18s ease'}} onClick={e=>e.stopPropagation()}>
        <div style={{textAlign:'center',marginBottom:20}}>
          <div style={{fontSize:30,marginBottom:10}}>🌊</div>
          <div style={{fontFamily:'var(--ff-pixel)',fontSize:12,color:'var(--bright)',letterSpacing:2,marginBottom:8}}>OPENING OPENSEA</div>
          <div style={{fontFamily:'var(--ff-mono)',fontSize:11,color:'var(--text2)',wordBreak:'break-all',
            background:'var(--bg)',border:'1px solid var(--border)',padding:'6px 10px'}}>{url}</div>
        </div>
        <div style={{display:'flex',gap:10}}>
          <button className="btn btn-primary" onClick={onOk} style={{flex:1,justifyContent:'center',letterSpacing:2}}>✓ GO</button>
          <button className="btn btn-danger" onClick={onNo} style={{flex:1,justifyContent:'center',letterSpacing:2}}>✕ CANCEL</button>
        </div>
      </div>
    </div>
  );
}

/* ── Sprite ── */
function Sprite({src,name,size=56,dimmed=false}:{src:string;name:string;size?:number;dimmed?:boolean}) {
  const [s,setS]=useState<'l'|'ok'|'err'>(src?'l':'err');
  return (
    <div style={{width:size,height:size,position:'relative',flexShrink:0,imageRendering:'pixelated'}}>
      {s==='l'&&<div className="skeleton" style={{position:'absolute',inset:0}}/>}
      {s==='err'&&<div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',
        justifyContent:'center',fontSize:size*0.28,color:'var(--text3)',opacity:0.4}}>?</div>}
      {src&&<img src={src} alt={name} width={size} height={size} loading="eager" decoding="async"
        onLoad={()=>setS('ok')} onError={()=>setS('err')}
        style={{imageRendering:'pixelated',display:'block',
          opacity:s==='ok'?(dimmed?0.2:1):0,transition:'opacity 0.15s',
          filter:dimmed?'grayscale(1)':undefined}}/>}
    </div>
  );
}

/* ── Species Card — collectible card aesthetic ── */
function Card({sp,holders,onClick}:{sp:Species;holders:number;onClick:()=>void}) {
  const col=EC[sp.energy]||'#7ee832';
  const rc=RC[sp.rarity]||'#90c880';
  const [hov,setHov]=useState(false);
  return (
    <div onClick={onClick}
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{
        background:hov
          ?`linear-gradient(145deg,${col}12 0%,var(--bg3) 40%,var(--panel) 100%)`
          :`linear-gradient(145deg,var(--bg3) 0%,var(--panel) 100%)`,
        border:`1px solid ${hov?col+'80':col+'20'}`,
        cursor:'pointer',position:'relative',overflow:'hidden',
        transform:hov?'translateY(-4px) scale(1.02)':'none',
        boxShadow:hov?`0 12px 32px ${col}18, 0 4px 12px rgba(0,0,0,0.4)`:
          `0 2px 8px rgba(0,0,0,0.3)`,
        transition:'all 0.15s ease',
      }}>
      {/* Energy color top bar */}
      <div style={{position:'absolute',top:0,left:0,right:0,height:3,
        background:`linear-gradient(90deg,transparent,${col},transparent)`,
        opacity:hov?1:0.5,transition:'opacity 0.15s'}}/>
      {/* # badge */}
      <div style={{position:'absolute',top:7,left:8,fontFamily:'var(--ff-pixel)',fontSize:8,
        color:hov?col:'var(--text3)',transition:'color 0.15s'}}>#{String(sp.number).padStart(3,'0')}</div>
      {/* rarity gem */}
      <div style={{position:'absolute',top:8,right:8,width:7,height:7,background:rc,
        boxShadow:hov?`0 0 8px ${rc}, 0 0 16px ${rc}60`:`0 0 4px ${rc}80`,
        transition:'box-shadow 0.15s'}}/>
      {/* sprite area */}
      <div style={{padding:'26px 8px 6px',display:'flex',flexDirection:'column',alignItems:'center',gap:5}}>
        <div style={{position:'relative'}}>
          {hov&&<div style={{position:'absolute',inset:-4,background:`radial-gradient(circle,${col}20 0%,transparent 70%)`,pointerEvents:'none'}}/>}
          <Sprite src={sp.png||sp.svg||''} name={sp.name} size={68}/>
        </div>
        {/* name */}
        <div style={{fontFamily:'var(--ff-pixel)',fontSize:'clamp(7px,1.1vw,9px)',
          color:hov?'var(--bright)':'var(--text)',textAlign:'center',
          whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',width:'100%',
          paddingInline:4,transition:'color 0.15s',letterSpacing:0.3}}>
          {sp.name}
        </div>
        {/* energy pill */}
        <div style={{fontFamily:'var(--ff-pixel)',fontSize:7,color:col,
          padding:'1px 6px',border:`1px solid ${col}50`,background:`${col}12`,
          letterSpacing:0.8,whiteSpace:'nowrap'}}>
          {sp.energy.toUpperCase()}
        </div>
        {/* holders */}
        <div style={{fontFamily:'var(--ff-pixel)',fontSize:8,
          color:holders>0?'var(--text2)':'var(--text3)',letterSpacing:0.3}}>
          {holders>0?`${holders} holders`:'—'}
        </div>
      </div>
      {/* bottom shimmer on hover */}
      {hov&&<div style={{position:'absolute',bottom:0,left:0,right:0,height:1,background:`linear-gradient(90deg,transparent,${col}60,transparent)`}}/>}
    </div>
  );
}

/* ── Detail Modal ── */
function DetailModal({sp,holderMap,allSpecies,onClose,onNav}:{
  sp:Species; holderMap:Record<number,{address:string;totalHeld:number}[]>;
  allSpecies:Species[]; onClose:()=>void; onNav:(n:number)=>void;
}) {
  const [desc,setDesc]=useState('');
  const [sales,setSales]=useState<any[]>([]);
  const [salesLoading,setSalesLoading]=useState(true);
  const col=EC[sp.energy]||'#7ee832';
  const rc=RC[sp.rarity]||'#90c880';
  const supply=SUPPLY_EST[sp.rarity]||Math.round(9999/260);
  const holders=holderMap[sp.number]||[];

  // prev/next navigation
  const idx=allSpecies.findIndex(s=>s.number===sp.number);
  const prev=idx>0?allSpecies[idx-1]:null;
  const next=idx<allSpecies.length-1?allSpecies[idx+1]:null;

  useEffect(()=>{
    setDesc(''); setSales([]); setSalesLoading(true);
    fetch('/api/registry').then(r=>r.json()).then(d=>{
      const tid=d.images?.[String(sp.number)]?.tokenId;
      if (!tid) { setSalesLoading(false); return; }
      // description
      fetch(`https://api.cc0mon.com/cc0mon/${tid}`).then(r=>r.json())
        .then(t=>setDesc(t.description||'')).catch(()=>{});
      // sales
      fetch(`https://api.opensea.io/api/v2/events/chain/ethereum/contract/${CC0_CONTRACT}/nfts/${tid}?event_type=sale&limit=5`,
        {headers:{accept:'application/json'}})
        .then(r=>r.json())
        .then(data=>{
          setSales((data.asset_events||[]).map((e:any)=>({
            price:e.payment?(parseFloat(e.payment.quantity)/1e18).toFixed(4)+' ETH':'—',
            from:e.seller?e.seller.slice(0,6)+'…'+e.seller.slice(-4):'—',
            to:e.buyer?e.buyer.slice(0,6)+'…'+e.buyer.slice(-4):'—',
            date:e.closing_date?new Date(e.closing_date*1000).toLocaleDateString():'—',
            tx:e.transaction||'',
          })));
          setSalesLoading(false);
        }).catch(()=>setSalesLoading(false));
    }).catch(()=>setSalesLoading(false));
  },[sp.number]);

  // keyboard nav
  useEffect(()=>{
    const handler=(e:KeyboardEvent)=>{
      if (e.key==='Escape') onClose();
      if (e.key==='ArrowLeft'&&prev) onNav(prev.number);
      if (e.key==='ArrowRight'&&next) onNav(next.number);
    };
    window.addEventListener('keydown',handler);
    return()=>window.removeEventListener('keydown',handler);
  },[prev,next]);

  return (
    <div style={{position:'fixed',inset:0,zIndex:9000,background:'rgba(0,0,0,0.88)',
      display:'flex',alignItems:'center',justifyContent:'center',
      backdropFilter:'blur(4px)',animation:'fadeIn 0.12s ease'}} onClick={onClose}>
      <div style={{
        background:`linear-gradient(160deg, var(--bg2) 0%, var(--bg) 100%)`,
        border:`2px solid ${col}50`,
        boxShadow:`0 0 80px ${col}10, 0 0 0 1px ${col}15, 0 24px 80px rgba(0,0,0,0.9)`,
        maxWidth:780,width:'96%',maxHeight:'92vh',overflowY:'auto',
        position:'relative',animation:'fadeUp 0.2s ease',
      }} onClick={e=>e.stopPropagation()}>

        {/* Full-width top energy bar */}
        <div style={{height:4,background:`linear-gradient(90deg,${col}30,${col},${col}30)`}}/>

        {/* Nav arrows */}
        {prev&&<button onClick={e=>{e.stopPropagation();onNav(prev.number);}}
          style={{position:'absolute',left:0,top:'50%',transform:'translateY(-50%)',
            background:'transparent',border:'none',color:col,fontSize:28,cursor:'pointer',
            padding:'8px 12px',zIndex:3,opacity:0.6,transition:'opacity 0.1s'}}
          onMouseEnter={e=>(e.currentTarget as HTMLElement).style.opacity='1'}
          onMouseLeave={e=>(e.currentTarget as HTMLElement).style.opacity='0.6'}>‹</button>}
        {next&&<button onClick={e=>{e.stopPropagation();onNav(next.number);}}
          style={{position:'absolute',right:0,top:'50%',transform:'translateY(-50%)',
            background:'transparent',border:'none',color:col,fontSize:28,cursor:'pointer',
            padding:'8px 12px',zIndex:3,opacity:0.6,transition:'opacity 0.1s'}}
          onMouseEnter={e=>(e.currentTarget as HTMLElement).style.opacity='1'}
          onMouseLeave={e=>(e.currentTarget as HTMLElement).style.opacity='0.6'}>›</button>}

        {/* Close */}
        <button onClick={onClose} style={{position:'absolute',top:14,right:16,
          background:'transparent',border:'1px solid var(--border)',color:'var(--text3)',
          fontFamily:'var(--ff-pixel)',fontSize:11,cursor:'pointer',padding:'3px 9px',
          zIndex:3,transition:'all 0.1s'}}
          onMouseEnter={e=>{const el=e.currentTarget as HTMLElement;el.style.borderColor='var(--red)';el.style.color='var(--red)';}}
          onMouseLeave={e=>{const el=e.currentTarget as HTMLElement;el.style.borderColor='var(--border)';el.style.color='var(--text3)';}}>ESC ✕</button>

        {/* ── HERO ── */}
        <div style={{padding:'20px 32px 0',display:'flex',gap:24,alignItems:'flex-start',flexWrap:'wrap'}}>
          {/* Big sprite */}
          <div style={{flexShrink:0,position:'relative'}}>
            <div style={{border:`2px solid ${col}40`,padding:12,background:`${col}06`,
              position:'relative',overflow:'hidden'}}>
              <div style={{position:'absolute',inset:0,
                background:`radial-gradient(ellipse at 50% 60%,${col}18 0%,transparent 70%)`,
                pointerEvents:'none'}}/>
              {/* Corner brackets */}
              {[[0,0,1,1],[1,0,-1,1],[0,1,1,-1],[1,1,-1,-1]].map(([rx,ry,dx,dy],i)=>(
                <div key={i} style={{position:'absolute',
                  right:rx?6:undefined,left:rx?undefined:6,
                  bottom:ry?6:undefined,top:ry?undefined:6,
                  width:10,height:10,
                  borderRight:rx?`2px solid ${col}`:undefined,borderLeft:rx?undefined:`2px solid ${col}`,
                  borderBottom:ry?`2px solid ${col}`:undefined,borderTop:ry?undefined:`2px solid ${col}`,
                  opacity:0.7}}/>
              ))}
              <Sprite src={sp.png||sp.svg||''} name={sp.name} size={148}/>
            </div>
            {/* Prev/next mini sprites */}
            <div style={{display:'flex',gap:6,marginTop:8,justifyContent:'center'}}>
              {prev&&<div style={{opacity:0.4,cursor:'pointer',transition:'opacity 0.1s'}}
                onClick={e=>{e.stopPropagation();onNav(prev.number);}}
                onMouseEnter={e=>(e.currentTarget as HTMLElement).style.opacity='0.8'}
                onMouseLeave={e=>(e.currentTarget as HTMLElement).style.opacity='0.4'}>
                <Sprite src={prev.png||prev.svg||''} name={prev.name} size={32}/>
              </div>}
              {next&&<div style={{opacity:0.4,cursor:'pointer',transition:'opacity 0.1s'}}
                onClick={e=>{e.stopPropagation();onNav(next.number);}}
                onMouseEnter={e=>(e.currentTarget as HTMLElement).style.opacity='0.8'}
                onMouseLeave={e=>(e.currentTarget as HTMLElement).style.opacity='0.4'}>
                <Sprite src={next.png||next.svg||''} name={next.name} size={32}/>
              </div>}
            </div>
          </div>

          {/* Info block */}
          <div style={{flex:1,minWidth:200,paddingTop:4}}>
            <div style={{fontFamily:'var(--ff-pixel)',fontSize:10,color:'var(--text3)',
              letterSpacing:3,marginBottom:6}}>SPECIES #{String(sp.number).padStart(3,'0')}</div>
            <div style={{fontFamily:'var(--ff-pixel)',fontSize:34,color:col,lineHeight:1.05,
              marginBottom:10,textShadow:`0 0 20px ${col}50,0 0 40px ${col}20`}}>
              {sp.name}
            </div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:16}}>
              <span style={{fontFamily:'var(--ff-pixel)',fontSize:11,color:col,
                padding:'4px 12px',border:`1px solid ${col}60`,background:`${col}18`,letterSpacing:1}}>
                {sp.energy.toUpperCase()}
              </span>
              <span style={{fontFamily:'var(--ff-pixel)',fontSize:11,color:rc,
                padding:'4px 12px',border:`1px solid ${rc}60`,background:`${rc}12`,letterSpacing:1}}>
                {sp.rarity.toUpperCase()}
              </span>
            </div>
            {desc&&(
              <div style={{fontFamily:'var(--ff-mono)',fontSize:13,color:'var(--text)',
                lineHeight:1.8,fontStyle:'italic',opacity:0.9,maxWidth:420,
                borderLeft:`2px solid ${col}40`,paddingLeft:12}}>
                "{desc}"
              </div>
            )}
          </div>
        </div>

        {/* ── STAT TILES ── */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,padding:'20px 32px 16px'}}>
          {([
            [holders.length||'—','HOLDERS',col],
            [supply,'SUPPLY','var(--bright)'],
            [sp.rarity,sp.rarity==='Legendary'?'⭐ RARITY':'RARITY',rc],
          ] as [any,string,string][]).map(([v,l,c])=>(
            <div key={l} style={{background:'var(--bg)',border:`1px solid ${c}18`,
              padding:'14px 16px',position:'relative',overflow:'hidden'}}>
              <div style={{position:'absolute',top:0,left:0,right:0,height:2,
                background:`linear-gradient(90deg,transparent,${c}80,transparent)`}}/>
              <div style={{fontFamily:'var(--ff-pixel)',fontSize:22,color:c,
                marginBottom:5,textShadow:`0 0 12px ${c}50`}}>{v}</div>
              <div style={{fontFamily:'var(--ff-pixel)',fontSize:9,color:'var(--text3)',
                letterSpacing:2}}>{l}</div>
            </div>
          ))}
        </div>

        {/* ── ACTIONS ── */}
        <div style={{padding:'0 32px 20px',display:'flex',gap:8,flexWrap:'wrap'}}>
          <button className="btn btn-primary" style={{fontSize:12,letterSpacing:1}}
            onClick={()=>goLink(`https://opensea.io/collection/cc0mon?searchQuery=${encodeURIComponent(sp.name)}`)}>
            🌊 OPENSEA
          </button>
          <button className="btn" style={{fontSize:12}}
            onClick={()=>goLink(`https://etherscan.io/token/${CC0_CONTRACT}`)}>
            ⬡ ETHERSCAN
          </button>
          <div style={{marginLeft:'auto',fontFamily:'var(--ff-pixel)',fontSize:9,
            color:'var(--text3)',alignSelf:'center',letterSpacing:1}}>
            ← → NAVIGATE · ESC CLOSE
          </div>
        </div>

        <div style={{height:1,background:`linear-gradient(90deg,transparent,var(--border),transparent)`,margin:'0 32px'}}/>

        {/* ── TWO COLUMN LOWER ── */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:0,padding:'20px 32px 24px'}}>

          {/* Holders */}
          <div style={{paddingRight:16,borderRight:'1px solid var(--border)'}}>
            <div style={{fontFamily:'var(--ff-pixel)',fontSize:10,color:'var(--lime)',
              letterSpacing:2,marginBottom:10,display:'flex',alignItems:'center',gap:8}}>
              <span style={{color:'var(--green2)',fontSize:8}}>▶</span> HOLDERS ({holders.length})
            </div>
            {holders.length===0?(
              <div style={{fontFamily:'var(--ff-pixel)',fontSize:10,color:'var(--text3)',
                padding:'10px 0',lineHeight:2}}>NO HOLDERS IN LEADERBOARD DATA</div>
            ):(
              <div style={{display:'flex',flexDirection:'column',gap:3,maxHeight:220,overflowY:'auto'}}>
                {holders.slice(0,12).map((h,i)=>(
                  <div key={h.address} onClick={()=>goLink(`https://opensea.io/${h.address}`)}
                    style={{display:'flex',alignItems:'center',gap:8,padding:'6px 8px',
                      background:'var(--bg)',border:'1px solid var(--border)',
                      cursor:'pointer',transition:'border-color 0.1s,background 0.1s'}}
                    onMouseEnter={e=>{const el=e.currentTarget as HTMLElement;
                      el.style.borderColor=col;el.style.background=`${col}06`;}}
                    onMouseLeave={e=>{const el=e.currentTarget as HTMLElement;
                      el.style.borderColor='var(--border)';el.style.background='var(--bg)';}}>
                    <span style={{fontFamily:'var(--ff-pixel)',fontSize:9,width:20,flexShrink:0,
                      color:i===0?'var(--gold)':i===1?'var(--silver)':i===2?'var(--bronze)':'var(--text3)'}}>
                      #{i+1}
                    </span>
                    <span style={{fontFamily:'var(--ff-mono)',fontSize:12,color:'var(--text)',
                      flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                      {h.address.slice(0,8)}…{h.address.slice(-5)}
                    </span>
                    <span style={{fontFamily:'var(--ff-pixel)',fontSize:8,color:col,
                      padding:'1px 4px',border:`1px solid ${col}40`,flexShrink:0}}>
                      {h.totalHeld} held
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sales */}
          <div style={{paddingLeft:16}}>
            <div style={{fontFamily:'var(--ff-pixel)',fontSize:10,color:'var(--lime)',
              letterSpacing:2,marginBottom:10,display:'flex',alignItems:'center',gap:8}}>
              <span style={{color:'var(--green2)',fontSize:8}}>▶</span> RECENT SALES
            </div>
            {salesLoading?(
              <div style={{fontFamily:'var(--ff-pixel)',fontSize:10,color:'var(--text3)',padding:'10px 0'}}>
                LOADING…
              </div>
            ):sales.length===0?(
              <div style={{fontFamily:'var(--ff-pixel)',fontSize:10,color:'var(--text3)',
                padding:'10px 0',lineHeight:2.5}}>
                NO RECENT SALES<br/>
                <button className="btn btn-filter" style={{fontSize:10,marginTop:4}}
                  onClick={()=>goLink(`https://opensea.io/collection/cc0mon?searchQuery=${encodeURIComponent(sp.name)}`)}>
                  VIEW ON OPENSEA ▸
                </button>
              </div>
            ):(
              <div style={{display:'flex',flexDirection:'column',gap:4}}>
                {sales.map((s,i)=>(
                  <div key={i} style={{padding:'8px 10px',background:'var(--bg)',
                    border:'1px solid var(--border)'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',
                      marginBottom:3}}>
                      <span style={{fontFamily:'var(--ff-pixel)',fontSize:13,color:'var(--gold)'}}>
                        {s.price}
                      </span>
                      <span style={{fontFamily:'var(--ff-pixel)',fontSize:9,color:'var(--text3)'}}>
                        {s.date}
                      </span>
                    </div>
                    <div style={{fontFamily:'var(--ff-mono)',fontSize:10,color:'var(--text2)'}}>
                      {s.from} → {s.to}
                      {s.tx&&<button className="btn btn-filter" style={{fontSize:8,padding:'1px 5px',marginLeft:6}}
                        onClick={()=>goLink(`https://etherscan.io/tx/${s.tx}`)}>TX</button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Main inner component ── */
function LibraryInner() {
  const router=useRouter();
  const searchParams=useSearchParams();
  const [species,setSpecies]=useState<Species[]>([]);
  const [loading,setLoading]=useState(true);
  const [selected,setSelected]=useState<Species|null>(null);
  const [search,setSearch]=useState('');
  const [filterEnergy,setFilterEnergy]=useState('');
  const [filterRarity,setFilterRarity]=useState('');
  const [sortBy,setSortBy]=useState<'number'|'holders'|'rarity'>('number');
  const [holderMap,setHolderMap]=useState<Record<number,{address:string;totalHeld:number}[]>>({});
  const [confirm,setConfirm]=useState<string|null>(null);
  const [view,setView]=useState<'grid'|'list'>('grid');

  useEffect(()=>{ _dlgSetter=setConfirm; return()=>{ _dlgSetter=null; }; },[]);

  // Handle ?species= URL param
  useEffect(()=>{
    const num=searchParams.get('species');
    if (num&&species.length>0) {
      const sp=species.find(s=>s.number===parseInt(num));
      if (sp) setSelected(sp);
    }
  },[searchParams,species]);

  // Load species
  useEffect(()=>{
    Promise.all([
      fetch('https://api.cc0mon.com/registry').then(r=>r.json()),
      fetch('/api/registry').then(r=>r.json()),
    ]).then(([reg,imgs])=>{
      const imgMap=imgs.images||{};
      setSpecies((reg.cc0mon||[]).map((s:any)=>({
        ...s,
        png:imgMap[String(s.number)]?.png||'',
        svg:imgMap[String(s.number)]?.svg||'',
      })));
      setLoading(false);
    });
  },[]);

  // Build holder map with total tokens held per species
  useEffect(()=>{
    fetch('/api/leaderboard').then(r=>r.json()).then(data=>{
      const map:Record<number,{address:string;totalHeld:number}[]>={};
      for (const leader of (data.leaders||[])) {
        const nums=leader.collectedSpeciesNums||[];
        for (const n of nums) {
          if (!map[n]) map[n]=[];
          map[n].push({ address:leader.address, totalHeld:leader.totalTokensHeld||0 });
        }
      }
      // Sort each species holders by total tokens held desc
      for (const n of Object.keys(map)) {
        map[parseInt(n)].sort((a,b)=>b.totalHeld-a.totalHeld);
      }
      setHolderMap(map);
    }).catch(()=>{});
  },[]);

  const energyList=Array.from(new Set(species.map(s=>s.energy))).sort();
  const filtered=species.filter(sp=>{
    const q=search.toLowerCase();
    if (q&&!sp.name.toLowerCase().includes(q)&&!String(sp.number).includes(q)&&!sp.energy.toLowerCase().includes(q)) return false;
    if (filterEnergy&&sp.energy!==filterEnergy) return false;
    if (filterRarity&&sp.rarity!==filterRarity) return false;
    return true;
  }).slice().sort((a,b)=>{
    if (sortBy==='holders') return (holderMap[b.number]?.length??0)-(holderMap[a.number]?.length??0);
    if (sortBy==='rarity') return (RARITY_SORT_ORDER[a.rarity]??5)-(RARITY_SORT_ORDER[b.rarity]??5);
    return a.number-b.number;
  });

  const selectSpecies=(sp:Species)=>{
    setSelected(sp);
    router.replace(`/library?species=${sp.number}`,{scroll:false});
  };
  const closeModal=()=>{
    setSelected(null);
    router.replace('/library',{scroll:false});
  };
  const navSpecies=(n:number)=>{
    const sp=species.find(s=>s.number===n);
    if (sp) { setSelected(sp); router.replace(`/library?species=${n}`,{scroll:false}); }
  };

  const totalWithHolders=Object.values(holderMap).filter(v=>v.length>0).length;

  return (
    <div style={{background:'var(--black)',color:'var(--text)',minHeight:'100vh',fontFamily:'var(--ff-mono)'}}>
      <div style={{position:'fixed',top:0,left:0,right:0,height:3,zIndex:9996,pointerEvents:'none',
        background:'linear-gradient(180deg,transparent,rgba(124,232,50,0.06),transparent)',
        animation:'scanline 8s linear infinite',opacity:0.7}}/>

      {confirm&&<ConfirmDlg url={confirm}
        onOk={()=>{window.open(confirm,'_blank','noopener');setConfirm(null);}}
        onNo={()=>setConfirm(null)}/>}

      {/* ── HEADER ── */}
      <header style={{background:'var(--bg2)',borderBottom:'2px solid var(--green1)',position:'sticky',top:0,zIndex:100}}>
        {/* top strip */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
          padding:'8px 24px',borderBottom:'1px solid var(--border)',background:'var(--bg)'}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <button className="btn btn-filter" onClick={()=>router.push('/')}
              style={{fontSize:11,letterSpacing:1,gap:5}}>← LEADERBOARD</button>
            <span style={{fontFamily:'var(--ff-pixel)',fontSize:9,color:'var(--text3)',letterSpacing:2}}>
              ▶ CC0MON LIBRARY
            </span>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <div style={{width:6,height:6,background:'var(--lime)',
              boxShadow:'0 0 8px var(--lime)',animation:'pulse 1.5s ease-in-out infinite'}}/>
            <span style={{fontFamily:'var(--ff-pixel)',fontSize:10,color:'var(--lime)',letterSpacing:2}}>LIVE</span>
          </div>
        </div>

        {/* title + stats */}
        <div style={{padding:'16px 24px 0',display:'flex',alignItems:'flex-end',gap:24,flexWrap:'wrap'}}>
          <div>
            <div style={{position:'relative',marginBottom:4}}>
              {['rgba(255,0,80,0.1)','rgba(0,220,255,0.1)'].map((c,i)=>(
                <div key={i} style={{position:'absolute',top:0,left:0,
                  fontFamily:'var(--ff-pixel)',fontSize:'clamp(24px,4vw,40px)',
                  color:c,letterSpacing:2,transform:`translateX(${i?2:-2}px)`,
                  pointerEvents:'none',userSelect:'none'}}>CC0MON LIBRARY</div>
              ))}
              <div style={{fontFamily:'var(--ff-pixel)',fontSize:'clamp(24px,4vw,40px)',
                color:'var(--bright)',letterSpacing:2,
                textShadow:'0 0 12px var(--lime),0 0 32px rgba(124,232,50,0.4),3px 3px 0 rgba(0,0,0,0.8)'}}>
                CC0MON LIBRARY
              </div>
            </div>
            <div style={{fontFamily:'var(--ff-pixel)',fontSize:10,color:'var(--text3)',
              letterSpacing:2,marginBottom:14}}>
              {species.length} SPECIES · {totalWithHolders} HAVE HOLDERS
            </div>
          </div>
          {/* quick rarity legend */}
          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:14,marginLeft:'auto'}}>
            {RARITY_ORDER.map(r=>(
              <div key={r} onClick={()=>setFilterRarity(filterRarity===r?'':r)}
                style={{display:'flex',alignItems:'center',gap:5,cursor:'pointer',
                  opacity:filterRarity&&filterRarity!==r?0.3:1,transition:'opacity 0.1s'}}>
                <div style={{width:7,height:7,background:RC[r],boxShadow:`0 0 5px ${RC[r]}`}}/>
                <span style={{fontFamily:'var(--ff-pixel)',fontSize:8,color:RC[r],letterSpacing:0.5}}>
                  {r.toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* search + filters */}
        <div style={{padding:'0 24px 12px',display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
          <input type="text" placeholder="SEARCH NAME, #, ENERGY..." value={search}
            onChange={e=>setSearch(e.target.value)}
            style={{fontFamily:'var(--ff-pixel)',fontSize:11,background:'var(--bg)',
              border:'1px solid var(--border)',color:'var(--text)',padding:'7px 12px',
              outline:'none',width:220,letterSpacing:0.5,transition:'border-color 0.1s'}}
            onFocus={e=>e.target.style.borderColor='var(--lime)'}
            onBlur={e=>e.target.style.borderColor='var(--border)'}/>

          <select value={filterEnergy} onChange={e=>setFilterEnergy(e.target.value)}
            style={{fontFamily:'var(--ff-pixel)',fontSize:10,background:'var(--bg)',
              border:'1px solid var(--border)',color:'var(--text2)',padding:'7px 10px',cursor:'pointer'}}>
            <option value="">ALL ENERGIES</option>
            {energyList.map(e=><option key={e} value={e}>{e.toUpperCase()}</option>)}
          </select>

          <select value={filterRarity} onChange={e=>setFilterRarity(e.target.value)}
            style={{fontFamily:'var(--ff-pixel)',fontSize:10,background:'var(--bg)',
              border:'1px solid var(--border)',color:'var(--text2)',padding:'7px 10px',cursor:'pointer'}}>
            <option value="">ALL RARITIES</option>
            {RARITY_ORDER.map(r=><option key={r} value={r}>{r.toUpperCase()}</option>)}
          </select>

          {(search||filterEnergy||filterRarity)&&(
            <button className="btn btn-filter"
              onClick={()=>{setSearch('');setFilterEnergy('');setFilterRarity('');}}
              style={{fontSize:10}}>✕ CLEAR</button>
          )}

          <div style={{display:'flex',gap:4,marginLeft:4,alignItems:'center'}}>
            <span style={{fontFamily:'var(--ff-pixel)',fontSize:9,color:'var(--text3)',letterSpacing:1,marginRight:2}}>SORT:</span>
            <button className={`btn btn-filter${sortBy==='number'?' active':''}`}
              onClick={()=>setSortBy('number')} style={{fontSize:9,letterSpacing:1,padding:'5px 8px'}}>
              # DEX
            </button>
            <button className={`btn btn-filter${sortBy==='holders'?' active':''}`}
              onClick={()=>setSortBy('holders')} style={{fontSize:9,letterSpacing:1,padding:'5px 8px'}}>
              ◈ HOLDERS
            </button>
            <button className={`btn btn-filter${sortBy==='rarity'?' active':''}`}
              onClick={()=>setSortBy('rarity')} style={{fontSize:9,letterSpacing:1,padding:'5px 8px'}}>
              ★ RARITY
            </button>
          </div>
          <div style={{display:'flex',gap:4,marginLeft:4}}>
            {(['grid','list'] as const).map(v=>(
              <button key={v} className={`btn btn-filter${view===v?' active':''}`}
                onClick={()=>setView(v)} style={{fontSize:10,padding:'5px 10px'}}>
                {v==='grid'?'▦ GRID':'☰ LIST'}
              </button>
            ))}
          </div>

          <div style={{marginLeft:'auto',fontFamily:'var(--ff-pixel)',fontSize:10,color:'var(--text2)'}}>
            {filtered.length}/{species.length}
          </div>
        </div>
      </header>

      {/* ── GRID / LIST ── */}
      <main style={{padding:'20px 24px',maxWidth:1600,margin:'0 auto',
        backgroundImage:'radial-gradient(circle,var(--green0) 1px,transparent 1px)',
        backgroundSize:'28px 28px'}}>

        {loading?(
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(120px,1fr))',gap:8}}>
            {Array.from({length:52}).map((_,i)=>(
              <div key={i} className="skeleton" style={{height:152,animationDelay:`${i*20}ms`}}/>
            ))}
          </div>
        ):view==='grid'?(
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(120px,1fr))',gap:8}}>
            {filtered.map(sp=>(
              <Card key={sp.number} sp={sp} holders={holderMap[sp.number]?.length??0}
                onClick={()=>selectSpecies(sp)}/>
            ))}
          </div>
        ):(
          /* List view */
          <div style={{display:'flex',flexDirection:'column',gap:3}}>
            <div style={{display:'grid',gridTemplateColumns:'40px 80px 1fr 100px 80px 80px 80px',
              gap:8,padding:'6px 12px',fontFamily:'var(--ff-pixel)',fontSize:9,
              color:'var(--text3)',letterSpacing:1.5,borderBottom:'2px solid var(--green1)'}}>
              <span>#</span><span>SPRITE</span><span>NAME</span>
              <span>ENERGY</span><span>RARITY</span><span>SUPPLY</span><span>HOLDERS</span>
            </div>
            {filtered.map(sp=>{
              const col=EC[sp.energy]||'#7ee832';
              const rc=RC[sp.rarity]||'#90c880';
              return (
                <div key={sp.number} onClick={()=>selectSpecies(sp)}
                  style={{display:'grid',gridTemplateColumns:'40px 80px 1fr 100px 80px 80px 80px',
                    gap:8,padding:'6px 12px',alignItems:'center',
                    cursor:'pointer',border:'1px solid transparent',transition:'all 0.1s',
                    background:'var(--panel)'}}
                  onMouseEnter={e=>{const el=e.currentTarget as HTMLElement;
                    el.style.borderColor=col+'40';el.style.background=`${col}06`;}}
                  onMouseLeave={e=>{const el=e.currentTarget as HTMLElement;
                    el.style.borderColor='transparent';el.style.background='var(--panel)';}}>
                  <span style={{fontFamily:'var(--ff-pixel)',fontSize:9,color:'var(--text3)'}}>
                    #{String(sp.number).padStart(3,'0')}
                  </span>
                  <Sprite src={sp.png||sp.svg||''} name={sp.name} size={40}/>
                  <span style={{fontFamily:'var(--ff-pixel)',fontSize:11,color:'var(--text)'}}>{sp.name}</span>
                  <span style={{fontFamily:'var(--ff-pixel)',fontSize:9,color:col}}>{sp.energy}</span>
                  <span style={{fontFamily:'var(--ff-pixel)',fontSize:9,color:rc}}>{sp.rarity}</span>
                  <span style={{fontFamily:'var(--ff-pixel)',fontSize:9,color:'var(--bright)'}}>~{SUPPLY_EST[sp.rarity]||'—'}</span>
                  <span style={{fontFamily:'var(--ff-pixel)',fontSize:9,color:'var(--lime)'}}>
                    {holderMap[sp.number]?.length||'—'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {selected&&(
        <DetailModal sp={selected}
          holderMap={holderMap}
          allSpecies={species}
          onClose={closeModal}
          onNav={navSpecies}/>
      )}
    </div>
  );
}

export default function LibraryPage() {
  return <Suspense><LibraryInner/></Suspense>;
}
