'use client';
import { useEffect, useState, Suspense, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

function useMobile() {
  const [m,setM] = useState(false);
  useEffect(()=>{
    const check=()=>setM(window.innerWidth<700);
    check(); window.addEventListener('resize',check);
    return()=>window.removeEventListener('resize',check);
  },[]);
  return m;
}

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



let _dlgSetter: ((url:string|null)=>void)|null = null;
function goLink(url: string) { _dlgSetter?.(url); }

interface Species { number:number; name:string; energy:string; rarity:string; png?:string; svg?:string; }

/* ── Shared confirm dialog ── */
function ConfirmDlg({url,onOk,onNo}:{url:string;onOk:()=>void;onNo:()=>void}) {
  return (
    <div style={{position:'fixed',inset:0,zIndex:99999,background:'rgba(0,0,0,0.82)',display:'flex',
      alignItems:'center',justifyContent:'center'}} onClick={onNo}>
      <div style={{background:'var(--bg2)',border:'2px solid var(--lime)',padding:'28px 32px',
        maxWidth:380,width:'90%',animation:'fadeUp 0.18s ease'}} onClick={e=>e.stopPropagation()}>
        <div style={{textAlign:'center',marginBottom:20}}>
          <div style={{fontSize:30,marginBottom:10}}>🌊</div>
          <div style={{fontFamily:'var(--font-press-start)',fontSize:12,color:'var(--lime-glow)',letterSpacing:2,marginBottom:8}}>OPENING OPENSEA</div>
          <div style={{fontFamily:'var(--font-plex-mono)',fontSize:11,color:'var(--text)',wordBreak:'break-all',
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

/* Proxy CC0mon images through our CDN cache */
function libProxyUrl(src: string): string {
  if (!src || !src.startsWith('https://api.cc0mon.com/')) return src;
  return '/api/sprite?url=' + encodeURIComponent(src);
}

/* ── Session cache — same URL = instant render after first load ── */
const libLoadedUrls = new Set<string>();

/* ── Sprite ── */
function Sprite({src,name,size=56,dimmed=false}:{src:string;name:string;size?:number;dimmed?:boolean}) {
  const p=libProxyUrl(src);
  const [s,setS]=useState<'l'|'ok'|'err'>(!src?'err':libLoadedUrls.has(p)?'ok':'l');
  return (
    <div style={{width:size,height:size,position:'relative',flexShrink:0,imageRendering:'pixelated'}}>
      {s==='l'&&<div className="skeleton" style={{position:'absolute',inset:0}}/>}
      {s==='err'&&<div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',
        justifyContent:'center',fontSize:size*0.28,color:'var(--text3)',opacity:0.4}}>?</div>}
      {src&&<img src={p} alt={name} width={size} height={size} loading="eager" decoding="async"
        onLoad={()=>{ libLoadedUrls.add(p); setS('ok'); }} onError={()=>setS('err')}
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
  
  return (
    <div onClick={onClick} className={`species-card-wrap card-${sp.energy.toLowerCase()} rarity-${sp.rarity.toLowerCase()}`}>
      <div className="holo-sheen"/>
      <div className="card-accent-bar" style={{'--card-col': col} as React.CSSProperties}/>
      
      <div className="card-header">
        <div className="species-num-badge">#{String(sp.number).padStart(3,'0')}</div>
        <div className={`rarity-dot-${sp.rarity.toLowerCase()}`} style={{backgroundColor: rc}}/>
      </div>
      
      <div className="sprite-container">
        <div className="sprite-bg" style={{'--card-col': col} as React.CSSProperties}/>
        <Sprite src={sp.png||sp.svg||''} name={sp.name} size={68}/>
      </div>
      
      <div className="card-footer">
        <div className="species-name">{sp.name}</div>
        <div className="species-energy" style={{color: col, borderColor: `${col}50`, backgroundColor: `${col}12`}}>
          {sp.energy.toUpperCase()}
        </div>
        <div className="species-holders">
          {holders > 0 ? `${holders} holders` : '—'}
        </div>
      </div>
    </div>
  );
}

/* ── Detail Modal ── */
function DetailModal({sp,holderMap,supplyMap,setHolderMap,descMap,mobile,allSpecies,onClose,onNav}:{
  sp:Species; holderMap:Record<number,{address:string;tokenCount?:number}[]>; supplyMap:Record<number,number>; setHolderMap:React.Dispatch<React.SetStateAction<Record<number,{address:string;tokenCount?:number}[]>>>; descMap:Record<number,string>; mobile?:boolean;
  allSpecies:Species[]; onClose:()=>void; onNav:(n:number)=>void;
}) {
  const desc = descMap[sp.number] || '';
  const col=EC[sp.energy]||'#7ee832';
  const rc=RC[sp.rarity]||'#90c880';
  // Real supply from blob (populated after Admin Scan) — or count from leaderboard holders as minimum
  const supply = supplyMap[sp.number] != null 
    ? supplyMap[sp.number] 
    : null; // null = not yet computed
  const holders=holderMap[sp.number]||[];

  // prev/next navigation
  const idx=allSpecies.findIndex(s=>s.number===sp.number);
  const prev=idx>0?allSpecies[idx-1]:null;
  const next=idx<allSpecies.length-1?allSpecies[idx+1]:null;

  // Fetch per-species token counts — sequential with delay to avoid rate limits
  useEffect(()=>{
    const holdersForSp = holderMap[sp.number]||[];
    if (!holdersForSp.length) return;
    let cancelled = false;
    (async () => {
      const counts:Record<string,number>={};
      // Fetch in batches of 5 with 1s delay between batches
      const BATCH = 5;
      for (let i=0; i<holdersForSp.length && !cancelled; i+=BATCH) {
        const batch = holdersForSp.slice(i, i+BATCH);
        await Promise.allSettled(batch.map(async h=>{
          try {
            const r=await fetch(`https://api.cc0mon.com/collector/${h.address}`,
              {signal:AbortSignal.timeout(8000)});
            if (!r.ok) return;
            const d=await r.json();
            const spData=d.checklist?.find((s:any)=>s.number===sp.number);
            counts[h.address]=spData?.tokenIds?.length??1;
          } catch {}
        }));
        // Update display after each batch
        if (!cancelled && Object.keys(counts).length > 0) {
          setHolderMap(prev=>{
            const updated=[...(prev[sp.number]||[])].map(h=>({
              ...h, tokenCount: counts[h.address] ?? h.tokenCount
            })).sort((a,b)=>(b.tokenCount??0)-(a.tokenCount??0));
            return {...prev,[sp.number]:updated};
          });
        }
        if (i+BATCH < holdersForSp.length) await new Promise(r=>setTimeout(r,1100));
      }
    })();
    return ()=>{ cancelled=true; };
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
      display:'flex',alignItems:mobile?'flex-start':'center',justifyContent:'center',
      backdropFilter:'blur(4px)',animation:'fadeIn 0.12s ease',
      overflowY:mobile?'auto':'hidden'}} onClick={onClose}>
      <div style={{
        background:`linear-gradient(160deg, var(--bg2) 0%, var(--bg) 100%)`,
        border:`2px solid ${col}50`,
        boxShadow:`0 0 80px ${col}10, 0 0 0 1px ${col}15, 0 24px 80px rgba(0,0,0,0.9)`,
        maxWidth:780,width:'96%',
        maxHeight:mobile?'none':'90vh',
        overflowY:mobile?'visible':'auto',
        marginTop:mobile?0:'auto',marginBottom:mobile?0:'auto',
        position:'relative',animation:'fadeUp 0.2s ease',
        flexShrink:0,
      }} onClick={e=>e.stopPropagation()}>

        {/* Full-width top energy bar */}
        <div style={{height:4,background:`linear-gradient(90deg,${col}30,${col},${col}30)`}}/>

        {/* Sticky top bar on mobile: close + nav arrows always accessible */}
        <div style={{
          display:'flex',alignItems:'center',justifyContent:'space-between',
          padding:'8px 12px',
          background:'var(--bg)',
          borderBottom:`1px solid ${col}20`,
          position:mobile?'sticky':'relative',top:mobile?0:undefined,
          zIndex:10,
        }}>
          {/* ← prev */}
          <button onClick={e=>{e.stopPropagation();prev&&onNav(prev.number);}}
            disabled={!prev}
            style={{background:'transparent',border:`1px solid ${prev?col+'40':'var(--border)'}`,
              color:prev?col:'var(--text3)',fontFamily:'var(--ff-pixel)',fontSize:mobile?14:18,
              cursor:prev?'pointer':'default',padding:'4px 10px',opacity:prev?1:0.3,
              transition:'all 0.1s'}}>‹ PREV</button>

          {/* Close — always visible in center on mobile */}
          <button onClick={onClose} style={{
            background:'transparent',border:'1px solid var(--border)',color:'var(--text3)',
            fontFamily:'var(--ff-pixel)',fontSize:11,cursor:'pointer',padding:'4px 12px',
            transition:'all 0.1s'}}
            onMouseEnter={e=>{const el=e.currentTarget as HTMLElement;el.style.borderColor='var(--red)';el.style.color='var(--red)';}}
            onMouseLeave={e=>{const el=e.currentTarget as HTMLElement;el.style.borderColor='var(--border)';el.style.color='var(--text3)';}}>
            ESC ✕
          </button>

          {/* next → */}
          <button onClick={e=>{e.stopPropagation();next&&onNav(next.number);}}
            disabled={!next}
            style={{background:'transparent',border:`1px solid ${next?col+'40':'var(--border)'}`,
              color:next?col:'var(--text3)',fontFamily:'var(--ff-pixel)',fontSize:mobile?14:18,
              cursor:next?'pointer':'default',padding:'4px 10px',opacity:next?1:0.3,
              transition:'all 0.1s'}}>NEXT ›</button>
        </div>

        {/* ── HERO ── */}
        <div style={{padding:mobile?'12px 16px 0':'20px 32px 0',display:'flex',gap:mobile?12:24,alignItems:'flex-start',flexWrap:'wrap'}}>
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
              <Sprite src={sp.png||sp.svg||''} name={sp.name} size={mobile?88:148}/>
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
              <div className="species-description" style={{fontFamily:'var(--ff-mono)',fontSize:13,color:'var(--text)',
                lineHeight:1.8,fontStyle:'italic',opacity:0.9,maxWidth:420,
                borderLeft:`2px solid ${col}60`,paddingLeft:12}}>
                "{desc}"
              </div>
            )}
          </div>
        </div>

        {/* ── STAT TILES ── */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:6,padding:mobile?'10px 16px 12px':'20px 32px 16px'}}>
          {([
            [holders.length||'—','HOLDERS',col],
            [supply!=null?String(supply):'RUN SCAN','SUPPLY','var(--bright)'],
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
        <div style={{padding:mobile?'0 16px 14px':'0 32px 20px',display:'flex',gap:8,flexWrap:'wrap'}}>
          <button className="btn btn-primary btn-opensea" style={{fontSize:12,letterSpacing:1}}
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
        <div style={{display:'flex',flexDirection:'column',gap:0,padding:mobile?'12px 16px 20px':'20px 32px 24px'}}>

          {/* Holders */}
          <div style={{paddingRight:0}}>
            <div style={{fontFamily:'var(--ff-pixel)',fontSize:10,color:'var(--lime)',
              letterSpacing:2,marginBottom:10,display:'flex',alignItems:'center',gap:8}}>
              <span style={{color:'var(--green2)',fontSize:8}}>▶</span> HOLDERS ({holders.length})
            </div>
            {holders.length===0?(
              <div style={{fontFamily:'var(--ff-pixel)',fontSize:10,color:'var(--text3)',
                padding:'10px 0',lineHeight:2}}>NO HOLDERS IN LEADERBOARD DATA</div>
            ):(
              <div style={{display:'flex',flexDirection:'column',gap:3,maxHeight:mobile?140:220,overflowY:'auto'}}>
                {holders.slice(0,12).map((h,i)=>(
                  <div key={h.address} className="holder-row" onClick={()=>goLink(`https://opensea.io/${h.address}`)}
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
                    {h.tokenCount!=null&&<span style={{fontFamily:'var(--ff-pixel)',fontSize:9,
                      color:col,padding:'1px 5px',border:`1px solid ${col}40`,
                      background:`${col}10`,flexShrink:0}}>
                      ×{h.tokenCount}
                    </span>}
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
  const mobile=useMobile();
  const searchParams=useSearchParams();
  const [species,setSpecies]=useState<Species[]>([]);
  const [loading,setLoading]=useState(true);
  const [selected,setSelected]=useState<Species|null>(null);
  const [search,setSearch]=useState('');
  const [filterEnergy,setFilterEnergy]=useState('');
  const [filterRarity,setFilterRarity]=useState('');
  const [sortBy,setSortBy]=useState<'number'|'holders'>('number');
  const [holderMap,setHolderMap]=useState<Record<number,{address:string;tokenCount?:number}[]>>({});
  const [supplyMap,setSupplyMap]=useState<Record<number,number>>({});
  const [descMap,setDescMap]=useState<Record<number,string>>({});
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
      const map:Record<number,{address:string}[]>={};
      for (const leader of (data.leaders||[])) {
        const nums=leader.collectedSpeciesNums||[];
        for (const n of nums) {
          if (!map[n]) map[n]=[];
          map[n].push({ address:leader.address });
        }
      }
      setHolderMap(map);
    }).catch(()=>{});

    // Fetch real supply counts (computed from all holder tokenIds)
    fetch('/api/supply').then(r=>r.json()).then(d=>{
      setSupplyMap(d||{});
    }).catch(()=>{});

    // Fetch all species descriptions (server-cached, 7-day TTL)
    fetch('/api/desc').then(r=>r.json()).then(d=>{
      setDescMap(d||{});
    }).catch(()=>{});
  },[]);

  const energyList=Array.from(new Set(species.map(s=>s.energy))).sort();
  const sorted = species.filter(sp=>{
    const q=search.toLowerCase();
    if (q&&!sp.name.toLowerCase().includes(q)&&!String(sp.number).includes(q)&&!sp.energy.toLowerCase().includes(q)) return false;
    if (filterEnergy&&sp.energy!==filterEnergy) return false;
    if (filterRarity&&sp.rarity!==filterRarity) return false;
    return true;
  }).slice().sort((a,b)=>{
    if (sortBy==='holders') return (holderMap[b.number]?.length??0)-(holderMap[a.number]?.length??0);
    return a.number-b.number;
  });

  const handleSelect = (sp: Species) => {
    setSelected(sp);
    router.push(`/library?species=${sp.number}`, { scroll: false });
  };

  const handleClose = () => {
    setSelected(null);
    router.push('/library', { scroll: false });
  };

  return (
    <div className="library-container">
      <header className="library-header">
        <h1>Species Library</h1>
        <p>Explore the rich biodiversity of the cc0mon world.</p>
        <button className="btn" onClick={() => router.push('/')}>
          Back to Leaderboard
        </button>
      </header>

      {/* Filters */}
      <div className="filters">
        <input
          type="text"
          placeholder="Search by name, number, or energy..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="filter-search"
        />
        <select value={filterEnergy} onChange={(e) => setFilterEnergy(e.target.value)} className="filter-select">
          <option value="">All Energies</option>
          {energyList.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
        <select value={filterRarity} onChange={(e) => setFilterRarity(e.target.value)} className="filter-select">
          <option value="">All Rarities</option>
          {RARITY_ORDER.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className="filter-select">
          <option value="number">Sort by Number</option>
          <option value="holders">Sort by Holders</option>
        </select>
      </div>

      {loading ? (
        <div style={{textAlign:'center', padding:'40px', fontFamily:'var(--font-press-start)', fontSize:20, color:'var(--lime)'}}>LOADING SPECIES...</div>
      ) : (
        <div className="species-grid">
          {sorted.map(sp => (
            <Card key={sp.number} sp={sp} holders={holderMap[sp.number]?.length || 0} onClick={() => handleSelect(sp)} />
          ))}
        </div>
      )}

      {selected && (
        <DetailModal
          sp={selected}
          holderMap={holderMap}
          supplyMap={supplyMap}
          setHolderMap={setHolderMap}
          descMap={descMap}
          mobile={mobile}
          allSpecies={sorted}
          onClose={handleClose}
          onNav={(num) => {
            const sp = sorted.find(s => s.number === num);
            if (sp) handleSelect(sp);
          }}
        />
      )}

      {confirm && <ConfirmDlg url={confirm} onOk={()=>{window.open(confirm,'_blank');setConfirm(null);}} onNo={()=>setConfirm(null)}/>}
    </div>
  );
}

export default function LibraryPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LibraryInner />
    </Suspense>
  );
}
