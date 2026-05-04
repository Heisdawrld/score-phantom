import { useEffect, useState } from "react";
import { Activity, AlertCircle, CheckCircle2, Database, Loader2, PlayCircle, RefreshCw, Trophy, Zap } from "lucide-react";

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
  const color = tone === "orange" ? "border-orange-300/20 bg-orange-400/10 text-orange-200" : tone === "blue" ? "border-blue-300/20 bg-blue-400/10 text-blue-200" : "border-primary/20 bg-primary/10 text-primary";
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

  return (
    <div className="min-h-screen bg-[#080b10] text-white pb-10">
      {message && (
        <div className={`fixed left-4 right-4 top-4 z-50 rounded-2xl border p-3 text-sm font-bold shadow-2xl ${message.ok ? "border-emerald-400/20 bg-emerald-500/15 text-emerald-200" : "border-red-400/20 bg-red-500/15 text-red-200"}`}>
          {message.ok ? <CheckCircle2 className="inline h-4 w-4 mr-2" /> : <AlertCircle className="inline h-4 w-4 mr-2" />}{message.text}
        </div>
      )}

      <main className="mx-auto max-w-3xl space-y-5 px-4 pt-5">
        <section className="rounded-3xl border border-white/[0.06] bg-white/[0.025] p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-200/60">Hoops Control Room</p>
              <h1 className="mt-2 text-2xl font-black">Basketball Admin</h1>
              <p className="mt-1 text-xs text-white/40">Run NBA + NCAAB sync and prediction jobs from your phone.</p>
            </div>
            <Trophy className="h-8 w-8 text-orange-200" />
          </div>
          {health && (
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-2xl border border-white/[0.06] bg-black/25 p-3"><p className="text-white/35">Status</p><p className="font-black text-white">{health.status}</p></div>
              <div className="rounded-2xl border border-white/[0.06] bg-black/25 p-3"><p className="text-white/35">Odds API</p><p className="font-black text-white">{health.checks?.oddsApi}</p></div>
              <div className="rounded-2xl border border-white/[0.06] bg-black/25 p-3"><p className="text-white/35">BallDontLie</p><p className="font-black text-white">{health.checks?.ballDontLie}</p></div>
              <div className="rounded-2xl border border-white/[0.06] bg-black/25 p-3"><p className="text-white/35">Leagues</p><p className="font-black text-white">{(health.checks?.enabledLeagues || []).join(', ')}</p></div>
            </div>
          )}
        </section>

        <div className="grid gap-3">
          <ActionButton icon={Activity} title="Check Health" subtitle="Confirm keys and basketball setup" loading={loadingKey === "health"} onClick={checkHealth} tone="blue" />
          <ActionButton icon={Database} title="Initialize Tables" subtitle="Create basketball DB tables safely" loading={loadingKey === "init"} onClick={() => run("init", "Basketball tables initialized", () => adminFetch("/api/basketball/admin/init", session, { method: "POST", body: "{}" }))} />
          <ActionButton icon={RefreshCw} title="Sync Basketball Data" subtitle="Pull NBA games + NBA/NCAAB odds" loading={loadingKey === "sync"} onClick={() => run("sync", "Basketball sync completed", () => adminFetch("/api/basketball/admin/sync", session, { method: "POST", body: "{}" }))} tone="orange" />
          <ActionButton icon={PlayCircle} title="Run Predictions" subtitle="Generate basketball best picks" loading={loadingKey === "predictions"} onClick={() => run("predictions", "Basketball predictions generated", () => adminFetch("/api/basketball/admin/run-predictions", session, { method: "POST", body: JSON.stringify({ limit: 80 }) }))} />
          <ActionButton icon={Zap} title="Full Basketball Setup" subtitle="Init → Sync → Predict" loading={loadingKey === "full"} onClick={() => run("full", "Full basketball setup completed", async () => {
            await adminFetch("/api/basketball/admin/init", session, { method: "POST", body: "{}" });
            const sync = await adminFetch("/api/basketball/admin/sync", session, { method: "POST", body: "{}" });
            const preds = await adminFetch("/api/basketball/admin/run-predictions", session, { method: "POST", body: JSON.stringify({ limit: 80 }) });
            return { sync, preds };
          })} tone="orange" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <a href="/basketball" className="rounded-2xl border border-orange-300/20 bg-orange-400/10 p-4 text-center text-sm font-black text-orange-100">Open Hoops</a>
          <a href="/admin" className="rounded-2xl border border-white/10 bg-white/5 p-4 text-center text-sm font-black text-white/70">Main Admin</a>
        </div>

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
