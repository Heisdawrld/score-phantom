import { useState, useEffect } from 'react';
import { useRoute, useLocation } from 'wouter';
import { fetchApi } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Loader2, AlertCircle, BarChart2, Users, GitMerge, TrendingUp, DollarSign, Lock, RefreshCw, Zap } from 'lucide-react';

function TeamLogo({ src, name }: { src?: string | null; name: string }) {
  const [err, setErr] = useState(false);
  if (src && !err) return <img src={src} alt={name} onError={() => setErr(true)} className='w-10 h-10 rounded-full object-contain bg-white/5 border border-white/10' loading='lazy' />;
  return <div className='w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-black text-primary'>{name.slice(0,2).toUpperCase()}</div>;
}
function toWAT(d: string) { try { return new Date(d).toLocaleString('en-NG', { timeZone: 'Africa/Lagos', dateStyle: 'medium', timeStyle: 'short' }); } catch { return d; } }

// ── SofaScore-compatible helpers ─────────────────────────────────────────────
function getScore(s: any): string | number {
  if (s == null) return '?';
  if (typeof s === 'number') return s;
  if (typeof s === 'object') return s.current ?? s.display ?? s.normaltime ?? '?';
  return s;
}
function getPlayerName(p: any): string {
  if (!p) return 'Unknown';
  return p?.player?.shortName || p?.player?.name || p?.name || p?.playerName || 'Player';
}
function getJersey(p: any): string | number {
  return p?.jerseyNumber || p?.shirtNumber || p?.number || '';
}
function getPosition(p: any): string {
  return p?.position || p?.player?.position || '';
}
function flattenStats(stats: any): any[] {
  if (!stats) return [];
  const periods = stats.statistics || (Array.isArray(stats) ? stats : []);
  const allPeriod = Array.isArray(periods) ? (periods.find((p: any) => (p.period || '').toUpperCase() === 'ALL') || periods[0]) : null;
  if (!allPeriod) return [];
  const groups = allPeriod.groups || [];
  const items: any[] = [];
  for (const g of groups) items.push(...(g.statisticsItems || g.items || []));
  return items;
}
function getFormLetters(teamForm: any): string[] {
  if (!teamForm) return [];
  if (Array.isArray(teamForm.form)) {
    return teamForm.form.map((f: any) => typeof f === 'string' ? f.toUpperCase() : String(f?.result || f?.outcome || '?').toUpperCase());
  }
  if (typeof teamForm.value === 'string') return teamForm.value.split(' ').filter(Boolean).map((s: string) => s.toUpperCase());
  return [];
}

const TABS = [
  { id: 'overview', label: 'Overview', icon: BarChart2 },
  { id: 'lineups', label: 'Lineups', icon: Users },
  { id: 'h2h', label: 'H2H', icon: GitMerge },
  { id: 'form', label: 'Form', icon: TrendingUp },
  { id: 'odds', label: 'Odds', icon: DollarSign },
];

// ── Overview Tab ─────────────────────────────────────────────────────────────
function OverviewTab({ data }: { data: any }) {
  const statItems = flattenStats(data.statistics);
  const fix = data.fixture;
  if (statItems.length === 0) return <p className='text-center py-10 text-white/30 text-sm'>Statistics not yet available for this match.</p>;
  const poss = statItems.find((s: any) => (s.name || '').toLowerCase().includes('possession'));
  const homePoss = poss ? (parseInt(String(poss.homeValue || poss.home || '50'), 10) || 50) : 50;
  const awayPoss = 100 - homePoss;
  return (
    <div className='space-y-4 py-2'>
      <div className='grid grid-cols-3 gap-2 p-3 rounded-xl bg-white/4 border border-white/8 text-center'>
        <div><p className='text-xl font-black text-primary'>{homePoss}%</p><p className='text-[10px] text-white/40'>{fix.home}</p></div>
        <div><p className='text-[10px] font-bold text-white/40 mt-2'>Possession</p></div>
        <div><p className='text-xl font-black text-blue-400'>{awayPoss}%</p><p className='text-[10px] text-white/40'>{fix.away}</p></div>
      </div>
      {statItems.slice(0, 10).map((s: any, i: number) => {
        const name = s.name || s.type || 'Stat';
        const hRaw = s.homeValue ?? s.home ?? 0;
        const aRaw = s.awayValue ?? s.away ?? 0;
        const hv = parseFloat(String(hRaw)) || 0;
        const av = parseFloat(String(aRaw)) || 0;
        const total = hv + av || 1;
        const hp = Math.round((hv / total) * 100);
        return (
          <div key={i} className='space-y-1'>
            <div className='flex justify-between text-xs'>
              <span className='font-bold text-white'>{String(hRaw)}</span>
              <span className='text-[10px] text-primary/60 uppercase tracking-wide'>{name}</span>
              <span className='font-bold text-white'>{String(aRaw)}</span>
            </div>
            <div className='flex h-1.5 rounded-full overflow-hidden gap-0.5'>
              <div className='bg-primary rounded-full' style={{ width: hp + '%' }} />
              <div className='bg-blue-400 rounded-full' style={{ width: (100 - hp) + '%' }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Lineups Tab ──────────────────────────────────────────────────────────────
function LineupsTab({ data }: { data: any }) {
  const lin = data.lineups;
  const isPred = data.isPredicted;
  if (!lin) return <p className='text-center py-10 text-white/30 text-sm'>Lineups not available yet. Check back closer to kick-off.</p>;
  const homeObj = lin.homeTeam || lin.home || {};
  const awayObj = lin.awayTeam || lin.away || {};
  const homePlayers: any[] = homeObj.players || homeObj.starters || homeObj.startXI || [];
  const awayPlayers: any[] = awayObj.players || awayObj.starters || awayObj.startXI || [];
  if (homePlayers.length === 0 && awayPlayers.length === 0) return <p className='text-center py-10 text-white/30 text-sm'>No lineup data available yet.</p>;
  const homeFormation = homeObj.formation || '';
  const awayFormation = awayObj.formation || '';
  const PlayerRow = ({ p }: { p: any }) => (
    <div className='flex items-center gap-2 px-3 py-2 rounded-lg bg-white/4 border border-white/6'>
      <span className='text-[10px] text-white/30 w-5 text-right shrink-0'>{getJersey(p)}</span>
      <span className='text-sm font-semibold text-white truncate flex-1'>{getPlayerName(p)}</span>
      <span className='text-[10px] text-white/30 shrink-0'>{getPosition(p)}</span>
    </div>
  );
  return (
    <div className='space-y-4'>
      {isPred && <div className='flex items-center gap-2 px-3 py-2 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-xs'><Zap className='w-3 h-3 shrink-0' />Predicted — official lineups out 30min before kick-off</div>}
      <div className='grid grid-cols-2 gap-3'>
        <div>
          <p className='text-xs font-black text-primary uppercase tracking-wider mb-1.5 truncate'>{data.fixture.home}</p>
          {homeFormation && <p className='text-[10px] text-primary/50 mb-2'>{homeFormation}</p>}
          <div className='space-y-1'>{homePlayers.slice(0,11).map((p: any, i: number) => <PlayerRow key={i} p={p} />)}</div>
        </div>
        <div>
          <p className='text-xs font-black text-blue-400 uppercase tracking-wider mb-1.5 truncate'>{data.fixture.away}</p>
          {awayFormation && <p className='text-[10px] text-blue-400/50 mb-2'>{awayFormation}</p>}
          <div className='space-y-1'>{awayPlayers.slice(0,11).map((p: any, i: number) => <PlayerRow key={i} p={p} />)}</div>
        </div>
      </div>
    </div>
  );
}

// ── H2H Tab ──────────────────────────────────────────────────────────────────
function H2HTab({ data }: { data: any }) {
  const h2h = data.h2h;
  if (!h2h) return <p className='text-center py-10 text-white/30 text-sm'>H2H data not available for this match.</p>;
  const events: any[] = h2h.events || h2h.matches || h2h.results || (Array.isArray(h2h) ? h2h : []);
  const home = data.fixture.home;
  const away = data.fixture.away;
  const normName = (n: string) => (n || '').toLowerCase().replace(/[^a-z]/g, '');
  const homeNorm = normName(home);
  let hw = 0, aw = 0, dr = 0;
  for (const ev of events) {
    const ht = ev.homeTeam?.name || ev.home_team || ev.home || '';
    const at = ev.awayTeam?.name || ev.away_team || ev.away || '';
    const hg = Number(getScore(ev.homeScore ?? ev.home_goals ?? ev.homeGoals));
    const ag = Number(getScore(ev.awayScore ?? ev.away_goals ?? ev.awayGoals));
    if (isNaN(hg) || isNaN(ag)) continue;
    const htIsOurHome = normName(ht).includes(homeNorm.slice(0,5)) || homeNorm.includes(normName(ht).slice(0,5));
    if (hg > ag) { htIsOurHome ? hw++ : aw++; }
    else if (ag > hg) { htIsOurHome ? aw++ : hw++; }
    else dr++;
  }
  return (
    <div className='space-y-4'>
      <div className='grid grid-cols-3 gap-2 p-3 rounded-xl bg-white/4 border border-white/8 text-center'>
        <div><p className='text-2xl font-black text-primary'>{hw}</p><p className='text-[10px] text-white/40 truncate'>{home} Wins</p></div>
        <div><p className='text-2xl font-black text-white/40'>{dr}</p><p className='text-[10px] text-white/40'>Draws</p></div>
        <div><p className='text-2xl font-black text-blue-400'>{aw}</p><p className='text-[10px] text-white/40 truncate'>{away} Wins</p></div>
      </div>
      <div className='space-y-2'>
        {events.length === 0 && <p className='text-center text-white/30 text-sm py-4'>No recent H2H matches found.</p>}
        {events.slice(0, 8).map((ev: any, i: number) => {
          const ht = ev.homeTeam?.name || ev.home_team || ev.home || '?';
          const at = ev.awayTeam?.name || ev.away_team || ev.away || '?';
          const hg = getScore(ev.homeScore ?? ev.home_goals ?? ev.homeGoals);
          const ag = getScore(ev.awayScore ?? ev.away_goals ?? ev.awayGoals);
          const yr = ev.startTimestamp ? new Date(ev.startTimestamp * 1000).getFullYear() : String(ev.date || ev.matchDate || '').slice(0,4);
          const comp = ev.tournament?.name || ev.competition || '';
          return (
            <div key={i} className='px-3 py-2.5 rounded-xl bg-white/4 border border-white/8'>
              <div className='flex items-center gap-2 text-sm'>
                <span className='text-[10px] text-white/25 w-8 shrink-0'>{yr}</span>
                <span className='flex-1 truncate text-white/70 text-xs'>{ht}</span>
                <span className='font-black text-white tabular-nums px-2'>{hg} - {ag}</span>
                <span className='flex-1 truncate text-right text-white/70 text-xs'>{at}</span>
              </div>
              {comp && <p className='text-[9px] text-white/20 pl-8 mt-0.5 truncate'>{comp}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Form Tab ─────────────────────────────────────────────────────────────────
function FormTab({ data }: { data: any }) {
  const form = data.pregameForm;
  if (!form) return <p className='text-center py-10 text-white/30 text-sm'>Pre-game form not available.</p>;
  const homeFormObj = form.homeTeam || form.home || {};
  const awayFormObj = form.awayTeam || form.away || {};
  const homeLetters = getFormLetters(homeFormObj);
  const awayLetters = getFormLetters(awayFormObj);
  const FormBadge = ({ letter }: { letter: string }) => {
    const isW = letter === 'W'; const isD = letter === 'D'; const isL = letter === 'L';
    return (
      <div className={'w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black border ' + (isW ? 'bg-primary/20 text-primary border-primary/30' : isD ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' : isL ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-white/5 text-white/30 border-white/10')}>
        {letter}
      </div>
    );
  };
  const FormRow = ({ label, letters, color }: { label: string; letters: string[]; color: string }) => (
    <div className='p-3 rounded-xl bg-white/4 border border-white/8'>
      <p className={'text-xs font-black uppercase tracking-wider mb-3 ' + color}>{label}</p>
      {letters.length === 0 ? <p className='text-xs text-white/30'>No form data</p> : (
        <div className='flex gap-1.5 flex-wrap'>
          {letters.slice(0, 6).map((l, i) => <FormBadge key={i} letter={l} />)}
          <div className='flex items-center gap-2 ml-2'>
            <span className='text-xs text-white/40'>{letters.filter(l => l==='W').length}W</span>
            <span className='text-xs text-white/40'>{letters.filter(l => l==='D').length}D</span>
            <span className='text-xs text-white/40'>{letters.filter(l => l==='L').length}L</span>
          </div>
        </div>
      )}
    </div>
  );
  if (homeLetters.length === 0 && awayLetters.length === 0) return <p className='text-center py-10 text-white/30 text-sm'>No form data available.</p>;
  return (
    <div className='space-y-3'>
      <FormRow label={data.fixture.home + ' Recent Form'} letters={homeLetters} color='text-primary' />
      <FormRow label={data.fixture.away + ' Recent Form'} letters={awayLetters} color='text-blue-400' />
    </div>
  );
}

// ── Odds Tab ─────────────────────────────────────────────────────────────────
function OddsTab({ data }: { data: any }) {
  const odds = data.odds;
  const fix = data.fixture;
  const isLiveOrFT = ['LIVE','HT','1H','2H','ET','PEN','FT','AET'].includes(fix.status || '');
  if (!odds && !fix.oddsHome) {
    if (isLiveOrFT) return <p className='text-center py-10 text-white/30 text-sm'>Pre-match odds are no longer available for live/finished matches.</p>;
    return <p className='text-center py-10 text-white/30 text-sm'>Odds data not available for this match.</p>;
  }
  const markets = odds ? (odds.markets || odds.odds || (Array.isArray(odds) ? odds : [])) : [];
  const mktResult = markets.find((m: any) => (m.name || m.marketName || '').toLowerCase().includes('result') || (m.name || m.marketName || '').toLowerCase().includes('outcome') || (m.name || m.marketName || '').toLowerCase() === '1x2') || markets[0];
  const getOddsFromOutcomes = (outcomes: any[], idx: number) => outcomes?.[idx]?.odds || outcomes?.[idx]?.price || null;
  const outs = mktResult?.outcomes || [];
  const h = getOddsFromOutcomes(outs, 0) || mktResult?.homeOdds || fix.oddsHome;
  const d = getOddsFromOutcomes(outs, 1) || mktResult?.drawOdds || fix.oddsDraw;
  const a = getOddsFromOutcomes(outs, 2) || mktResult?.awayOdds || fix.oddsAway;
  return (
    <div className='space-y-4'>
      <div className='grid grid-cols-3 gap-2'>
        {[{ label: '1 ' + fix.home, val: h, color: 'text-primary' }, { label: 'X Draw', val: d, color: 'text-white/60' }, { label: '2 ' + fix.away, val: a, color: 'text-blue-400' }].map(({ label, val, color }) => (
          <div key={label} className='flex flex-col items-center p-3 rounded-xl bg-white/5 border border-white/10'>
            <p className='text-[9px] text-white/40 mb-1 text-center truncate w-full'>{label}</p>
            <p className={'text-2xl font-black ' + color}>{val ? parseFloat(String(val)).toFixed(2) : '?'}</p>
          </div>
        ))}
      </div>
      {markets.slice(0, 8).map((mkt: any, i: number) => {
        const name = mkt.name || mkt.marketName || '';
        if (!name) return null;
        const mOuts = mkt.outcomes || [];
        if (mOuts.length === 0) return null;
        return (
          <div key={i} className='p-3 rounded-xl bg-white/4 border border-white/8'>
            <p className='text-xs font-bold text-white/50 mb-2'>{name}</p>
            <div className='flex gap-2 flex-wrap'>
              {mOuts.map((o: any, j: number) => (
                <div key={j} className='flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10'>
                  <span className='text-xs text-white/50'>{o.name || o.outcome || ''}</span>
                  <span className='text-sm font-black text-white'>{o.odds || o.price ? parseFloat(String(o.odds || o.price)).toFixed(2) : ''}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Incidents strip (goals/cards inline in header) ───────────────────────────
function IncidentsBadge({ incidents, teamId, side }: { incidents: any; teamId?: any; side: 'home' | 'away' }) {
  if (!incidents) return null;
  const evs: any[] = incidents.incidents || incidents.events || (Array.isArray(incidents) ? incidents : []);
  const goals = evs.filter((e: any) => e.incidentType === 'goal' || e.type === 'goal' || e.type === 'GOAL');
  const cards = evs.filter((e: any) => (e.incidentType === 'card' || e.type === 'card') && (side === 'home' ? (e.isHome || e.team === 'home') : (!e.isHome || e.team === 'away')));
  if (goals.length === 0 && cards.length === 0) return null;
  return (
    <div className={'flex flex-wrap gap-1 justify-' + (side === 'home' ? 'end' : 'start') + ' mt-1'}>
      {goals.filter((g: any) => side === 'home' ? (g.isHome || g.team === 'home') : (!g.isHome || g.team === 'away')).map((g: any, i: number) => (
        <span key={i} className='text-[10px] bg-primary/15 text-primary px-1 py-0.5 rounded'>{g.time || g.minute || ''}' {g.player?.name?.split(' ').pop() || ''}</span>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function MatchAnalysis() {
  const [, params] = useRoute('/analysis/:id');
  const [, setLocation] = useLocation();
  const fixtureId = params?.id;
  const [tab, setTab] = useState('overview');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [cached, setCached] = useState(false);

  const load = async (force = false) => {
    if (!fixtureId) return;
    setLoading(true); setError(null); setErrorCode(null);
    try {
      const res = await fetchApi('/deep-analysis/' + fixtureId + (force ? '?bust=' + Date.now() : ''));
      setData(res); setCached(!!res.cached);
    } catch (err: any) {
      setError(err?.message || 'Failed to load analysis');
      setErrorCode(err?.data?.code || null);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [fixtureId]);

  const fix = data?.fixture;
  const isLive = fix && ['LIVE','HT','1H','2H','ET','PEN'].includes(fix.status || '');
  const isFinished = fix && ['FT','AET','Pen'].includes(fix.status || '');

  return (
    <div className='min-h-screen bg-background'>
      <Header />
      <div className='max-w-md mx-auto px-4 pb-28'>
        <button onClick={() => setLocation('/')} className='flex items-center gap-2 text-sm text-white/50 hover:text-white transition pt-4 pb-2'>
          <ArrowLeft className='w-4 h-4' /> Back
        </button>
        {loading && (
          <div className='flex flex-col items-center justify-center py-24 gap-4'>
            <div className='w-12 h-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin' />
            <p className='text-sm text-white/40'>Fetching deep analysis...</p>
            <p className='text-xs text-white/20'>Calling SportsAPIPRO — may take 5-10s on first load</p>
          </div>
        )}
        {!loading && error && (
          <div className='flex flex-col items-center py-16 gap-4 text-center'>
            <div className='w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center'>
              {errorCode === 'subscription_required' ? <Lock className='w-6 h-6 text-red-400' /> : <AlertCircle className='w-6 h-6 text-red-400' />}
            </div>
            <p className='text-base font-bold text-white'>{errorCode === 'subscription_required' ? 'Premium Required' : errorCode === 'daily_limit' ? 'Daily Limit Reached' : errorCode === 'no_mapping' ? 'Match Not Found' : 'Analysis Unavailable'}</p>
            <p className='text-sm text-white/50 max-w-xs leading-relaxed'>{error}</p>
            {errorCode === 'subscription_required' && <button onClick={() => setLocation('/paywall')} className='px-6 py-2.5 rounded-xl bg-primary text-black font-black text-sm'>Upgrade to Premium</button>}
            {errorCode !== 'subscription_required' && <button onClick={() => load()} className='flex items-center gap-2 px-4 py-2 rounded-xl bg-white/8 text-white text-sm font-bold hover:bg-white/12 transition'><RefreshCw className='w-4 h-4' />Try Again</button>}
          </div>
        )}
        {!loading && data && fix && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className='space-y-4'>
            <div className='rounded-2xl border border-white/8 bg-white/3 p-4'>
              <p className='text-[10px] text-white/30 uppercase tracking-widest mb-3 truncate'>{fix.tournament}</p>
              <div className='flex items-center gap-3'>
                <div className='flex flex-col items-center gap-1.5 flex-1'>
                  <TeamLogo src={fix.homeLogo} name={fix.home} />
                  <p className='text-sm font-bold text-white text-center leading-tight'>{fix.home}</p>
                  {(isLive || isFinished) && <p className='text-3xl font-black text-primary tabular-nums'>{fix.homeScore ?? '-'}</p>}
                </div>
                <div className='flex flex-col items-center gap-1 shrink-0'>
                  {isLive ? (
                    <div className='flex items-center gap-1'>
                      <span className='w-2 h-2 rounded-full bg-red-500 animate-pulse' />
                      <span className='text-xs font-black text-red-400'>LIVE {fix.liveMinute || ''}</span>
                    </div>
                  ) : isFinished ? <span className='text-xs text-white/30 font-bold'>FT</span> : <span className='text-sm text-white/30'>vs</span>}
                  <span className='text-[10px] text-white/20 text-center'>{toWAT(fix.date)}</span>
                  {cached && <span className='text-[9px] text-white/15'>cached</span>}
                </div>
                <div className='flex flex-col items-center gap-1.5 flex-1'>
                  <TeamLogo src={fix.awayLogo} name={fix.away} />
                  <p className='text-sm font-bold text-white text-center leading-tight'>{fix.away}</p>
                  {(isLive || isFinished) && <p className='text-3xl font-black text-blue-400 tabular-nums'>{fix.awayScore ?? '-'}</p>}
                </div>
              </div>
            </div>
            <div className='flex overflow-x-auto gap-1.5 pb-1 scrollbar-none'>
              {TABS.map(t => {
                const Icon = t.icon;
                return (
                  <button key={t.id} onClick={() => setTab(t.id)}
                    className={'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all shrink-0 ' + (tab === t.id ? 'bg-primary/15 text-primary border border-primary/30' : 'bg-white/5 text-white/40 border border-white/8 hover:text-white/70')}>
                    <Icon className='w-3 h-3' />{t.label}
                  </button>
                );
              })}
            </div>
            <AnimatePresence mode='wait'>
              <motion.div key={tab} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.15 }}>
                {tab === 'overview' && <OverviewTab data={data} />}
                {tab === 'lineups' && <LineupsTab data={data} />}
                {tab === 'h2h' && <H2HTab data={data} />}
                {tab === 'form' && <FormTab data={data} />}
                {tab === 'odds' && <OddsTab data={data} />}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </div>
  );
}
