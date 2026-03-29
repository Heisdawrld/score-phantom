import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import {
  Activity, Users, DollarSign, Zap, RefreshCw, Trash2, Database,
  ShieldCheck, CheckCircle2, XCircle, AlertTriangle, Search, Crown,
  UserX, Gift, Server, Wifi, WifiOff, ChevronLeft, ChevronRight, Eye
} from "lucide-react";

const API = "";

function useAdminToken() {
  return localStorage.getItem("sp_token") || sessionStorage.getItem("sp_token") || "";
}

function authHeaders() {
  const t = localStorage.getItem("sp_token") || sessionStorage.getItem("sp_token") || "";
  return { "Content-Type": "application/json", Authorization: `Bearer ${t}` };
}

async function adminGet(path: string) {
  const r = await fetch(`${API}/api/admin${path}`, { headers: authHeaders() });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function adminPost(path: string, body?: any) {
  const r = await fetch(`${API}/api/admin${path}`, {
    method: "POST", headers: authHeaders(), body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function adminDelete(path: string) {
  const r = await fetch(`${API}/api/admin${path}`, { method: "DELETE", headers: authHeaders() });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

function StatusDot({ status }: { status: string }) {
  if (status === "ok" || status.includes("configured")) return <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />;
  if (status === "degraded" || status.includes("error")) return <span className="inline-block w-2 h-2 rounded-full bg-red-400" />;
  return <span className="inline-block w-2 h-2 rounded-full bg-yellow-400" />;
}

function StatCard({ label, value, sub, color = "text-white" }: any) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
      <p className={`text-2xl font-black ${color}`}>{value ?? "—"}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function ActionBtn({ label, icon: Icon, onClick, loading, variant = "default", confirm }: any) {
  const [busy, setBusy] = useState(false);
  const handle = async () => {
    if (confirm && !window.confirm(confirm)) return;
    setBusy(true);
    try { await onClick(); } finally { setBusy(false); }
  };
  const base = "flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all disabled:opacity-50";
  const styles: any = {
    default: "bg-white/10 hover:bg-white/15 text-white border border-white/10",
    green: "bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30",
    red: "bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/20",
    orange: "bg-orange-500/15 hover:bg-orange-500/25 text-orange-400 border border-orange-500/20",
  };
  return (
    <button className={`${base} ${styles[variant]}`} onClick={handle} disabled={busy || loading}>
      {(busy || loading) ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
      {label}
    </button>
  );
}

export default function Admin() {
  const { data: user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [stats, setStats] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [fixtureStats, setFixtureStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [userTotal, setUserTotal] = useState(0);
  const [userPage, setUserPage] = useState(1);
  const [userSearch, setUserSearch] = useState("");
  const [payments, setPayments] = useState<any[]>([]);
  const [payPage, setPayPage] = useState(1);
  const [payTotal, setPayTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "users" | "payments" | "system">("overview");

  const adminEmail = (import.meta.env.VITE_ADMIN_EMAIL || "").toLowerCase();
  const isAdmin = user?.email?.toLowerCase() === adminEmail || true; // server enforces auth

  useEffect(() => { if (!isLoading && !user) setLocation("/login"); }, [user, isLoading]);

  const ok = (msg: string) => toast({ title: "✅ Done", description: msg });
  const err = (msg: string) => toast({ title: "❌ Error", description: msg, variant: "destructive" });

  const run = async (fn: () => Promise<any>, successMsg?: string) => {
    try { const r = await fn(); ok(successMsg || r.message || "Done"); return r; }
    catch (e: any) { err(e.message); }
  };

  const loadOverview = async () => {
    setLoading(true);
    try {
      const [s, h, f] = await Promise.all([
        adminGet("/stats"),
        adminGet("/system-health"),
        adminGet("/fixture-stats"),
      ]);
      setStats(s); setHealth(h); setFixtureStats(f);
    } catch (e: any) { err(e.message); } finally { setLoading(false); }
  };

  const loadUsers = async (page = userPage, search = userSearch) => {
    try {
      const r = await adminGet(`/users?page=${page}&limit=20&search=${encodeURIComponent(search)}`);
      setUsers(r.users || []); setUserTotal(r.total || 0);
    } catch (e: any) { err(e.message); }
  };

  const loadPayments = async (page = payPage) => {
    try {
      const r = await adminGet(`/payments?page=${page}&limit=20`);
      setPayments(r.payments || []); setPayTotal(r.total || 0);
    } catch (e: any) { err(e.message); }
  };

  useEffect(() => { loadOverview(); }, []);
  useEffect(() => { if (activeTab === "users") loadUsers(); }, [activeTab, userPage]);
  useEffect(() => { if (activeTab === "payments") loadPayments(); }, [activeTab, payPage]);

  const accessBadge = (u: any) => {
    if (u.subscription_active || u.access_status === "premium") return <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full font-bold">PREMIUM</span>;
    if (u.trial_active || u.access_status === "trial") return <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full font-bold">TRIAL</span>;
    return <span className="text-[10px] bg-white/10 text-muted-foreground px-2 py-0.5 rounded-full font-bold">EXPIRED</span>;
  };

  const payBadge = (status: string) => {
    if (status === "verified") return <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full font-bold">VERIFIED</span>;
    if (status === "pending_verification") return <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full font-bold">PENDING</span>;
    return <span className="text-[10px] bg-white/10 text-muted-foreground px-2 py-0.5 rounded-full font-bold">{status.toUpperCase()}</span>;
  };

  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><RefreshCw className="animate-spin text-primary w-6 h-6" /></div>;

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "users", label: "Users" },
    { id: "payments", label: "Payments" },
    { id: "system", label: "System" },
  ];

  return (
    <div className="min-h-screen bg-background text-white">
      {/* Header */}
      <div className="border-b border-white/8 px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary/20 rounded-xl flex items-center justify-center">
            <ShieldCheck className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h1 className="font-black text-sm tracking-widest uppercase">Admin Panel</h1>
            <p className="text-[10px] text-muted-foreground">ScorePhantom Control Room</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {health && (
            <span className={`flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full border ${
              health.status === "healthy" ? "bg-primary/10 text-primary border-primary/20" : "bg-red-500/10 text-red-400 border-red-500/20"
            }`}>
              <StatusDot status={health.status} />
              {health.status === "healthy" ? "ALL SYSTEMS OK" : "DEGRADED"}
            </span>
          )}
          <button onClick={() => setLocation("/")} className="text-xs text-muted-foreground hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/5">← Dashboard</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-white/8 px-4 flex gap-1 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id as any)}
            className={`px-4 py-3 text-xs font-bold tracking-wide uppercase whitespace-nowrap border-b-2 transition-colors ${
              activeTab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-white"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* OVERVIEW TAB */}
        {activeTab === "overview" && (
          <>
            {/* Stats */}
            <div>
              <h2 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Users & Revenue</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="Total Users" value={stats?.users?.total} />
                <StatCard label="Premium" value={stats?.users?.active} color="text-primary" />
                <StatCard label="On Trial" value={stats?.users?.trial} color="text-blue-400" />
                <StatCard label="Expired" value={stats?.users?.expired} color="text-red-400" />
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <StatCard label="Total Revenue" value={stats ? `₦${Number(stats.revenue?.total || 0).toLocaleString()}` : null} color="text-primary" />
              <StatCard label="Today's Revenue" value={stats ? `₦${Number(stats.today?.revenue || 0).toLocaleString()}` : null} />
              <StatCard label="Pending Payments" value={stats?.revenue?.pending_verification} color={stats?.revenue?.pending_verification > 0 ? "text-yellow-400" : "text-white"} />
            </div>

            {/* Fixtures */}
            <div>
              <h2 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Today's Fixtures</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <StatCard label="Total Fixtures" value={fixtureStats?.fixtures?.total} />
                <StatCard label="Enriched" value={fixtureStats?.fixtures?.enriched} color="text-primary" />
                <StatCard label="With Odds" value={fixtureStats?.fixtures?.withOdds} color="text-blue-400" />
              </div>
            </div>

            {/* Cache */}
            <div>
              <h2 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Cache Status</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <StatCard label="Predictions Cached" value={fixtureStats?.cache?.predictions} />
                <StatCard label="League Slug Cache" value={fixtureStats?.cache?.leagueSlugs} />
                <StatCard label="Fixture Odds Cached" value={fixtureStats?.cache?.fixtureOdds} />
              </div>
            </div>

            {/* Actions */}
            <div>
              <h2 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Actions</h2>
              <div className="bg-white/3 border border-white/8 rounded-2xl p-4 space-y-4">

                {/* Enrichment */}
                <div>
                  <p className="text-xs font-bold text-white mb-1">Fixture Enrichment</p>
                  <p className="text-[11px] text-muted-foreground mb-3">Pull form, H2H, standings data for today's unenriched fixtures</p>
                  <div className="flex flex-wrap gap-2">
                    <ActionBtn label="Run Enrichment (50)" icon={Zap} variant="green"
                      onClick={() => run(() => adminPost("/run-enrichment", { limit: 50 }), "Enrichment started")}
                    />
                    <ActionBtn label="Run All (200)" icon={Zap} variant="green"
                      onClick={() => run(() => adminPost("/run-enrichment", { limit: 200 }), "Full enrichment started")}
                    />
                  </div>
                </div>

                <div className="border-t border-white/8" />

                {/* Seeding */}
                <div>
                  <p className="text-xs font-bold text-white mb-1">Fixture Seeding</p>
                  <p className="text-[11px] text-muted-foreground mb-3">Re-pull today's fixtures from LiveScore API (does not delete existing)</p>
                  <ActionBtn label="Reseed Today's Fixtures" icon={RefreshCw}
                    onClick={() => run(() => adminPost("/reseed"), "Reseeding in background...")}
                  />
                </div>

                <div className="border-t border-white/8" />

                {/* Odds Cache */}
                <div>
                  <p className="text-xs font-bold text-white mb-1">Odds Cache</p>
                  <p className="text-[11px] text-muted-foreground mb-3">Clear stale odds data so new league mappings take effect</p>
                  <div className="flex flex-wrap gap-2">
                    <ActionBtn label="Clear League Slug Cache" icon={Trash2} variant="orange"
                      confirm="Clear league slug cache? Fresh odds will be fetched on next prediction."
                      onClick={() => run(() => adminPost("/clear-odds-cache"), "League slug cache cleared")}
                    />
                    <ActionBtn label="Clear All Fixture Odds" icon={Trash2} variant="orange"
                      confirm="Clear all fixture odds? Every match will re-fetch odds on next load."
                      onClick={() => run(() => adminPost("/clear-fixture-odds"), "Fixture odds cleared")}
                    />
                  </div>
                </div>

                <div className="border-t border-white/8" />

                {/* Prediction Cache */}
                <div>
                  <p className="text-xs font-bold text-white mb-1">Prediction Cache</p>
                  <p className="text-[11px] text-muted-foreground mb-3">Force engine to re-run fresh predictions for all matches (use after accuracy upgrades)</p>
                  <ActionBtn label="Clear Prediction Cache" icon={Trash2} variant="red"
                    confirm="⚠️ This clears ALL cached predictions. Users will see fresh engine results on next click. Continue?"
                    onClick={() => run(() => adminPost("/clear-prediction-cache"), "Prediction cache cleared — engine will re-run fresh")}
                  />
                </div>

                <div className="border-t border-white/8" />

                {/* Refresh */}
                <div>
                  <p className="text-xs font-bold text-white mb-1">Refresh Stats</p>
                  <ActionBtn label="Refresh All Stats" icon={RefreshCw}
                    onClick={() => { loadOverview(); ok("Stats refreshed"); }}
                  />
                </div>
              </div>
            </div>
          </>
        )}

        {/* USERS TAB */}
        {activeTab === "users" && (
          <>
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                  placeholder="Search by email..."
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { setUserPage(1); loadUsers(1, userSearch); } }}
                />
              </div>
              <button onClick={() => { setUserPage(1); loadUsers(1, userSearch); }}
                className="bg-primary/20 text-primary border border-primary/30 px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-primary/30">
                Search
              </button>
            </div>
            <p className="text-xs text-muted-foreground">{userTotal} total users</p>
            <div className="space-y-2">
              {users.map(u => (
                <div key={u.id} className="bg-white/3 border border-white/8 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-semibold truncate">{u.email}</p>
                      {accessBadge(u)}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      ID: {u.id} ·
                      {u.premium_expires_at ? ` Expires: ${new Date(u.premium_expires_at).toLocaleDateString()}` : " No expiry"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <ActionBtn label="Grant 30d" icon={Gift} variant="green"
                      onClick={() => run(() => adminPost(`/users/${u.id}/grant`, { days: 30 }), `Premium granted to ${u.email}`)}
                    />
                    <ActionBtn label="Revoke" icon={UserX} variant="orange"
                      confirm={`Revoke premium for ${u.email}?`}
                      onClick={() => run(() => adminPost(`/users/${u.id}/revoke`), `Premium revoked from ${u.email}`)}
                    />
                    <ActionBtn label="Delete" icon={Trash2} variant="red"
                      confirm={`⚠️ Permanently delete user ${u.email} and all their data?`}
                      onClick={async () => { await run(() => adminDelete(`/users/${u.id}`), `${u.email} deleted`); loadUsers(); }}
                    />
                  </div>
                </div>
              ))}
            </div>
            {/* Pagination */}
            <div className="flex items-center justify-between">
              <button disabled={userPage <= 1} onClick={() => setUserPage(p => p - 1)}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-white disabled:opacity-30">
                <ChevronLeft className="w-4 h-4" /> Prev
              </button>
              <p className="text-xs text-muted-foreground">Page {userPage} of {Math.ceil(userTotal / 20) || 1}</p>
              <button disabled={userPage >= Math.ceil(userTotal / 20)} onClick={() => setUserPage(p => p + 1)}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-white disabled:opacity-30">
                Next <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </>
        )}

        {/* PAYMENTS TAB */}
        {activeTab === "payments" && (
          <>
            <p className="text-xs text-muted-foreground">{payTotal} total payments</p>
            <div className="space-y-2">
              {payments.map(p => (
                <div key={p.id} className="bg-white/3 border border-white/8 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-semibold truncate">{p.user_email || `User #${p.user_id}`}</p>
                      {payBadge(p.status)}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      ₦{Number(p.amount || 0).toLocaleString()} · Ref: {p.reference} · {p.paid_at ? new Date(p.paid_at).toLocaleString() : new Date(p.created_at).toLocaleString()}
                    </p>
                  </div>
                  {p.status === "pending_verification" && (
                    <ActionBtn label="Verify & Activate" icon={CheckCircle2} variant="green"
                      onClick={() => run(() => adminPost(`/verify-payment/${p.reference}`), `Payment verified — ${p.user_email} upgraded`)}
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <button disabled={payPage <= 1} onClick={() => setPayPage(p => p - 1)}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-white disabled:opacity-30">
                <ChevronLeft className="w-4 h-4" /> Prev
              </button>
              <p className="text-xs text-muted-foreground">Page {payPage} of {Math.ceil(payTotal / 20) || 1}</p>
              <button disabled={payPage >= Math.ceil(payTotal / 20)} onClick={() => setPayPage(p => p + 1)}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-white disabled:opacity-30">
                Next <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </>
        )}

        {/* SYSTEM TAB */}
        {activeTab === "system" && (
          <>
            <div>
              <h2 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Integration Health</h2>
              <div className="bg-white/3 border border-white/8 rounded-2xl p-4 space-y-3">
                {health?.checks && Object.entries(health.checks).map(([key, val]: any) => (
                  <div key={key} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <StatusDot status={val} />
                      <p className="text-sm font-semibold capitalize">{key.replace(/_/g, " ")}</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      val === "ok" || val.includes("configured") ? "bg-primary/15 text-primary" :
                      val.includes("error") ? "bg-red-500/15 text-red-400" : "bg-yellow-500/15 text-yellow-400"
                    }`}>{String(val).toUpperCase()}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h2 className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Env Variables Checklist</h2>
              <div className="bg-white/3 border border-white/8 rounded-2xl p-4 space-y-2 text-xs">
                {[
                  { key: "ODDS_API_KEY", desc: "odds-api.io key", check: health?.checks?.odds_api === "ok" },
                  { key: "GMAIL_USER + GMAIL_APP_PASSWORD", desc: "Password reset emails", check: health?.checks?.email === "configured" },
                  { key: "GROQ_API_KEY", desc: "AI explainer & chat", check: health?.checks?.groq === "configured" },
                  { key: "FLW_SECRET_KEY", desc: "Flutterwave payments", check: health?.checks?.flutterwave === "configured" },
                  { key: "ADMIN_EMAIL", desc: "Your admin access email", check: true },
                  { key: "JWT_SECRET", desc: "Auth token signing", check: true },
                  { key: "TURSO_URL + TURSO_TOKEN", desc: "Database", check: health?.checks?.database === "ok" },
                  { key: "LIVESCORE_KEY + LIVESCORE_SECRET", desc: "Fixture data", check: health?.checks?.livescore === "ok" },
                ].map(item => (
                  <div key={item.key} className="flex items-start gap-2">
                    {item.check
                      ? <CheckCircle2 className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                      : <XCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />}
                    <div>
                      <p className="font-mono font-bold text-white">{item.key}</p>
                      <p className="text-muted-foreground">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <ActionBtn label="Refresh Health" icon={RefreshCw}
                onClick={() => adminGet("/system-health").then(setHealth).then(() => ok("Health refreshed"))}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
