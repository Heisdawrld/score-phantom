import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  ArrowLeft,
  BarChart2,
  Grid2x2,
  Info,
  Lock,
  MessageCircle,
  Radio,
  Share2,
  Target,
  Trophy,
  Users,
} from "lucide-react";
import { fetchApi } from "@/lib/api";
import { useAccess } from "@/hooks/use-access";
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";
import { cn } from "@/lib/utils";
import { TeamLogo } from "@/components/TeamLogo";

const PredictionTab = lazy(() => import("@/components/match/PredictionTab").then((m) => ({ default: m.PredictionTab })));
const StatsTab = lazy(() => import("@/components/match/StatsTab").then((m) => ({ default: m.StatsTab })));
const LeagueTab = lazy(() => import("@/components/match/LeagueTab").then((m) => ({ default: m.LeagueTab })));
const PitchTab = lazy(() => import("@/components/match/PitchTab").then((m) => ({ default: m.PitchTab })));
const LineupsTab = lazy(() => import("@/components/match/LineupsTab").then((m) => ({ default: m.LineupsTab })));
const PhantomChatTab = lazy(() => import("@/components/match/PhantomChatTab").then((m) => ({ default: m.PhantomChatTab })));

function ordinal(n: number) {
  const suffixes = ["th", "st", "nd", "rd"];
  const value = n % 100;
  return n + (value >= 11 && value <= 13 ? suffixes[0] : suffixes[value % 10] || suffixes[0]);
}

export function SpiralWatermark() {
  return (
    <svg
      width="110"
      height="110"
      viewBox="0 0 110 110"
      fill="none"
      aria-hidden="true"
      className="absolute top-3 right-3 opacity-[0.06] pointer-events-none text-primary"
    >
      {[50, 38, 27, 16, 6].map((radius) => (
        <circle key={radius} cx="55" cy="55" r={radius} stroke="currentColor" strokeWidth="1.5" />
      ))}
      <circle cx="55" cy="55" r="2" fill="currentColor" />
    </svg>
  );
}

const TABS = [
  {
    key: "Prediction",
    label: "Prediction",
    eyebrow: "Phantom verdict",
    title: "Model Intelligence",
    description: "The strongest angle, confidence, market value and the signals behind the call.",
    Icon: Target,
  },
  {
    key: "Stats",
    label: "Stats",
    eyebrow: "Performance lab",
    title: "Form & Matchup",
    description: "Recent form, scoring behaviour and head-to-head context in one comparison view.",
    Icon: BarChart2,
  },
  {
    key: "Pitch",
    label: "Pitch",
    eyebrow: "Live room",
    title: "Match Pulse",
    description: "Momentum, shot quality and the sequence of events as the game develops.",
    Icon: Grid2x2,
  },
  {
    key: "Lineups",
    label: "Lineups",
    eyebrow: "Team intelligence",
    title: "Shape & Availability",
    description: "Starting elevens, formations, predicted personnel and important absences.",
    Icon: Users,
  },
  {
    key: "League",
    label: "League",
    eyebrow: "Competition context",
    title: "Table Pressure",
    description: "See exactly what this fixture means for both teams in the current standings.",
    Icon: Trophy,
  },
  {
    key: "PhantomChat",
    label: "PhantomChat",
    eyebrow: "Ask the model",
    title: "Match Analyst",
    description: "Interrogate the data, test an angle or ask for a safer alternative in real time.",
    Icon: MessageCircle,
  },
] as const;

function MatchLoading() {
  return (
    <div className="match-center__loading" role="status" aria-label="Loading match intelligence">
      <span />
      <p>Building the match intelligence room</p>
    </div>
  );
}

export default function MatchCenter() {
  const params = useParams();
  const fixtureId = params?.id;
  const [, setLocation] = useLocation();
  const { isPremium, isLoading: authLoading } = useAccess();
  const [tab, setTab] = useState("Prediction");

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["/api/matches", fixtureId],
    queryFn: () => fetchApi("/matches/" + fixtureId),
    staleTime: 30 * 1000,
    refetchInterval: (query) => {
      const match = query?.state?.data as any;
      const status = String(match?.fixture?.match_status || "").toUpperCase();
      return ["LIVE", "HT", "1H", "2H", "ET", "PEN"].includes(status) ? 30000 : false;
    },
    enabled: !!fixtureId,
  });

  const { data: predictionData } = useQuery({
    queryKey: ["/api/predict", fixtureId],
    queryFn: () => fetchApi("/predict/" + fixtureId),
    enabled: !!fixtureId && !!isPremium,
    staleTime: 5 * 60 * 1000,
  });

  const d = data as any;
  const fix = d?.fixture || {};
  const statusUpper = String(fix.match_status || "").toUpperCase();
  const isLive = ["LIVE", "HT", "1H", "2H", "ET", "PEN"].includes(statusUpper);
  const isFT =
    ["FT", "AET", "PEN_FT", "PENS"].includes(statusUpper) ||
    (statusUpper === "PEN" && String(fix.match_status || "") === "Pen");
  const kickoff = fix.match_date ? new Date(fix.match_date) : null;
  const matchTime = kickoff
    ? kickoff.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : "TBC";
  const matchDate = kickoff
    ? kickoff.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" })
    : "Fixture date pending";

  const { addRecentlyViewed } = useRecentlyViewed();
  const trackedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!fix.id || trackedRef.current === String(fix.id)) return;
    trackedRef.current = String(fix.id);
    addRecentlyViewed({
      fixtureId: String(fix.id),
      homeTeam: fix.home_team_name || "Home",
      awayTeam: fix.away_team_name || "Away",
      homeLogo: fix.home_team_logo,
      awayLogo: fix.away_team_logo,
      tournament: fix.tournament_name,
      pick: (predictionData as any)?.recommendation?.pick || (predictionData as any)?.pick || undefined,
      probability:
        (predictionData as any)?.recommendation?.probability ??
        (predictionData as any)?.probability ??
        undefined,
    });
  }, [
    fix.id,
    fix.home_team_name,
    fix.away_team_name,
    fix.home_team_logo,
    fix.away_team_logo,
    fix.tournament_name,
    predictionData,
    addRecentlyViewed,
  ]);

  const { homePos, awayPos } = useMemo(() => {
    const standings = Array.isArray(d?.standings)
      ? d.standings
      : Array.isArray(d?.meta?.standings)
        ? d.meta.standings
        : [];
    const home = standings.find((row: any) =>
      (row.team || "").toLowerCase().includes((fix.home_team_name || "").toLowerCase().split(" ")[0]),
    );
    const away = standings.find((row: any) =>
      (row.team || "").toLowerCase().includes((fix.away_team_name || "").toLowerCase().split(" ")[0]),
    );
    return { homePos: home, awayPos: away };
  }, [d?.standings, d?.meta?.standings, fix.home_team_name, fix.away_team_name]);

  const recommendation =
    (predictionData as any)?.predictions?.recommendation ||
    (predictionData as any)?.recommendation ||
    {};
  const modelConfidence =
    recommendation.probability_pct ??
    (recommendation.probability != null ? Math.round(recommendation.probability * 100) : null);
  const modelPick = recommendation.pick || recommendation.selection || "No clear edge";
  const modelStatus = String(recommendation.advisor_status || (modelConfidence ? "MODEL READY" : "ANALYSING")).replace(/_/g, " ");
  const activeTab = TABS.find((item) => item.key === tab) || TABS[0];

  const goBack = () => {
    if (window.history.length > 1) window.history.back();
    else setLocation("/matches");
  };

  const shareMatch = () => {
    const text = `${fix.home_team_name || "Home"} vs ${fix.away_team_name || "Away"} on ScorePhantom`;
    if (navigator.share) {
      navigator.share({ title: "ScorePhantom Match Center", text, url: window.location.href }).catch(() => undefined);
      return;
    }
    navigator.clipboard?.writeText(window.location.href).catch(() => undefined);
  };

  return (
    <div className="match-center">
      <div className="match-center__world" aria-hidden="true">
        <span className="match-center__orb match-center__orb--one" />
        <span className="match-center__orb match-center__orb--two" />
        <span className="match-center__grid" />
      </div>

      <section className="match-center__hero">
        <div className="match-center__hero-inner">
          <div className="match-center__utility">
            <button type="button" onClick={goBack} className="match-center__back">
              <ArrowLeft size={16} />
              <span>All matches</span>
            </button>
            <div className="match-center__identity">
              <span className={cn("match-center__status-dot", isLive && "is-live")} />
              <span>Match Intelligence</span>
              <b>26/27</b>
            </div>
            <button type="button" onClick={shareMatch} className="match-center__share" aria-label="Share this match">
              <Share2 size={15} />
            </button>
          </div>

          <div className="match-center__competition">
            {fix.tournament_id ? (
              <img
                src={`https://sports.bzzoiro.com/img/league/${fix.tournament_id}/`}
                onError={(event) => {
                  event.currentTarget.style.display = "none";
                }}
                alt=""
              />
            ) : null}
            <span>{fix.tournament_name || "Competition"}</span>
            <i />
            <span>{matchDate}</span>
            <i />
            <span>{matchTime} local</span>
          </div>

          <div className="match-center__scoreboard">
            <div className="match-center__team match-center__team--home">
              <TeamLogo
                src={fix.home_team_logo}
                teamId={fix.home_team_id}
                name={fix.home_team_name || "Home"}
                size="xl"
                className="match-center__crest"
              />
              <div>
                <span>Home</span>
                <h1>{fix.home_team_name || "Home team"}</h1>
                {homePos ? <small>{ordinal(homePos.position)} · {homePos.points} pts</small> : <small>Season profile</small>}
              </div>
            </div>

            <div className="match-center__score">
              {isLive || isFT ? (
                <strong>
                  {fix.home_score ?? 0}
                  <span>:</span>
                  {fix.away_score ?? 0}
                </strong>
              ) : (
                <strong className="is-kickoff">
                  {matchTime}
                  <span>WAT</span>
                </strong>
              )}
              {isLive ? (
                <em className="is-live">
                  <Radio size={11} />
                  Live {fix.live_minute ? `${fix.live_minute}'` : ""}
                </em>
              ) : isFT ? (
                <em>Full time</em>
              ) : (
                <em>Kick-off</em>
              )}
            </div>

            <div className="match-center__team match-center__team--away">
              <TeamLogo
                src={fix.away_team_logo}
                teamId={fix.away_team_id}
                name={fix.away_team_name || "Away"}
                size="xl"
                className="match-center__crest"
              />
              <div>
                <span>Away</span>
                <h1>{fix.away_team_name || "Away team"}</h1>
                {awayPos ? <small>{ordinal(awayPos.position)} · {awayPos.points} pts</small> : <small>Season profile</small>}
              </div>
            </div>
          </div>

          <div className="match-center__intel-strip">
            <div>
              <span>
                <Activity size={12} />
                Phantom verdict
              </span>
              <strong>{authLoading ? "Loading…" : isPremium ? modelStatus : "Premium locked"}</strong>
            </div>
            <div>
              <span>Best model angle</span>
              <strong>{isPremium ? modelPick : "Unlock prediction"}</strong>
            </div>
            <div>
              <span>Model confidence</span>
              <strong className={cn(modelConfidence && modelConfidence >= 70 && "is-positive")}>
                {isPremium && modelConfidence != null ? `${modelConfidence}%` : "—"}
              </strong>
            </div>
            <div>
              <span>Data feed</span>
              <strong className="is-positive">{isLive ? "Live sync" : "Pre-match ready"}</strong>
            </div>
          </div>
        </div>
      </section>

      <div className="match-center__tabs-shell">
        <nav className="match-center__tabs" aria-label="Match intelligence sections">
          {TABS.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              aria-selected={tab === key}
              className={cn("match-center__tab", tab === key && "is-active")}
            >
              <Icon size={15} />
              <span>{label}</span>
              {key === "Prediction" && !isPremium ? <Lock size={10} className="match-center__tab-lock" /> : null}
            </button>
          ))}
        </nav>
      </div>

      <main className="match-center__content">
        {isLoading ? (
          <MatchLoading />
        ) : (
          <>
            <header className="match-center__panel-heading">
              <div>
                <span>{activeTab.eyebrow}</span>
                <h2>{activeTab.title}</h2>
              </div>
              <p>{activeTab.description}</p>
            </header>

            <AnimatePresence mode="wait">
              <motion.div
                key={tab}
                className="match-center__panel"
                initial={{ opacity: 0, y: 12, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -8, filter: "blur(3px)" }}
                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              >
                <Suspense fallback={<MatchLoading />}>
                  {tab === "Prediction" ? (
                    <>
                      {isFT ? (
                        <div className="match-center__notice">
                          <Info size={16} />
                          <div>
                            <strong>Review mode</strong>
                            <p>This completed match is kept here to audit the model call, not as an active pick.</p>
                          </div>
                        </div>
                      ) : null}
                      <PredictionTab
                        fixtureId={fixtureId}
                        isPremium={isPremium}
                        setLocation={setLocation}
                        matchData={d}
                        predictionData={predictionData}
                      />
                    </>
                  ) : null}
                  {tab === "Stats" ? <StatsTab d={d} /> : null}
                  {tab === "Pitch" ? <PitchTab matchData={d} /> : null}
                  {tab === "Lineups" ? <LineupsTab matchData={d} fixtureId={fixtureId} /> : null}
                  {tab === "League" ? <LeagueTab d={d} /> : null}
                  {tab === "PhantomChat" ? (
                    <PhantomChatTab fixtureId={fixtureId} isPremium={isPremium} setLocation={setLocation} />
                  ) : null}
                </Suspense>
              </motion.div>
            </AnimatePresence>
          </>
        )}
      </main>
    </div>
  );
}
