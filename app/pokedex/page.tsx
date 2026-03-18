'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

const CC0_CONTRACT = '0xeeb036dbbd3039429c430657ed9836568da79d5f';
const ENERGY_COLORS: Record<string,string> = {
  Fire:'#ff6030',Ice:'#80e8ff',Grass:'#a0ff60',Electric:'#ffe040',Ghost:'#c080ff',
  Dragon:'#6080ff',Metal:'#a0c8d0',Toxic:'#a0ff20',Rock:'#c0a860',Bug:'#80d040',
  Ocean:'#40b0ff',Earth:'#c09040',Underworld:'#8840c0',Mythic:'#ff80c0',
  Celestial:'#ffd880',Fossil:'#d0b888',
};
const RARITY_COLORS: Record<string,string> = {
  Common:'#90c880', Uncommon:'#7ee832', Rare:'#40b0ff', Epic:'#c080ff', Legendary:'#ffd040',
};
const RARITY_ORDER = ['Common','Uncommon','Rare','Epic','Legendary'];

let _confirmSetter: ((url:string|null)=>void)|null = null;
function openWithConfirm(url: string) { _confirmSetter?.(url); }

interface Species {
  number: number; name: string; energy: string; rarity: string;
  png?: string; svg?: string;
}

function Sprite({ src, name, size=56 }: { src:string; name:string; size?:number }) {
  const [ok, setOk] = useState(false);
  useEffect(()=>{
    if (!src) return;
    const img = new window.Image(); img.onload=()=>setOk(true); img.src=src;
  },[src]);
  return (
    <div style={{width:size,height:size,position:'relative',imageRendering:'pixelated',flexShrink:0}}>
      {!ok&&<div className="skeleton" style={{position:'absolute',inset:0}}/>}
      {src&&<img src={src} alt={name} width={size} height={size} loading="eager"
        style={{imageRendering:'pixelated',opacity:ok?1:0,transition:'opacity 0.2s',display:'block'}}/>}
    </div>
  );
}

function SpeciesCard({sp,holderCount,onClick}:{sp:Species;holderCount:number;onClick:()=>void}) {
  const col = ENERGY_COLORS[sp.energy]||'var(--lime)';
  const rc  = RARITY_COLORS[sp.rarity]||'var(--text2)';
  return (
    <div onClick={onClick} style={{
      background:'linear-gradient(160deg,var(--bg3) 0%,var(--panel) 100%)',
      border:`1px solid ${col}22`,cursor:'pointer',position:'relative',overflow:'hidden',
      transition:'transform 0.12s,box-shadow 0.12s,border-color 0.12s',
    }}
      onMouseEnter={e=>{const el=e.currentTarget as HTMLElement; el.style.transform='translateY(-3px)'; el.style.boxShadow=`0 8px 24px ${col}20`; el.style.borderColor=`${col}60`;}}
      onMouseLeave={e=>{const el=e.currentTarget as HTMLElement; el.style.transform=''; el.style.boxShadow=''; el.style.borderColor=`${col}22`;}}>
      <div style={{position:'absolute',top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,transparent,${col}80,transparent)`}}/>
      <div style={{position:'absolute',top:6,left:7,fontFamily:'var(--ff-pixel)',fontSize:9,color:'var(--text3)'}}>#{sp.number}</div>
      <div style={{position:'absolute',top:7,right:7,width:6,height:6,background:rc,boxShadow:`0 0 5px ${rc}`}}/>
      <div style={{padding:'24px 8px 10px',display:'flex',flexDirection:'column',alignItems:'center',gap:5}}>
        <Sprite src={sp.png||sp.svg||''} name={sp.name} size={64}/>
        <div style={{fontFamily:'var(--ff-pixel)',fontSize:9,color:'var(--text)',textAlign:'center',
          whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',width:'100%',paddingInline:2}}>
          {sp.name}
        </div>
        <div style={{fontFamily:'var(--ff-pixel)',fontSize:8,color:col,padding:'1px 5px',
          border:`1px solid ${col}40`,background:`${col}10`}}>{sp.energy.toUpperCase()}</div>
        {holderCount>0&&<div style={{fontFamily:'var(--ff-pixel)',fontSize:8,color:'var(--text3)'}}>{holderCount} holders</div>}
      </div>
    </div>
  );
}

function ConfirmDialog({url,onConfirm,onCancel}:{url:string;onConfirm:()=>void;onCancel:()=>void}) {
  return (
    <div style={{position:'fixed',inset:0,zIndex:99999,background:'rgba(0,0,0,0.8)',display:'flex',
      alignItems:'center',justifyContent:'center',animation:'fadeIn 0.15s ease'}} onClick={onCancel}>
      <div style={{background:'var(--bg2)',border:'2px solid var(--green2)',boxShadow:'0 0 40px rgba(124,232,50,0.2)',
        padding:'28px 32px',maxWidth:380,width:'90%',animation:'fadeUp 0.2s ease'}} onClick={e=>e.stopPropagation()}>
        <div style={{textAlign:'center',marginBottom:20}}>
          <div style={{fontSize:32,marginBottom:10}}>🌊</div>
          <div style={{fontFamily:'var(--ff-pixel)',fontSize:13,color:'var(--bright)',letterSpacing:2,marginBottom:8}}>OPENING OPENSEA</div>
          <div style={{fontFamily:'var(--ff-mono)',fontSize:11,color:'var(--text2)',wordBreak:'break-all',
            background:'var(--bg)',border:'1px solid var(--border)',padding:'6px 10px'}}>{url}</div>
        </div>
        <div style={{display:'flex',gap:10}}>
          <button className="btn btn-primary" onClick={onConfirm} style={{flex:1,justifyContent:'center'}}>✓ CONFIRM</button>
          <button className="btn btn-danger" onClick={onCancel} style={{flex:1,justifyContent:'center'}}>✕ CANCEL</button>
        </div>
      </div>
    </div>
  );
}

function DetailModal({sp,holderCount,holderList,onClose}:{sp:Species;holderCount:number;holderList:string[];onClose:()=>void}) {
  const [description,setDescription]=useState('');
  const [sales,setSales]=useState<any[]>([]);
  const [salesLoading,setSalesLoading]=useState(true);
  const col=ENERGY_COLORS[sp.energy]||'var(--lime)';
  const rc=RARITY_COLORS[sp.rarity]||'var(--text2)';
  const estSupply=Math.round(9999/260*({Common:1.8,Uncommon:1.1,Rare:0.65,Epic:0.3,Legendary:0.15}[sp.rarity]||1));

  useEffect(()=>{
    // Load description from a sample token
    fetch('https://api.cc0mon.com/registry/images').then(r=>r.json()).then(d=>{
      const tokenId = d.images?.[String(sp.number)]?.tokenId;
      if (!tokenId) return;
      fetch(`https://api.cc0mon.com/cc0mon/${tokenId}`).then(r=>r.json()).then(t=>{
        setDescription(t.description||'');
      }).catch(()=>{});
    }).catch(()=>{});

    // Load recent sales via OpenSea API
    fetch('https://api.cc0mon.com/registry/images').then(r=>r.json()).then(d=>{
      const tokenId = d.images?.[String(sp.number)]?.tokenId;
      if (!tokenId) { setSalesLoading(false); return; }
      fetch(`https://api.opensea.io/api/v2/events/chain/ethereum/contract/${CC0_CONTRACT}/nfts/${tokenId}?event_type=sale&limit=5`,
        {headers:{accept:'application/json'}})
        .then(r=>r.json())
        .then(data=>{
          setSales((data.asset_events||[]).map((e:any)=>({
            price: e.payment?(parseFloat(e.payment.quantity)/1e18).toFixed(4)+' ETH':'—',
            from: e.seller?e.seller.slice(0,6)+'…'+e.seller.slice(-4):'—',
            to:   e.buyer ?e.buyer.slice(0,6) +'…'+e.buyer.slice(-4) :'—',
            date: e.closing_date?new Date(e.closing_date*1000).toLocaleDateString():'—',
            tx:   e.transaction||'',
          })));
          setSalesLoading(false);
        }).catch(()=>setSalesLoading(false));
    }).catch(()=>setSalesLoading(false));
  },[sp.number]);

  return (
    <div style={{position:'fixed',inset:0,zIndex:9998,background:'rgba(0,0,0,0.85)',
      display:'flex',alignItems:'center',justifyContent:'center',
      animation:'fadeIn 0.15s ease',backdropFilter:'blur(3px)'}} onClick={onClose}>
      <div style={{background:'var(--bg2)',border:`2px solid ${col}60`,
        boxShadow:`0 0 60px ${col}12,0 20px 60px rgba(0,0,0,0.8)`,
        maxWidth:720,width:'94%',maxHeight:'90vh',overflowY:'auto',
        position:'relative',animation:'fadeUp 0.2s ease'}} onClick={e=>e.stopPropagation()}>
        {/* top glow bar */}
        <div style={{position:'absolute',top:0,left:0,right:0,height:3,background:`linear-gradient(90deg,transparent,${col},transparent)`}}/>
        {/* close */}
        <button onClick={onClose} style={{position:'absolute',top:12,right:14,background:'transparent',
          border:'1px solid var(--border)',color:'var(--text2)',fontFamily:'var(--ff-pixel)',
          fontSize:12,cursor:'pointer',padding:'3px 10px',transition:'all 0.1s',zIndex:2}}
          onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor='var(--red)';(e.currentTarget as HTMLElement).style.color='var(--red)';}}
          onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor='var(--border)';(e.currentTarget as HTMLElement).style.color='var(--text2)';}}>✕</button>

        {/* Hero section */}
        <div style={{padding:'22px 24px 16px',display:'flex',gap:20,alignItems:'flex-start',flexWrap:'wrap'}}>
          <div style={{flexShrink:0,border:`2px solid ${col}40`,padding:10,background:`${col}08`,position:'relative'}}>
            <div style={{position:'absolute',inset:0,background:`radial-gradient(ellipse at 50% 50%,${col}15,transparent 70%)`,pointerEvents:'none'}}/>
            <Sprite src={sp.png||sp.svg||''} name={sp.name} size={128}/>
          </div>
          <div style={{flex:1,minWidth:200}}>
            <div style={{fontFamily:'var(--ff-pixel)',fontSize:10,color:'var(--text3)',letterSpacing:2,marginBottom:4}}>SPECIES #{sp.number}</div>
            <div style={{fontFamily:'var(--ff-pixel)',fontSize:30,color:col,lineHeight:1.1,marginBottom:10,
              textShadow:`0 0 16px ${col}60`}}>{sp.name}</div>
            <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:12}}>
              <span style={{fontFamily:'var(--ff-pixel)',fontSize:10,color:col,padding:'3px 9px',border:`1px solid ${col}50`,background:`${col}15`}}>{sp.energy.toUpperCase()}</span>
              <span style={{fontFamily:'var(--ff-pixel)',fontSize:10,color:rc,padding:'3px 9px',border:`1px solid ${rc}50`,background:`${rc}10`}}>{sp.rarity.toUpperCase()}</span>
            </div>
            {description&&<div style={{fontFamily:'var(--ff-mono)',fontSize:13,color:'var(--text)',lineHeight:1.75,
              fontStyle:'italic',opacity:0.88,maxWidth:380}}>"{description}"</div>}
          </div>
        </div>

        {/* Stats */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,padding:'0 24px 16px'}}>
          {([[`${holderCount||'—'}`, 'HOLDERS', col],
             [`~${estSupply}`, 'EST. SUPPLY', 'var(--bright)'],
             [sp.rarity, 'RARITY', rc]] as [string,string,string][]).map(([v,l,c])=>(
            <div key={l} style={{background:'var(--bg)',border:`1px solid ${c}20`,padding:'12px 14px',position:'relative',overflow:'hidden'}}>
              <div style={{position:'absolute',top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,transparent,${c}60,transparent)`}}/>
              <div style={{fontFamily:'var(--ff-pixel)',fontSize:20,color:c,marginBottom:4,textShadow:`0 0 10px ${c}50`}}>{v}</div>
              <div style={{fontFamily:'var(--ff-pixel)',fontSize:9,color:'var(--text3)',letterSpacing:1.5}}>{l}</div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div style={{padding:'0 24px 16px',display:'flex',gap:8,flexWrap:'wrap'}}>
          <button className="btn btn-primary" onClick={()=>openWithConfirm(`https://opensea.io/assets/ethereum/${CC0_CONTRACT}`)} style={{fontSize:12,gap:6}}>🌊 VIEW ON OPENSEA</button>
          <button className="btn" onClick={()=>openWithConfirm(`https://etherscan.io/token/${CC0_CONTRACT}`)} style={{fontSize:12}}>⬡ ETHERSCAN</button>
        </div>

        {/* Holders */}
        {holderList.length>0&&(
          <div style={{padding:'0 24px 16px'}}>
            <div style={{fontFamily:'var(--ff-pixel)',fontSize:10,color:'var(--lime)',letterSpacing:2,marginBottom:8,display:'flex',alignItems:'center',gap:8}}>
              <span style={{color:'var(--green2)',fontSize:8}}>▶</span> TOP HOLDERS
              <div style={{flex:1,height:1,background:'linear-gradient(90deg,var(--green1),transparent)'}}/>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:3,maxHeight:180,overflowY:'auto'}}>
              {holderList.slice(0,10).map((addr,i)=>(
                <div key={addr} onClick={()=>openWithConfirm(`https://opensea.io/${addr}`)}
                  style={{display:'flex',alignItems:'center',gap:10,padding:'6px 10px',
                    background:'var(--bg)',border:'1px solid var(--border)',cursor:'pointer',transition:'border-color 0.1s'}}
                  onMouseEnter={e=>(e.currentTarget as HTMLElement).style.borderColor='var(--green2)'}
                  onMouseLeave={e=>(e.currentTarget as HTMLElement).style.borderColor='var(--border)'}>
                  <span style={{fontFamily:'var(--ff-pixel)',fontSize:9,width:22,
                    color:i===0?'var(--gold)':i===1?'var(--silver)':i===2?'var(--bronze)':'var(--text3)'}}>#{i+1}</span>
                  <span style={{fontFamily:'var(--ff-mono)',fontSize:13,color:'var(--text)',flex:1}}>{addr.slice(0,10)}…{addr.slice(-6)}</span>
                  <span style={{fontFamily:'var(--ff-pixel)',fontSize:9,color:'var(--text3)'}}>🌊 ▸</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Sales */}
        <div style={{padding:'0 24px 22px'}}>
          <div style={{fontFamily:'var(--ff-pixel)',fontSize:10,color:'var(--lime)',letterSpacing:2,marginBottom:8,display:'flex',alignItems:'center',gap:8}}>
            <span style={{color:'var(--green2)',fontSize:8}}>▶</span> RECENT SALES
            <div style={{flex:1,height:1,background:'linear-gradient(90deg,var(--green1),transparent)'}}/>
          </div>
          {salesLoading?(
            <div style={{fontFamily:'var(--ff-pixel)',fontSize:10,color:'var(--text3)',padding:'10px 0'}}>LOADING SALES DATA…</div>
          ):sales.length===0?(
            <div style={{fontFamily:'var(--ff-pixel)',fontSize:10,color:'var(--text3)',padding:'10px 0',lineHeight:2.5}}>
              NO RECENT SALES DATA AVAILABLE<br/>
              <button className="btn btn-filter" style={{fontSize:10,marginTop:4}}
                onClick={()=>openWithConfirm(`https://opensea.io/assets/ethereum/${CC0_CONTRACT}`)}>
                VIEW ON OPENSEA ▸
              </button>
            </div>
          ):(
            <div style={{display:'flex',flexDirection:'column',gap:4}}>
              <div style={{display:'grid',gridTemplateColumns:'100px 1fr 100px 50px',gap:8,padding:'5px 10px',
                fontFamily:'var(--ff-pixel)',fontSize:9,color:'var(--text3)',letterSpacing:1}}>
                <span>PRICE</span><span>FROM → TO</span><span>DATE</span><span/>
              </div>
              {sales.map((s,i)=>(
                <div key={i} style={{display:'grid',gridTemplateColumns:'100px 1fr 100px 50px',gap:8,
                  padding:'8px 10px',background:'var(--bg)',border:'1px solid var(--border)',alignItems:'center'}}>
                  <span style={{fontFamily:'var(--ff-pixel)',fontSize:12,color:'var(--gold)'}}>{s.price}</span>
                  <span style={{fontFamily:'var(--ff-mono)',fontSize:11,color:'var(--text2)'}}>{s.from}→{s.to}</span>
                  <span style={{fontFamily:'var(--ff-pixel)',fontSize:9,color:'var(--text3)'}}>{s.date}</span>
                  {s.tx&&<button className="btn btn-filter" style={{fontSize:9,padding:'2px 6px'}}
                    onClick={()=>openWithConfirm(`https://etherscan.io/tx/${s.tx}`)}>TX</button>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PokedexInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [species,setSpecies]=useState<Species[]>([]);
  const [loading,setLoading]=useState(true);
  const [selected,setSelected]=useState<Species|null>(null);
  const [search,setSearch]=useState('');
  const [filterEnergy,setFilterEnergy]=useState('');
  const [filterRarity,setFilterRarity]=useState('');
  const [holderMap,setHolderMap]=useState<Record<number,string[]>>({});
  const [confirm,setConfirm]=useState<string|null>(null);

  useEffect(()=>{ _confirmSetter=setConfirm; return()=>{ _confirmSetter=null; }; },[]);

  useEffect(()=>{
    const num=searchParams.get('species');
    if (num&&species.length>0) {
      const sp=species.find(s=>s.number===parseInt(num));
      if (sp) setSelected(sp);
    }
  },[searchParams,species]);

  useEffect(()=>{
    Promise.all([
      fetch('https://api.cc0mon.com/registry').then(r=>r.json()),
      fetch('https://api.cc0mon.com/registry/images').then(r=>r.json()),
    ]).then(([regData,imgData])=>{
      const imgs=imgData.images||{};
      const list:Species[]=(regData.cc0mon||[]).map((s:any)=>({
        ...s, png:imgs[String(s.number)]?.png||'', svg:imgs[String(s.number)]?.svg||'',
      }));
      setSpecies(list);
      setLoading(false);
    });
  },[]);

  useEffect(()=>{
    fetch('/api/leaderboard').then(r=>r.json()).then(data=>{
      const map:Record<number,string[]>={};
      for (const leader of (data.leaders||[])) {
        for (const n of (leader.collectedSpeciesNums||[])) {
          if (!map[n]) map[n]=[];
          map[n].push(leader.address);
        }
      }
      setHolderMap(map);
    }).catch(()=>{});
  },[]);

  const energyList=Array.from(new Set(species.map(s=>s.energy))).sort();
  const filtered=species.filter(sp=>{
    if (search&&!sp.name.toLowerCase().includes(search.toLowerCase())&&!String(sp.number).includes(search)) return false;
    if (filterEnergy&&sp.energy!==filterEnergy) return false;
    if (filterRarity&&sp.rarity!==filterRarity) return false;
    return true;
  });

  const selectSpecies=(sp:Species)=>{
    setSelected(sp);
    router.replace(`/pokedex?species=${sp.number}`,{scroll:false});
  };

  return (
    <div style={{background:'var(--black)',color:'var(--text)',minHeight:'100vh',fontFamily:'var(--ff-mono)'}}>
      <div style={{position:'fixed',top:0,left:0,right:0,height:3,zIndex:9996,pointerEvents:'none',
        background:'linear-gradient(180deg,transparent,rgba(124,232,50,0.06),transparent)',
        animation:'scanline 8s linear infinite',opacity:0.7}}/>

      {confirm&&<ConfirmDialog url={confirm} onConfirm={()=>{window.open(confirm,'_blank','noopener');setConfirm(null);}} onCancel={()=>setConfirm(null)}/>}

      {/* Header */}
      <header style={{background:'var(--bg2)',borderBottom:'2px solid var(--green1)'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 24px',borderBottom:'1px solid var(--border)',background:'var(--bg)'}}>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <button className="btn btn-filter" onClick={()=>router.push('/')} style={{fontSize:11,letterSpacing:1}}>← LEADERBOARD</button>
            <span style={{fontFamily:'var(--ff-pixel)',fontSize:11,color:'var(--text2)',letterSpacing:2}}>▶ CC0MON DEX</span>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <div style={{width:7,height:7,background:'var(--lime)',boxShadow:'0 0 8px var(--lime)',animation:'pulse 1.5s ease-in-out infinite'}}/>
            <span style={{fontFamily:'var(--ff-pixel)',fontSize:11,color:'var(--lime)',letterSpacing:2}}>LIVE</span>
          </div>
        </div>
        <div style={{padding:'18px 24px 0'}}>
          <div style={{position:'relative',marginBottom:6}}>
            {['rgba(255,0,80,0.12)','rgba(0,220,255,0.12)'].map((c,i)=>(
              <div key={i} style={{position:'absolute',top:0,left:0,fontFamily:'var(--ff-pixel)',fontSize:'clamp(22px,4vw,36px)',
                color:c,letterSpacing:2,transform:`translate(${i?'2px':'−2px'},0)`,pointerEvents:'none',userSelect:'none'}}>
                CC0MON DEX
              </div>
            ))}
            <div style={{fontFamily:'var(--ff-pixel)',fontSize:'clamp(22px,4vw,36px)',color:'var(--bright)',letterSpacing:2,
              textShadow:'0 0 10px var(--lime),0 0 30px rgba(124,232,50,0.4),3px 3px 0 rgba(0,0,0,0.8)'}}>
              CC0MON DEX
            </div>
          </div>
          <div style={{fontFamily:'var(--ff-pixel)',fontSize:11,color:'var(--text3)',letterSpacing:2,marginBottom:14}}>
            {species.length} SPECIES · {Object.values(holderMap).reduce((a,v)=>a+(v.length>0?1:0),0)} WITH HOLDERS
          </div>
        </div>
        {/* Search & filters */}
        <div style={{padding:'0 24px 14px',display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
          <input type="text" placeholder="SEARCH NAME OR #..." value={search} onChange={e=>setSearch(e.target.value)}
            style={{fontFamily:'var(--ff-pixel)',fontSize:11,background:'var(--bg)',border:'1px solid var(--border)',
              color:'var(--text)',padding:'7px 12px',outline:'none',width:200,letterSpacing:1}}
            onFocus={e=>e.target.style.borderColor='var(--lime)'}
            onBlur={e=>e.target.style.borderColor='var(--border)'}/>
          <select value={filterEnergy} onChange={e=>setFilterEnergy(e.target.value)}
            style={{fontFamily:'var(--ff-pixel)',fontSize:10,background:'var(--bg)',border:'1px solid var(--border)',
              color:'var(--text2)',padding:'7px 10px',cursor:'pointer'}}>
            <option value="">ALL ENERGIES</option>
            {energyList.map(e=><option key={e} value={e}>{e.toUpperCase()}</option>)}
          </select>
          <select value={filterRarity} onChange={e=>setFilterRarity(e.target.value)}
            style={{fontFamily:'var(--ff-pixel)',fontSize:10,background:'var(--bg)',border:'1px solid var(--border)',
              color:'var(--text2)',padding:'7px 10px',cursor:'pointer'}}>
            <option value="">ALL RARITIES</option>
            {RARITY_ORDER.map(r=><option key={r} value={r}>{r.toUpperCase()}</option>)}
          </select>
          {(search||filterEnergy||filterRarity)&&(
            <button className="btn btn-filter" onClick={()=>{setSearch('');setFilterEnergy('');setFilterRarity('');}} style={{fontSize:10}}>✕ CLEAR</button>
          )}
          <div style={{marginLeft:'auto',fontFamily:'var(--ff-pixel)',fontSize:10,color:'var(--text2)'}}>
            {filtered.length}/{species.length}
          </div>
        </div>
      </header>

      <main style={{padding:'20px 24px',maxWidth:1440,margin:'0 auto',
        backgroundImage:'radial-gradient(circle,var(--green0) 1px,transparent 1px)',
        backgroundSize:'28px 28px'}}>
        {loading?(
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(110px,1fr))',gap:8}}>
            {Array.from({length:40}).map((_,i)=>(
              <div key={i} className="skeleton" style={{height:140,animationDelay:`${i*30}ms`}}/>
            ))}
          </div>
        ):(
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(110px,1fr))',gap:8}}>
            {filtered.map(sp=>(
              <SpeciesCard key={sp.number} sp={sp} holderCount={holderMap[sp.number]?.length??0} onClick={()=>selectSpecies(sp)}/>
            ))}
          </div>
        )}
      </main>

      {selected&&(
        <DetailModal sp={selected} holderCount={holderMap[selected.number]?.length??0}
          holderList={holderMap[selected.number]??[]}
          onClose={()=>{setSelected(null);router.replace('/pokedex',{scroll:false});}}/>
      )}
    </div>
  );
}

export default function PokedexPage() {
  return <Suspense><PokedexInner/></Suspense>;
}
