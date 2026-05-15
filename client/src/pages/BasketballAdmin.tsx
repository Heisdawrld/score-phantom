import { useEffect, useState } from "react";
import { Activity, AlertCircle, BarChart3, CheckCircle2, Database, Globe, Loader2, PlayCircle, RefreshCw, Trophy, Trash2, Zap } from "lucide-react";

const STORAGE_KEY = "sp_admin_session";

type AdminSession = { token: string; adminSecret: string; email: string };

function loadSession(): AdminSession | null {
  try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || ""); } catch { return null; }
}

async function adminFetch(path: string, session: AdminSession, opts: RequestInit = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.token}`,
      "x-admin-secret": session.adminSecret,
      ...(opts.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
  return data;
}

function ActionButton({ icon: Icon, title, subtitle, loading, onClick, tone = "green" }: any) {
  const colors: any = {
    green: "border-primary/20 bg-primary/10 text-primary",
    orange: "border-orange-300/20 bg-orange-400/10 text-orange-200",
    blue: "border-blue-300/20 bg-blue-400/10 text-blue-200",
    red: "border-red-300/20 bg-red-400/10 text-red-200",
    purple: "border-purple-300/20 bg-purple-400/10 text-purple-200",
    cyan: "border-cyan-300/20 bg-cyan-400/10 text-cyan-200",
  };
  const color = colors[tone] || colors.green;
  return (
    <button onClick={onClick} disabled={loading} className={`w-full rounded-3xl border p-4 text-left transition-all active:scale-[0.99] disabled:opacity-60 ${color}`}>
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-black/25">
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Icon className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-white">{title}</p>
          <p className="mt-0.5 text-xs text-white/40">{subtitle}</p>
        </div>
      </div>
    </button>
  );
}

function StatusCard({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-black/25 p-3">
      <p className="text-white/35 text-xs">{label}</p>
      <p className={`font-black text-white text-sm ${good === false ? 'text-red-300' : good === true ? 'text-emerald-300' : ''}`}>{value}</p>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, subtitle }: any) {
  return (
    <div className="flex items-center gap-3 mt-5 mb-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/5">
        <Icon className="h-4 w-4 text-white/50" />
      </div>
      <div>
        <p className="text-xs font-black uppercase tracking-widest text-white/50">{title}</p>
        {subtitle && <p className="text-[10px] text-white/25">{subtitle}</p>}
      </div>
    </div>
  );
}

export default function BasketballAdmin() {
  const [session] = useState<AdminSession | null>(() => loadSession());
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [health, setHealth] = useState<any>(null);
  const [lastResult, setLastResult] = useState<any>(null);

  function flash(ok: boolean, text: string) {
    setMessage({ ok, text });
    setTimeout(() => setMessage(null), 5000);
  }

  async function run(key: string, label: string, fn: () => Promise<any>) {
    if (!session) return;
    setLoadingKey(key);
    try {
      const result = await fn();
      setLastResult(result);
      flash(true, label);
      return result;
    } catch (err: any) {
      flash(false, err.message || "Action failed");
    } finally { setLoadingKey(null); }
  }

  async function checkHealth() {
    return run("health", "Basketball health checked", async () => {
      const r = await fetch("/api/basketball/health").then(res => res.json());
      setHealth(r);
      return r;
    });
  }

  useEffect(() => { if (session) checkHealth(); }, [session]);

  if (!session) {
    return (
      <div className="min-h-screen bg-[#080b10] text-white flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-3xl border border-white/[0.08] bg-[#0f172a] p-6 text-center">
          <Trophy className="mx-auto h-10 w-10 text-orange-200" />
          <h1 className="mt-4 text-xl font-black">Basketball Admin</h1>
          <p className="mt-2 text-sm text-white/45">Login to the main Admin Panel first, then return here.</p>
          <a href="/admin" className="mt-5 block rounded-2xl bg-primary py-3 font-black text-black">Open Admin Login</a>
        </div>
      </div>
    );
  }

  const autoSync = health?.checks?.autoSync;
  const engineVer = health?.checks?.engineVersion || "unknown";
  const sel = (n: number) => n > 0 ? "active" : "inactive";

  return (
    <div className="min-h-screen bg-[#080b10] text-white pb-10">
      {message && (
        <div className={`fixed left-4 right-4 top-4 z-50 rounded-2xl border p-3 text-sm font-bold shadow-2xl ${message.ok ? "border-emerald-400/20 bg-emerald-500/15 text-emerald-200" : "border-red-400/20 bg-red-500/15 text-red-200"}`}>
          {message.ok ? <CheckCircle2 className="inline h-4 w-4 mr-2" /> : <AlertCircle className="inline h-4 w-4 mr-2" />}{message.text}
        </div>
      )}

      <main className="mx-auto max-w-3xl space-y-5 px-4 pt-5">
        {/* ── Header ── */}
        <section className="rounded-3xl border border-white/[0.06] bg-white/[0.025] p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-200/60">ScorePhantom Hoops</p>
              <h1 className="mt-2 text-2xl font-black">Basketball Control Room</h1>
              <p className="mt-1 text-xs text-white/40">Sync games, fetch advanced stats, generate predictions. All data sources — free + paid.</p>
            </div>
            <button onClick={checkHealth} className="rounded-xl border border-white/10 bg-white/5 p-2 hover:bg-white/10 transition-all">
              <RefreshCw className="h-4 w-4 text-white/50" />
            </button>
          </div>
          {health && (
            <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
              <StatusCard label="Status" value={health.status} good={health.status === 'ok'} />
              <StatusCard label="Engine" value={engineVer} />
              <StatusCard label="API-Sports" value={health.checks?.apiSports || '—'} good={health.checks?.apiSports === 'configured'} />
              <StatusCard label="ESPN (Free)" value={health.checks?.espnApi || '—'} good={true} />
              <StatusCard label="NBA Stats (Free)" value={health.checks?.nbaStatsApi || '—'} good={true} />
              <StatusCard label="Odds Backup" value={health.checks?.oddsApiBackup || '—'} />
            </div>
          )}
        </section>

        {/* ── Auto-Sync Status ── */}
        {autoSync && (
          <section className="rounded-3xl border border-white/[0.06] bg-white/[0.025] p-5">
            <SectionHeader icon={Activity} title="Auto-Sync Status" subtitle="Background jobs running on the server" />
            <div className="grid grid-cols-2 gap-2 text-xs">
              <StatusCard label="Auto-Sync" value={autoSync.enabled ? 'ON' : 'OFF'} good={autoSync.enabled} />
              <StatusCard label="Sync Running" value={autoSync.externalSyncRunning ? 'YES' : 'No'} good={!autoSync.externalSyncRunning} />
              <StatusCard label="Predictions Running" value={autoSync.predictionRunRunning ? 'YES' : 'No'} good={!autoSync.predictionRunRunning} />
              <StatusCard label="Last Sync" value={autoSync.lastExternalSync ? new Date(autoSync.lastExternalSync).toLocaleTimeString() : 'Never'} />
              <StatusCard label="Last Predictions" value={autoSync.lastPredictionRun ? new Date(autoSync.lastPredictionRun).toLocaleTimeString() : 'Never'} />
              <div className="rounded-2xl border border-white/[0.06] bg-black/25 p-3 col-span-2">
                <p className="text-white/35 text-xs">Data Sources</p>
                <div className="flex gap-2 mt-1 flex-wrap">
                  {autoSync.dataSources?.espn && <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/20">ESPN (Free)</span>}
                  {autoSync.dataSources?.nbaStats && <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/20">NBA Stats (Free)</span>}
                  {autoSync.dataSources?.apiSports && <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/20">API-Sports</span>}
                  {autoSync.dataSources?.ballDontLie && <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/20">BallDontLie</span>}
                  {autoSync.dataSources?.oddsApi && <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/20">Odds API</span>}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── FREE: ESPN Sync ── */}
        <SectionHeader icon={Globe} title="ESPN Sync (Free)" subtitle="NBA, WNBA, NCAAM, NCAAW — no API key needed" />
        <div className="grid gap-3">
          <ActionButton icon={Globe} title="Sync ESPN Scoreboards" subtitle="Fetch today + 3 days of games for all leagues (FREE)" loading={loadingKey === "espn"} onClick={() => run("espn", "ESPN scoreboards synced", () => adminFetch("/api/basketball/admin/sync-espn", session, { method: "POST", body: JSON.stringify({ daysAhead: 3 }) }))} tone="cyan" />
          <ActionButton icon={BarChart3} title="Sync ESPN Standings" subtitle="Pull standings, streaks, records for all leagues (FREE)" loading={loadingKey === "espnStandings"} onClick={() => run("espnStandings", "ESPN standings synced", () => adminFetch("/api/basketball/admin/sync-espn-standings", session, { method: "POST", body: "{}" }))} tone="cyan" />
        </div>

        {/* ── FREE: NBA Stats API ── */}
        <SectionHeader icon={BarChart3} title="NBA Stats API (Free)" subtitle="Advanced metrics: ORTG, DRTG, Pace, PER, Usage — no API key" />
        <div className="grid gap-3">
          <ActionButton icon={BarChart3} title="Test NBA Stats API" subtitle="Fetch team advanced metrics (ORTG, DRTG, Pace, Net Rating)" loading={loadingKey === "nbaTest"} onClick={() => run("nbaTest", "NBA Stats API tested", () => adminFetch("/api/basketball/admin/test-nba-stats", session, { method: "POST", body: "{}" }))} tone="cyan" />
          <ActionButton icon={BarChart3} title="Fetch NBA Team Stats" subtitle="Full team dashboard + advanced metrics for all 30 teams" loading={loadingKey === "nbaTeams"} onClick={() => run("nbaTeams", "NBA team stats fetched", () => adminFetch("/api/basketball/admin/fetch-nba-team-stats", session, { method: "POST", body: "{}" }))} tone="cyan" />
          <ActionButton icon={BarChart3} title="Fetch NBA Standings" subtitle="Conference/division standings with streaks and records" loading={loadingKey === "nbaStandings"} onClick={() => run("nbaStandings", "NBA standings fetched", () => adminFetch("/api/basketball/admin/fetch-nba-standings", session, { method: "POST", body: "{}" }))} tone="cyan" />
          <ActionButton icon={BarChart3} title="Fetch NBA Box Score" subtitle="Get player-level box score for a specific game (enter Game ID in response)" loading={loadingKey === "nbaBox"} onClick={() => run("nbaBox", "NBA box score fetched", () => adminFetch("/api/basketball/admin/fetch-nba-boxscore", session, { method: "POST", body: JSON.stringify({ gameId: "0022500001" }) }))} tone="cyan" />
        </div>

        {/* ── PAID: API-Sports ── */}
        <SectionHeader icon={Database} title="API-Sports (Paid)" subtitle="Global basketball coverage — 100 req/day on free plan" />
        <div className="grid gap-3">
          <ActionButton icon={Database} title="Initialize Tables" subtitle="Create basketball DB/cache tables safely" loading={loadingKey === "init"} onClick={() => run("init", "Basketball tables initialized", () => adminFetch("/api/basketball/admin/init", session, { method: "POST", body: "{}" }))} />
          <ActionButton icon={RefreshCw} title="Sync API-SPORTS Fixtures" subtitle="Selected leagues: games, logos, live scores" loading={loadingKey === "fixtures"} onClick={() => run("fixtures", "API-SPORTS fixtures synced", () => adminFetch("/api/basketball/admin/sync-api-sports", session, { method: "POST", body: JSON.stringify({ daysAhead: 2, selectedOnly: true }) }))} tone="orange" />
          <ActionButton icon={Zap} title="Sync API-SPORTS Odds" subtitle="Fetch odds for cached selected-league games" loading={loadingKey === "apiOdds"} onClick={() => run("apiOdds", "API-SPORTS odds sync completed", () => adminFetch("/api/basketball/admin/sync-api-sports-odds", session, { method: "POST", body: JSON.stringify({ daysAhead: 2, leagueLimit: 12, maxGames: 40 }) }))} tone="orange" />
          <ActionButton icon={RefreshCw} title="Sync Full Basketball Cache" subtitle="ESPN + Fixtures + API-SPORTS odds + Odds API backup" loading={loadingKey === "sync"} onClick={() => run("sync", "Full basketball cache sync completed", () => adminFetch("/api/basketball/admin/sync", session, { method: "POST", body: JSON.stringify({ daysAhead: 3, includeApiSports: true, includeOddsApiBackup: true, includeEspn: true }) }))} tone="orange" />
        </div>

        {/* ── Predictions ── */}
        <SectionHeader icon={PlayCircle} title="Predictions" subtitle="Run the engine to generate picks" />
        <div className="grid gap-3">
          <ActionButton icon={PlayCircle} title="Run Predictions" subtitle="Generate basketball picks and value edges" loading={loadingKey === "predictions"} onClick={() => run("predictions", "Basketball predictions generated", () => adminFetch("/api/basketball/admin/run-predictions", session, { method: "POST", body: JSON.stringify({ limit: 120 }) }))} />
          <ActionButton icon={RefreshCw} title="Force Rebuild Predictions" subtitle="Clear all basketball predictions + rebuild from scratch" loading={loadingKey === "rebuild"} onClick={() => run("rebuild", "Basketball predictions rebuilt", () => adminFetch("/api/basketball/admin/force-rebuild", session, { method: "POST", body: "{}" }))} tone="orange" />
          <ActionButton icon={Trash2} title="Clear Predictions" subtitle="Wipe all basketball prediction cache" loading={loadingKey === "clear"} onClick={() => { if (confirm("Clear ALL basketball predictions?")) run("clear", "Basketball predictions cleared", () => adminFetch("/api/basketball/admin/clear-predictions", session, { method: "POST", body: "{}" })); }} tone="red" />
        </div>

        {/* ── Full Setup ── */}
        <SectionHeader icon={Zap} title="One-Click Setup" subtitle="Run everything in sequence" />
        <div className="grid gap-3">
          <ActionButton icon={Zap} title="Full Basketball Setup" subtitle="Init → ESPN → Fixtures → Odds → Predict" loading={loadingKey === "full"} onClick={() => run("full", "Full basketball setup completed", async () => {
            await adminFetch("/api/basketball/admin/init", session, { method: "POST", body: "{}" });
            const espn = await adminFetch("/api/basketball/admin/sync-espn", session, { method: "POST", body: JSON.stringify({ daysAhead: 3 }) });
            const fixtures = await adminFetch("/api/basketball/admin/sync-api-sports", session, { method: "POST", body: JSON.stringify({ daysAhead: 2, selectedOnly: true }) });
            const apiOdds = await adminFetch("/api/basketball/admin/sync-api-sports-odds", session, { method: "POST", body: JSON.stringify({ daysAhead: 2, leagueLimit: 12, maxGames: 40 }) });
            const backup = await adminFetch("/api/basketball/admin/sync", session, { method: "POST", body: JSON.stringify({ daysAhead: 2, includeApiSports: false, includeOddsApiBackup: true, includeEspn: false }) });
            const preds = await adminFetch("/api/basketball/admin/run-predictions", session, { method: "POST", body: JSON.stringify({ limit: 120 }) });
            return { espn, fixtures, apiOdds, backup, preds };
          })} tone="orange" />
        </div>

        {/* ── Navigation ── */}
        <div className="grid grid-cols-2 gap-3">
          <a href="/basketball" className="rounded-2xl border border-orange-300/20 bg-orange-400/10 p-4 text-center text-sm font-black text-orange-100">Open Hoops</a>
          <a href="/admin" className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center text-sm font-black text-white/70">Main Admin</a>
        </div>

        {/* ── Last Response ── */}
        {lastResult && (
          <section className="rounded-3xl border border-white/[0.06] bg-black/30 p-4">
            <p className="mb-2 text-xs font-black uppercase tracking-widest text-white/40">Last Response</p>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-white/55">{JSON.stringify(lastResult, null, 2)}</pre>
          </section>
        )}
      </main>
    </div>
  );
}
