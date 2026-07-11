import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/api";
import { Users, AlertCircle } from "lucide-react";

function getPlayerName(p: any) {
  return p?.name || p?.player_name || p?.player?.name || p?.short_name || 'Unknown player';
}

function getMissingReason(p: any) {
  return p?.reason || p?.status || p?.type || 'Unavailable';
}

export function LineupsTab({ matchData, fixtureId }: { matchData?: any, fixtureId?: string }) {
  // Fix #6: Use matchData (already fetched by parent MatchCenter) instead of re-fetching.
  // Previously this fired a separate /predicted-lineup/:fixtureId request that triggered
  // another full ensureFixtureData BSD gauntlet (10-30s). Now we only fetch as a fallback
  // when matchData doesn't have lineup data.
  const metaLineups = matchData?.meta?.lineups || matchData?.meta?.predicted_lineup;
  const metaUnavailable = matchData?.meta?.unavailable_players;

  const { data, isLoading } = useQuery({
    queryKey: ['predicted-lineup', fixtureId],
    queryFn: async () => {
      if (!fixtureId) return null;
      const res = await fetchApi(`/predicted-lineup/${fixtureId}/`);
      return res;
    },
    // Only fetch from API if matchData doesn't already have lineup data
    enabled: !!fixtureId && !metaLineups,
    staleTime: 5 * 60 * 1000, // 5 min — don't refetch on tab switches
  });

  const isLiveFormat = Array.isArray(metaLineups);

  let homeLineup: any[] = [];
  let awayLineup: any[] = [];
  let homeSubs: any[] = [];
  let awaySubs: any[] = [];
  let homeUnavailable: any[] = [];
  let awayUnavailable: any[] = [];
  let homeFormation = null;
  let awayFormation = null;

  if (isLiveFormat) {
    const allPlayers = metaLineups || [];
    homeLineup = allPlayers.filter((p: any) => p.is_home);
    awayLineup = allPlayers.filter((p: any) => !p.is_home);
  } else if (metaLineups && (metaLineups.home || metaLineups.away)) {
    // Use lineup data from matchData.meta (already fetched by MatchCenter)
    homeLineup = metaLineups.home?.starters || metaLineups.home?.players || [];
    awayLineup = metaLineups.away?.starters || metaLineups.away?.players || [];
    homeSubs = metaLineups.home?.substitutes || [];
    awaySubs = metaLineups.away?.substitutes || [];
    homeFormation = metaLineups.home?.formation || metaLineups.home?.predicted_formation;
    awayFormation = metaLineups.away?.formation || metaLineups.away?.predicted_formation;
  } else if (data && data.lineups) {
    homeLineup = data.lineups.home?.starters || data.lineups.home?.players || [];
    awayLineup = data.lineups.away?.starters || data.lineups.away?.players || [];
    homeSubs = data.lineups.home?.substitutes || [];
    awaySubs = data.lineups.away?.substitutes || [];
    homeUnavailable = data.lineups.home?.unavailable || [];
    awayUnavailable = data.lineups.away?.unavailable || [];
    homeFormation = data.lineups.home?.predicted_formation || data.lineups.home?.formation;
    awayFormation = data.lineups.away?.predicted_formation || data.lineups.away?.formation;
  } else {
    homeLineup = metaLineups?.home?.players || [];
    awayLineup = metaLineups?.away?.players || [];
    homeSubs = matchData?.meta?.lineups?.home?.substitutes || [];
    awaySubs = matchData?.meta?.lineups?.away?.substitutes || [];
    homeFormation = matchData?.meta?.lineups?.home?.formation || null;
    awayFormation = matchData?.meta?.lineups?.away?.formation || null;
  }

  // BSD v2 enrichment stores unavailable players in meta.injuries or meta.unavailable_players.
  // Use them as a fallback when the fresh lineup endpoint has no unavailable block.
  if (homeUnavailable.length === 0) homeUnavailable = metaUnavailable?.home || matchData?.meta?.injuries?.home || [];
  if (awayUnavailable.length === 0) awayUnavailable = metaUnavailable?.away || matchData?.meta?.injuries?.away || [];

  const hasLineups = homeLineup.length > 0 || awayLineup.length > 0;
  const hasMissingPlayers = homeUnavailable.length > 0 || awayUnavailable.length > 0;

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-10 h-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative rounded-2xl overflow-hidden mb-4">
        {/* Cinematic green glow backdrop */}
        <div className="absolute inset-0 z-0 pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent" />
          <div className="absolute -top-10 -right-10 w-[200%] h-[200%] opacity-[0.07]" style={{ background: 'repeating-linear-gradient(135deg, transparent, transparent 40px, rgba(16,231,116,0.3) 40px, rgba(16,231,116,0.3) 42px)' }} />
          <div className="absolute bottom-0 left-0 w-[60%] h-[80%] bg-primary/10 blur-[60px] rounded-full" />
          <div className="absolute top-0 right-[20%] w-[40%] h-[60%] bg-primary/8 blur-[50px] rounded-full" />
        </div>
        <div className="relative z-10 border border-primary/15 p-4 backdrop-blur-sm h-full">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-black text-white/40 uppercase tracking-wider">Starting XIs & Formations</p>
          {data?.beta && (
            <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-primary/20 text-primary border border-primary/30 uppercase">
              AI PREDICTED
            </span>
          )}
        </div>

        {hasLineups ? (
          <div className="space-y-6">
             <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex flex-col items-center mb-3 pb-2 border-b border-white/10">
                    <h3 className="text-sm font-bold text-white text-center leading-tight mb-1">{matchData?.fixture?.home_team_name}</h3>
                    {homeFormation && <span className="text-[10px] text-white/40 bg-white/5 px-2 py-0.5 rounded-full">{homeFormation}</span>}
                  </div>
                  <ul className="space-y-1.5">
                    {homeLineup.map((l: any, i: number) => (
                      <li key={i} className="text-xs text-white/80 flex items-center justify-between bg-white/[0.02] p-1.5 rounded-lg border border-white/[0.03]">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-mono text-white/30 w-4 text-right">{l.jersey_number || "-"}</span>
                          <span>{l.player_name || l.name}</span>
                        </div>
                        <span className="text-[9px] font-bold text-white/40 bg-white/5 px-1.5 py-0.5 rounded">{l.position}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="flex flex-col items-center mb-3 pb-2 border-b border-white/10">
                    <h3 className="text-sm font-bold text-white text-center leading-tight mb-1">{matchData?.fixture?.away_team_name}</h3>
                    {awayFormation && <span className="text-[10px] text-white/40 bg-white/5 px-2 py-0.5 rounded-full">{awayFormation}</span>}
                  </div>
                  <ul className="space-y-1.5">
                    {awayLineup.map((l: any, i: number) => (
                      <li key={i} className="text-xs text-white/80 flex items-center justify-between bg-white/[0.02] p-1.5 rounded-lg border border-white/[0.03]">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-mono text-white/30 w-4 text-right">{l.jersey_number || "-"}</span>
                          <span>{l.player_name || l.name}</span>
                        </div>
                        <span className="text-[9px] font-bold text-white/40 bg-white/5 px-1.5 py-0.5 rounded">{l.position}</span>
                      </li>
                    ))}
                  </ul>
                </div>
             </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center p-8 bg-black/20 rounded-xl">
             <Users className="w-8 h-8 text-white/10 mb-2" />
             <p className="text-xs text-white/30 font-medium">Lineups will be available closer to kick-off</p>
          </div>
        )}

        {hasMissingPlayers && (
          <div className="mt-4 pt-4 border-t border-white/[0.05]">
            <p className="text-[10px] font-black text-red-400/80 uppercase tracking-wider mb-3 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> Missing Players
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[9px] text-white/30 uppercase mb-2">{matchData?.fixture?.home_team_name || 'Home'}</p>
                {homeUnavailable.length === 0 ? <p className="text-[10px] text-white/25">No major absences listed</p> : homeUnavailable.map((p: any, i: number) => (
                  <div key={i} className="text-[10px] mb-1 flex flex-col bg-red-500/5 p-1.5 rounded border border-red-500/10">
                    <span className="text-white/70 font-medium">{getPlayerName(p)}</span>
                    <span className="text-red-400/60">{getMissingReason(p)}</span>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-[9px] text-white/30 uppercase mb-2">{matchData?.fixture?.away_team_name || 'Away'}</p>
                {awayUnavailable.length === 0 ? <p className="text-[10px] text-white/25">No major absences listed</p> : awayUnavailable.map((p: any, i: number) => (
                  <div key={i} className="text-[10px] mb-1 flex flex-col bg-red-500/5 p-1.5 rounded border border-red-500/10">
                    <span className="text-white/70 font-medium">{getPlayerName(p)}</span>
                    <span className="text-red-400/60">{getMissingReason(p)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  </div>
  );
}
