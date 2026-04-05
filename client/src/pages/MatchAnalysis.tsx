import { useState, useEffect } from 'react';
import { useRoute, useLocation } from 'wouter';
import { fetchApi } from '@/lib/api';
import { Header } from '@/components/layout/Header';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Loader2, AlertCircle, BarChart2, Users, GitMerge, TrendingUp, DollarSign, Lock, RefreshCw, Shield, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

function TeamLogo({ src, name }: { src?: string | null; name: string }) {
  const [err, setErr] = useState(false);
  if (src && !err) return <img src={src} alt={name} onError={() => setErr(true)} className='w-10 h-10 rounded-full object-contain bg-white/5 border border-white/10' loading='lazy' />;
  return <div className='w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-black text-primary'>{name.slice(0,2).toUpperCase()}</div>;
}

function toWAT(d: string) { try { return new Date(d).toLocaleString('en-NG', { timeZone: 'Africa/Lagos', dateStyle: 'medium', timeStyle: 'short' }); } catch { return d; } }

const TABS = [
  { id: 'overview', label: 'Overview', icon: BarChart2 },
  { id: 'lineups', label: 'Lineups', icon: Users },
  { id: 'h2h', label: 'H2H', icon: GitMerge },
  { id: 'form', label: 'Form', icon: TrendingUp },
  { id: 'odds', label: 'Odds', icon: DollarSign },
];

function StatBar({ label, home, away, homeVal, awayVal }: { label: string; home: string; away: string; homeVal: number; awayVal: number }) {
  const total = homeVal + awayVal || 1;
  const homePct = Math.round((homeVal / total) * 100);
  const awayPct = 100 - homePct;
  return (
    <div className='space-y-1'>
      <div className='flex justify-between text-xs text-white/50'>
        <span className='font-bold text-white'>{home}</span>
        <span className='text-[10px] text-primary/70 uppercase tracking-wider'>{label}</span>
        <span className='font-bold text-white'>{away}</span>
      </div>
      <div className='flex h-1.5 rounded-full overflow-hidden gap-0.5'>
        <div className='bg-primary rounded-full transition-all' style={{ width: homePct + '%' }} />
        <div className='bg-blue-400 rounded-full transition-all' style={{ width: awayPct + '%' }} />
      </div>
    </div>
  );
}

function OverviewTab({ data }: { data: any }) {
  const stats = data.statistics;
  const fix = data.fixture;
  if (!stats) return <div className='text-center py-12 text-white/30 text-sm'>Statistics not yet available for this match.</div>;
  const getVal = (arr: any[], type: string, team: string) => {
    if (!arr) return 0;
    const item = arr.find((s: any) => (s.type || s.name || '').toLowerCase().includes(type.toLowerCase()));
    if (!item) return 0;
    const v = team === 'home' ? (item.homeValue || item.home) : (item.awayValue || item.away);
    return typeof v === 'number' ? v : (parseFloat(v) || 0);
  };
  const rows = stats.statistics || stats;
  const statList = Array.isArray(rows) ? rows : [];
  const poss = statList.find((s: any) => (s.type || s.name || '').toLowerCase().includes('possession'));
  const homePoss = poss ? parseInt(poss.homeValue || poss.home || '50') : 50;
  const awayPoss = 100 - homePoss;
  return (
    <div className='space-y-4 py-2'>
      <div className='flex items-center gap-3 p-3 rounded-xl bg-white/4 border border-white/8'>
        <div className='flex-1 text-center'><p className='text-2xl font-black text-primary'>{homePoss}%</p><p className='text-[10px] text-white/40'>Possession</p></div>
        <div className='w-px h-10 bg-white/10' />
        <div className='flex-1 text-center'><p className='text-2xl font-black text-blue-400'>{awayPoss}%</p><p className='text-[10px] text-white/40'>Possession</p></div>
      </div>
      {statList.slice(0, 8).map((s: any, i: number) => {
        const type = s.type || s.name || 'Stat';
        const hv = parseFloat(s.homeValue || s.home || '0') || 0;
        const av = parseFloat(s.awayValue || s.away || '0') || 0;
        return <StatBar key={i} label={type} home={String(hv)} away={String(av)} homeVal={hv} awayVal={av} />;
      })}
    </div>
  );
}

function PlayerList({ players, title, color }: { players: any[]; title: string; color: string }) {
  if (!players || players.length === 0) return <div className='text-center py-6 text-white/30 text-xs'>No lineup data</div>;
  return (
    <div>
      <p className={'text-xs font-black uppercase tracking-wider mb-2 ' + color}>{title}</p>
      <div className='space-y-1'>
        {players.map((p: any, i: number) => (
          <div key={i} className='flex items-center gap-2 px-3 py-2 rounded-lg bg-white/4 border border-white/6'>
            <span className='text-[10px] text-white/30 w-6 text-right'>{p.jerseyNumber || p.shirtNumber || p.number || (i + 1)}</span>
            <span className='text-sm font-semibold text-white truncate'>{p.name || p.playerName || 'Player'}</span>
            <span className='ml-auto text-[10px] text-white/30'>{p.position || p.positionName || ''}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LineupsTab({ data }: { data: any }) {
  const lin = data.lineups;
  const isPred = data.isPredicted;
  if (!lin) return <div className='text-center py-12 text-white/30 text-sm'>Lineups not available yet. Check back closer to kick-off.</div>;
  const home = lin.home || lin.homeTeam || {};
  const away = lin.away || lin.awayTeam || {};
  const homePlayers = home.players || home.starters || home.startXI || [];
  const awayPlayers = away.players || away.starters || away.startXI || [];
  const homeFormation = home.formation || '';
  const awayFormation = away.formation || '';
  return (
    <div className='space-y-4'>
      {isPred && <div className='flex items-center gap-2 px-3 py-2 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-xs'><Zap className='w-3 h-3' />Predicted lineups — official lineups available 30min before kick-off</div>}
      <div className='grid grid-cols-2 gap-3'>
        <div>
          {homeFormation && <p className='text-[10px] text-primary/60 text-center mb-2'>Formation: {homeFormation}</p>}
          <PlayerList players={homePlayers} title={data.fixture.home} color='text-primary' />
        </div>
        <div>
          {awayFormation && <p className='text-[10px] text-blue-400/60 text-center mb-2'>Formation: {awayFormation}</p>}
          <PlayerList players={awayPlayers} title={data.fixture.away} color='text-blue-400' />
        </div>
      </div>
    </div>
  );
}

function H2HTab({ data }: { data: any }) {
  const h2h = data.h2h;
  if (!h2h) return <div className='text-center py-12 text-white/30 text-sm'>H2H data not available for this match.</div>;
  const events = h2h.events || h2h.matches || h2h.results || (Array.isArray(h2h) ? h2h : []);
  const homeWins = events.filter((e: any) => { const r = e.result || e.outcome || ''; return r.toLowerCase().includes('home') || (e.homeScore > e.awayScore); }).length;
  const awayWins = events.filter((e: any) => { const r = e.result || e.outcome || ''; return r.toLowerCase().includes('away') || (e.awayScore > e.homeScore); }).length;
  const draws = events.length - homeWins - awayWins;
  return (
    <div className='space-y-4'>
      <div className='grid grid-cols-3 gap-2 p-3 rounded-xl bg-white/4 border border-white/8 text-center'>
        <div><p className='text-xl font-black text-primary'>{homeWins}</p><p className='text-[10px] text-white/40'>{data.fixture.home} Wins</p></div>
        <div><p className='text-xl font-black text-white/50'>{draws}</p><p className='text-[10px] text-white/40'>Draws</p></div>
        <div><p className='text-xl font-black text-blue-400'>{awayWins}</p><p className='text-[10px] text-white/40'>{data.fixture.away} Wins</p></div>
      </div>
      <div className='space-y-2'>
        {events.slice(0, 8).map((ev: any, i: number) => {
          const hg = ev.homeScore ?? ev.home_goals ?? ev.homeGoals ?? '?';
          const ag = ev.awayScore ?? ev.away_goals ?? ev.awayGoals ?? '?';
          const ht = ev.homeTeam?.name || ev.home_team || ev.home || data.fixture.home;
          const at = ev.awayTeam?.name || ev.away_team || ev.away || data.fixture.away;
          const dt = ev.startTimestamp ? new Date(ev.startTimestamp * 1000).getFullYear() : (ev.date || ev.matchDate || '').slice(0, 4);
          return (
            <div key={i} className='flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/4 border border-white/8 text-sm'>
              <span className='text-[10px] text-white/30 w-8 shrink-0'>{dt}</span>
              <span className='flex-1 truncate text-white/70'>{ht}</span>
              <span className='font-black text-white px-2'>{hg} - {ag}</span>
              <span className='flex-1 truncate text-right text-white/70'>{at}</span>
            </div>
          );
        })}
        {events.length === 0 && <p className='text-center text-white/30 text-sm py-4'>No recent H2H matches found.</p>}
      </div>
    </div>
  );
}

function FormRow({ matches, label, color }: { matches: any[]; label: string; color: string }) {
  if (!matches || matches.length === 0) return null;
  return (
    <div>
      <p className={'text-xs font-black uppercase tracking-wider mb-2 ' + color}>{label}</p>
      <div className='flex gap-1.5 flex-wrap'>
        {matches.slice(0, 6).map((m: any, i: number) => {
          const res = m.result || m.outcome || '';
          const isW = res === 'W' || res === 'win' || m.won;
          const isD = res === 'D' || res === 'draw' || m.drawn;
          const isL = res === 'L' || res === 'loss' || m.lost;
          return (
            <div key={i} className={'w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black ' + (isW ? 'bg-primary/20 text-primary border border-primary/30' : isD ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30')}>
              {isW ? 'W' : isD ? 'D' : 'L'}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FormTab({ data }: { data: any }) {
  const form = data.pregameForm;
  if (!form) return <div className='text-center py-12 text-white/30 text-sm'>Pre-game form not available for this match.</div>;
  const homeForm = form.homeTeam?.form || form.home?.form || form.homeForm || [];
  const awayForm = form.awayTeam?.form || form.away?.form || form.awayForm || [];
  const allMatches = form.events || form.matches || [];
  const homeRecent = allMatches.filter((m: any) => (m.homeTeam?.id || m.home_team_id) === (form.homeTeam?.id || form.home?.id)).slice(0, 5);
  const awayRecent = allMatches.filter((m: any) => (m.awayTeam?.id || m.away_team_id) === (form.awayTeam?.id || form.away?.id)).slice(0, 5);
  const homeMatches = homeForm.length > 0 ? homeForm : homeRecent;
  const awayMatches = awayForm.length > 0 ? awayForm : awayRecent;
  return (
    <div className='space-y-6'>
      <FormRow matches={homeMatches} label={data.fixture.home + ' Recent Form'} color='text-primary' />
      <FormRow matches={awayMatches} label={data.fixture.away + ' Recent Form'} color='text-blue-400' />
      {homeMatches.length === 0 && awayMatches.length === 0 && <p className='text-center text-white/30 text-sm py-4'>No form data available.</p>}
    </div>
  );
}

function OddsTab({ data }: { data: any }) {
  const odds = data.odds;
  const fix = data.fixture;
  const fallbackOdds = { home: fix.oddsHome, draw: fix.oddsDraw, away: fix.oddsAway };
  if (!odds && !fallbackOdds.home) return <div className='text-center py-12 text-white/30 text-sm'>Odds data not available for this match.</div>;
  const markets = odds ? (odds.markets || odds.odds || (Array.isArray(odds) ? odds : [])) : [];
  const matchResult = markets.find((m: any) => (m.name || m.marketName || '').toLowerCase().includes('match')) || markets[0];
  const h = matchResult?.outcomes?.[0]?.odds || matchResult?.homeOdds || matchResult?.home || fallbackOdds.home;
  const d = matchResult?.outcomes?.[1]?.odds || matchResult?.drawOdds || matchResult?.draw || fallbackOdds.draw;
  const a = matchResult?.outcomes?.[2]?.odds || matchResult?.awayOdds || matchResult?.away || fallbackOdds.away;
  return (
    <div className='space-y-4'>
      <div className='grid grid-cols-3 gap-2'>
        {[{ label: '1 Home', val: h, color: 'text-primary' }, { label: 'X Draw', val: d, color: 'text-white/60' }, { label: '2 Away', val: a, color: 'text-blue-400' }].map(({ label, val, color }) => (
          <div key={label} className='flex flex-col items-center p-3 rounded-xl bg-white/5 border border-white/10'>
            <p className='text-[10px] text-white/40 mb-1'>{label}</p>
            <p className={'text-xl font-black ' + color}>{val ? parseFloat(String(val)).toFixed(2) : '?'}</p>
          </div>
        ))}
      </div>
      {markets.slice(1, 6).map((mkt: any, i: number) => {
        const name = mkt.name || mkt.marketName || 'Market ' + (i + 2);
        const outs = mkt.outcomes || [];
        return (
          <div key={i} className='p-3 rounded-xl bg-white/4 border border-white/8'>
            <p className='text-xs font-bold text-white/60 mb-2'>{name}</p>
            <div className='flex gap-2 flex-wrap'>
              {outs.map((o: any, j: number) => (
                <div key={j} className='flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/5 border border-white/10'>
                  <span className='text-xs text-white/50'>{o.name || o.outcome || ''}</span>
                  <span className='text-xs font-black text-white'>{o.odds ? parseFloat(o.odds).toFixed(2) : ''}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

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

  const load = async () => {
    if (!fixtureId) return;
    setLoading(true); setError(null); setErrorCode(null);
    try {
      const res = await fetchApi('/deep-analysis/' + fixtureId);
      setData(res);
      setCached(!!res.cached);
    } catch (err: any) {
      const msg = err?.message || 'Failed to load analysis';
      const code = err?.data?.code || null;
      setError(msg);
      setErrorCode(code);
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
            <p className='text-xs text-white/20'>Calling SportsAPIPRO — first load takes ~5s</p>
          </div>
        )}
        {!loading && error && (
          <div className='flex flex-col items-center py-16 gap-4 text-center'>
            <div className='w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center'>
              {errorCode === 'subscription_required' ? <Lock className='w-6 h-6 text-red-400' /> : <AlertCircle className='w-6 h-6 text-red-400' />}
            </div>
            <p className='text-base font-bold text-white'>{errorCode === 'subscription_required' ? 'Premium Required' : errorCode === 'daily_limit' ? 'Daily Limit Reached' : 'Analysis Unavailable'}</p>
            <p className='text-sm text-white/50 max-w-xs'>{error}</p>
            {errorCode === 'subscription_required' && <button onClick={() => setLocation('/paywall')} className='px-6 py-2.5 rounded-xl bg-primary text-black font-black text-sm'>Upgrade to Premium</button>}
            {errorCode !== 'subscription_required' && <button onClick={load} className='flex items-center gap-2 px-4 py-2 rounded-xl bg-white/8 text-white text-sm font-bold hover:bg-white/12 transition'><RefreshCw className='w-4 h-4' />Try Again</button>}
          </div>
        )}
        {!loading && data && fix && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className='space-y-4'>
            <div className='rounded-2xl border border-white/8 bg-white/3 p-4'>
              <p className='text-[10px] text-white/30 uppercase tracking-widest mb-3'>{fix.tournament}</p>
              <div className='flex items-center gap-3'>
                <div className='flex flex-col items-center gap-1 flex-1'>
                  <TeamLogo src={fix.homeLogo} name={fix.home} />
                  <p className='text-sm font-bold text-white text-center'>{fix.home}</p>
                  {(isLive || isFinished) && <p className='text-3xl font-black text-primary'>{fix.homeScore ?? '-'}</p>}
                </div>
                <div className='flex flex-col items-center gap-1'>
                  {isLive ? <div className='flex items-center gap-1'><span className='w-2 h-2 rounded-full bg-red-500 animate-pulse' /><span className='text-xs font-black text-red-400'>{fix.liveMinute || 'LIVE'}</span></div> : isFinished ? <span className='text-xs text-white/30 font-bold'>FT</span> : <span className='text-sm text-white/40'>vs</span>}
                  <span className='text-xs text-white/20'>{toWAT(fix.date)}</span>
                </div>
                <div className='flex flex-col items-center gap-1 flex-1'>
                  <TeamLogo src={fix.awayLogo} name={fix.away} />
                  <p className='text-sm font-bold text-white text-center'>{fix.away}</p>
                  {(isLive || isFinished) && <p className='text-3xl font-black text-blue-400'>{fix.awayScore ?? '-'}</p>}
                </div>
              </div>
              {cached && <p className='text-[10px] text-white/20 text-center mt-2'>Cached result</p>}
            </div>
            <div className='flex overflow-x-auto gap-1 pb-1 -mx-1 px-1'>
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
              <motion.div key={tab} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.15 }}>
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
