'use client';

import { useEffect, useState, useCallback } from 'react';
import type { LeaderboardData, LeaderboardEntry } from '@/lib/types';

const TOTAL_SPECIES = 260;
const ENERGY_TYPES = ['Fire','Ice','Grass','Electric','Ghost','Dragon','Metal','Toxic','Rock','Bug','Ocean','Earth','Underworld','Mythic','Celestial','Fossil'];
const ENERGY_EMOJIS: Record<string, string> = {
  Fire:'🔥', Ice:'❄️', Grass:'🌿', Electric:'⚡', Ghost:'👻', Dragon:'🐉',
  Metal:'⚙️', Toxic:'☠️', Rock:'🪨', Bug:'🐛', Ocean:'🌊', Earth:'🌍',
  Underworld:'🌑', Mythic:'✨', Celestial:'☀️', Fossil:'🦴',
};

function shorten(addr: string) {
  return addr.slice(0, 8) + '…' + addr.slice(-6);
}

function ProgressBar({ pct, height = 6 }: { pct: number; height?: number }) {
  return (
    <div style={{
      height, background: '#070f07', border: '1px solid #1a3d0a',
      overflow: 'hidden', position: 'relative',
    }}>
      <div style={{
        height: '100%', width: `${Math.max(pct, 0.3)}%`,
        background: '#4a9c12', transition: 'width 1s ease',
        position: 'relative', boxShadow: '4px 0 8px #9bcc0f',
      }}>
        <div style={{
          position: 'absolute', right: 0, top: 0,
          width: 2, height: '100%', background: '#c8e030',
        }} />
      </div>
    </div>
  );
}

function EnergyDots({ byEnergy }: { byEnergy: LeaderboardEntry['byEnergy'] }) {
  return (
    <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', maxWidth: 88 }}>
      {ENERGY_TYPES.map(e => {
        const info = byEnergy?.[e];
        const lit = info && info.collected > 0;
        return (
          <div key={e} title={`${e}: ${info?.collected ?? 0}/${info?.total ?? 0}`} style={{
            width: 6, height: 6,
            border: `1px solid ${lit ? '#9bcc0f' : '#1a3d0a'}`,
            background: lit ? '#4a9c12' : '#070f07',
            boxShadow: lit ? '0 0 3px #9bcc0f' : 'none',
          }} />
        );
      })}
    </div>
  );
}

function DetailPanel({ entry, registryImages }: {
  entry: LeaderboardEntry;
  registryImages: Record<string, { svg: string; name: string }>;
}) {
  return (
    <div style={{
      background: '#0f230f', borderTop: '1px solid #2d6a0a',
      borderBottom: '2px solid #2d6a0a', padding: 14,
    }}>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
        {([['COLLECTED', entry.collected], ['MISSING', entry.missing], ['PROGRESS', entry.progress], ['TOKENS HELD', entry.totalTokensHeld]] as [string, string|number][]).map(([label, val]) => (
          <div key={label}>
            <div style={{ fontSize: 10, color: '#9bcc0f', fontFamily: 'inherit', marginBottom: 2 }}>{val}</div>
            <div style={{ fontSize: 5, color: '#3a6010', fontFamily: 'inherit', letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
        <a href={`https://opensea.io/${entry.address}`} target="_blank" rel="noreferrer"
          style={{ marginLeft: 'auto', color: '#3a6010', fontSize: 5, textDecoration: 'none', alignSelf: 'center', letterSpacing: 1 }}>
          VIEW ON OPENSEA ▸
        </a>
      </div>

      <div style={{ fontSize: 6, color: '#8bbc0f', marginBottom: 6, letterSpacing: 2 }}>▸ ENERGY BREAKDOWN</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(90px,1fr))', gap: 5, marginBottom: 12 }}>
        {ENERGY_TYPES.map(e => {
          const info = entry.byEnergy?.[e] ?? { collected: 0, total: 0 };
          const pct = info.total ? info.collected / info.total * 100 : 0;
          return (
            <div key={e} style={{ background: '#070f07', border: '1px solid #1a3d0a', padding: 6 }}>
              <div style={{ fontSize: 4.5, color: '#3a6010', marginBottom: 3 }}>{ENERGY_EMOJIS[e]} {e.toUpperCase()}</div>
              <div style={{ fontSize: 7, color: '#9bcc0f' }}>{info.collected}/{info.total}</div>
              <ProgressBar pct={pct} height={4} />
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 6, color: '#8bbc0f', marginBottom: 6, letterSpacing: 2 }}>▸ COLLECTION ({entry.collected}/{TOTAL_SPECIES})</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(58px,1fr))', gap: 4, maxHeight: 280, overflowY: 'auto' }}>
        {entry.checklist?.map(sp => {
          const img = registryImages[sp.number];
          return (
            <div key={sp.number} style={{
              background: sp.collected ? 'rgba(74,156,18,0.08)' : '#070f07',
              border: `1px solid ${sp.collected ? '#2d6a0a' : '#1a3d0a'}`,
              padding: 4, textAlign: 'center', position: 'relative',
              opacity: sp.collected ? 1 : 0.2,
            }}>
              {sp.collected && <span style={{ position: 'absolute', top: 2, right: 2, fontSize: 5, color: '#9bcc0f' }}>✓</span>}
              {img && <img src={img.svg} alt={sp.name} width={44} height={44} loading="lazy" style={{ imageRendering: 'pixelated', display: 'block', margin: '0 auto 2px' }} />}
              <div style={{ fontSize: 3.5, color: sp.collected ? '#8ab80e' : '#3a6010', lineHeight: 1.5, wordBreak: 'break-word' }}>{sp.name}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function CC0Masters() {
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [registryImages, setRegistryImages] = useState<Record<string, { svg: string; name: string }>>({});
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<'collected' | 'tokens' | 'pct'>('collected');
  const [filterMode, setFilterMode] = useState<'all' | 'top10' | 'top50'>('all');
  const [triggeringCron, setTriggeringCron] = useState(false);

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/leaderboard');
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to load');
      }
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
      .then(r => r.json())
      .then(d => setRegistryImages(d.images || {}))
      .catch(() => {});
  }, [fetchLeaderboard]);

  const triggerCron = async () => {
    setTriggeringCron(true);
    try {
      await fetch('/api/cron');
      setTimeout(fetchLeaderboard, 5000);
    } finally {
      setTriggeringCron(false);
    }
  };

  const sorted = (data?.leaders ?? [])
    .slice()
    .sort((a, b) => {
      if (sortKey === 'tokens') return b.totalTokensHeld - a.totalTokensHeld;
      if (sortKey === 'pct') return parseFloat(b.progress) - parseFloat(a.progress);
      return b.collected - a.collected;
    })
    .filter((_, i) => filterMode === 'top10' ? i < 10 : filterMode === 'top50' ? i < 50 : true);

  const completeCount = data?.leaders.filter(l => l.collected === TOTAL_SPECIES).length ?? 0;

  const BtnStyle = (active: boolean) => ({
    fontFamily: 'inherit', fontSize: 5.5,
    background: active ? '#2d6a0a' : '#070f07',
    border: `1px solid ${active ? '#8bbc0f' : '#1a3d0a'}`,
    color: active ? '#8bbc0f' : '#3a6010',
    padding: '4px 7px', cursor: 'pointer',
  });

  return (
    <div style={{ background: '#070f07', color: '#8ab80e', minHeight: '100vh', fontFamily: "'Press Start 2P', monospace", fontSize: 8, overflowX: 'hidden' }}>

      {/* HEADER */}
      <header style={{ padding: '24px 20px 20px', background: '#0b1a0b', borderBottom: '3px solid #1a3d0a' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 5.5, color: '#3a6010', letterSpacing: 2, border: '1px solid #1a3d0a', padding: '2px 6px', display: 'inline-block', marginBottom: 6 }}>
              ETHEREUM · ON-CHAIN · CC0
            </div>
            <div style={{ fontSize: 'clamp(18px,5vw,32px)', color: '#c8e030', letterSpacing: 4, textShadow: '0 0 20px #9bcc0f, 3px 3px 0 #000', lineHeight: 1 }}>
              CC0MASTERS
            </div>
            <div style={{ fontSize: 5.5, color: '#3a6010', letterSpacing: 2, marginTop: 6 }}>WHO WILL CATCH THEM ALL?</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={fetchLeaderboard} style={{ fontFamily: 'inherit', fontSize: 7, background: '#1a3d0a', border: '2px solid #2d6a0a', color: '#8bbc0f', padding: '7px 12px', cursor: 'pointer' }}>
                ↺ REFRESH
              </button>
              <button onClick={triggerCron} disabled={triggeringCron} style={{ fontFamily: 'inherit', fontSize: 7, background: '#2d6a0a', border: '2px solid #4a9c12', color: '#c8e030', padding: '7px 12px', cursor: triggeringCron ? 'not-allowed' : 'pointer', opacity: triggeringCron ? 0.5 : 1 }}>
                {triggeringCron ? '⬡ SCANNING…' : '⬡ RUN SCAN NOW'}
              </button>
            </div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              {([['OWNERS', data?.totalOwners ?? '—'], ['SPECIES', TOTAL_SPECIES], ['COMPLETE DEX', completeCount || '—'], ['UPDATED', data ? new Date(data.updatedAt).toLocaleDateString() : '—']] as [string, string|number][]).map(([label, val]) => (
                <div key={label}>
                  <div style={{ fontSize: 9, color: '#9bcc0f', display: 'block' }}>{val}</div>
                  <div style={{ fontSize: 5, color: '#3a6010', letterSpacing: 1 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* STATUS BAR */}
      <div style={{ background: '#0b1a0b', borderBottom: '2px solid #1a3d0a', padding: '7px 20px', fontSize: 5.5, color: '#3a6010', letterSpacing: 1 }}>
        {loading ? '⬡ LOADING LEADERBOARD…' : error ? `⚠ ${error}` : `⬡ LEADERBOARD LIVE · ${data?.totalOwners} HOLDERS RANKED · UPDATES NIGHTLY AT 02:00 UTC`}
      </div>

      <main style={{ padding: '16px 20px', maxWidth: 1280, margin: '0 auto' }}>

        {/* PODIUM */}
        {!loading && !error && sorted.length >= 3 && (
          <>
            <div style={{ fontSize: 8, color: '#8bbc0f', marginBottom: 12, letterSpacing: 2 }}>▸ CHAMPION PODIUM</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.1fr 1fr', gap: 8, marginBottom: 20, alignItems: 'end' }}>
              {([sorted[1], sorted[0], sorted[2]] as LeaderboardEntry[]).map((entry, idx) => {
                const medals = ['🥈','🥇','🥉'];
                const borderColors = ['#b0bec5','#f5c518','#c87941'];
                const pct = parseFloat(entry.progress);
                return (
                  <div key={entry.address} onClick={() => setOpenRow(openRow === entry.address ? null : entry.address)} style={{
                    background: '#0b1a0b', border: `2px solid ${borderColors[idx]}`,
                    boxShadow: idx === 1 ? '0 0 0 1px #f5c518, 0 0 20px rgba(245,197,24,.2)' : 'none',
                    padding: idx === 1 ? '14px 10px 10px' : '8px 10px 10px',
                    cursor: 'pointer',
                  }}>
                    <div style={{ fontSize: 20, textAlign: 'center', marginBottom: 8 }}>{medals[idx]}</div>
                    <div style={{ fontSize: 5, color: '#3a6010', textAlign: 'center', marginBottom: 8, wordBreak: 'break-all', lineHeight: 1.8 }}>{entry.address}</div>
                    <div style={{ fontSize: 'clamp(14px,3vw,22px)', color: '#c8e030', textAlign: 'center', textShadow: '0 0 10px #9bcc0f', marginBottom: 2 }}>
                      {entry.collected}<span style={{ fontSize: '0.5em', color: '#3a6010' }}>/{TOTAL_SPECIES}</span>
                    </div>
                    <div style={{ fontSize: 5, color: '#3a6010', textAlign: 'center', marginBottom: 6, letterSpacing: 1 }}>SPECIES COLLECTED</div>
                    <ProgressBar pct={pct} />
                    <div style={{ fontSize: 5, color: '#3a6010', textAlign: 'center', marginTop: 4 }}>{entry.progress} · {entry.totalTokensHeld} TOKENS</div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* FILTERS */}
        {!loading && !error && sorted.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 5.5, color: '#3a6010' }}>SHOW:</span>
            {(['all','top10','top50'] as const).map(f => <button key={f} onClick={() => setFilterMode(f)} style={BtnStyle(filterMode === f)}>{f.toUpperCase()}</button>)}
            <span style={{ fontSize: 5.5, color: '#3a6010', marginLeft: 8 }}>SORT:</span>
            {(['collected','tokens','pct'] as const).map(s => (
              <button key={s} onClick={() => setSortKey(s)} style={BtnStyle(sortKey === s)}>
                {s === 'collected' ? 'SPECIES' : s === 'tokens' ? 'TOKENS HELD' : '% COMPLETE'}
              </button>
            ))}
          </div>
        )}

        {/* TABLE */}
        <div style={{ fontSize: 8, color: '#8bbc0f', marginBottom: 10, letterSpacing: 2 }}>▸ FULL RANKINGS</div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#3a6010', fontSize: 7 }}>⬡ LOADING LEADERBOARD…</div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#3a6010', fontSize: 7, lineHeight: 2.5 }}>
            <div style={{ fontSize: 24, marginBottom: 12, opacity: 0.4 }}>◎</div>
            NO LEADERBOARD DATA YET<br />
            <span style={{ fontSize: 5 }}>PRESS "RUN SCAN NOW" TO INDEX ALL HOLDERS</span><br />
            <span style={{ fontSize: 5 }}>SCANS RUN AUTOMATICALLY NIGHTLY AT 02:00 UTC</span>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#0f230f', borderBottom: '2px solid #2d6a0a' }}>
                  {['#','WALLET','SPECIES','PROGRESS','%','TOKENS','ENERGIES','MISSING'].map(h => (
                    <th key={h} style={{ padding: 8, fontSize: 5.5, color: '#8bbc0f', textAlign: 'left', letterSpacing: 1, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((entry, i) => {
                  const rankColors = ['#f5c518','#b0bec5','#c87941'];
                  const pct = parseFloat(entry.progress);
                  const isOpen = openRow === entry.address;
                  return [
                    <tr key={entry.address} onClick={() => setOpenRow(isOpen ? null : entry.address)}
                      style={{ borderBottom: '1px solid #1a3d0a', cursor: 'pointer', background: isOpen ? 'rgba(139,188,15,.06)' : 'transparent', transition: 'background .12s' }}>
                      <td style={{ padding: 8, fontSize: 9, color: rankColors[i] ?? '#3a6010', width: 24, textAlign: 'center' }}>{i + 1}</td>
                      <td style={{ padding: 8 }}><div style={{ fontSize: 6, color: '#8ab80e' }}>{shorten(entry.address)}</div></td>
                      <td style={{ padding: 8 }}>
                        <span style={{ fontSize: 10, color: '#9bcc0f' }}>{entry.collected}</span>
                        <span style={{ fontSize: 5, color: '#3a6010', marginLeft: 2 }}>/ {TOTAL_SPECIES}</span>
                      </td>
                      <td style={{ padding: 8, minWidth: 90 }}><ProgressBar pct={pct} /></td>
                      <td style={{ padding: 8 }}><span style={{ fontSize: 8, color: '#c8e030', whiteSpace: 'nowrap' }}>{entry.progress}</span></td>
                      <td style={{ padding: 8 }}><span style={{ fontSize: 6, color: '#3a6010' }}>{entry.totalTokensHeld}</span></td>
                      <td style={{ padding: 8 }}><EnergyDots byEnergy={entry.byEnergy} /></td>
                      <td style={{ padding: 8 }}><span style={{ fontSize: 5, color: '#3a6010', border: '1px solid #1a3d0a', padding: '2px 4px', whiteSpace: 'nowrap' }}>{entry.missing} LEFT</span></td>
                    </tr>,
                    isOpen && (
                      <tr key={`${entry.address}-detail`}>
                        <td colSpan={8} style={{ padding: 0 }}>
                          <DetailPanel entry={entry} registryImages={registryImages} />
                        </td>
                      </tr>
                    )
                  ];
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
