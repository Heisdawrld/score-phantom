/**
 * Admin.tsx — Standalone Admin Panel
 *
 * Completely independent from the main app auth system.
 * Has its own email + password login that calls /api/auth/admin-login.
 * The server verifies the credentials match ADMIN_EMAIL + ADMIN_SECRET.
 * No ProtectedRoute, no shared auth state.
 */
import { useState, useEffect, useCallback } from "react";
import { Eye, EyeOff, LogOut, RefreshCw, Users, CreditCard, BarChart3, Settings, CheckCircle2, AlertCircle, Crown, Clock, Loader2, Shield, UserPlus } from "lucide-react";

// ── Config ────────────────────────────────────────────────────────────────────
const API = "";
const STORAGE_KEY = "sp_admin_session";

// ── Types ─────────────────────────────────────────────────────────────────────
interface AdminSession { token: string; adminSecret: string; email: string; }
interface AdminStats { total_users: number; premium_users: number; trial_users: number; expired_users: number; revenue_total: number; payments_today: number; revenue_today: number; fixtures_total: number; }
interface AdminUser { id: number; email: string; status: string; trial_ends_at: string | null; premium_expires_at: string | null; subscription_expires_at: string | null; payments?: any[]; access?: any; }
interface AdminPayment { id: number; user_id: number; reference: string; amount: number; amount_currency: string; status: string; paid_at: string | null; created_at: string; }
interface Partner { id: number; email: string; own_referral_code: string; total_referred_paid: number; total_commission: number; pending_commission: number; settled_commission: number; }
interface Commission { id: number; referrer_user_id: number; referred_user_id: number; referred_email: string; gross_amount: number; commission_rate: number; commission_amount: number; status: string; created_at: string; settled_at: string | null; }

// ── Session helpers ───────────────────────────────────────────────────────────
function saveSession(s: AdminSession) { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }
function loadSession(): AdminSession | null {
  try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || ""); } catch { return null; }
}
function clearSession() { sessionStorage.removeItem(STORAGE_KEY); }

// ── API helpers ───────────────────────────────────────────────────────────────
async function adminFetch(path: string, session: AdminSession, opts: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.token}`,
      "x-admin-secret": session.adminSecret,
      ...(opts.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ── Login Screen ──────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }: { onLogin: (s: AdminSession) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [adminSecret, setAdminSecret] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password || !adminSecret.trim()) return setError("All fields are required.");
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API}/api/auth/admin-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      if (!data.token) throw new Error("Invalid server response");
      const session: AdminSession = { token: data.token, adminSecret: adminSecret.trim(), email: email.trim().toLowerCase() };
      saveSession(session);
      onLogin(session);
    } catch (err: any) {
      setError(err.message || "Login failed. Check your credentials.");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-[#080b10] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 mb-4">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-black tracking-widest text-white">
            SCORE<span style={{ color: "#10e774" }}>PHANTOM</span>
          </h1>
          <p className="text-xs text-gray-500 mt-1 tracking-wider">ADMIN PANEL</p>
        </div>

        {/* Card */}
        <div className="bg-[#0f172a] border border-white/[0.08] rounded-2xl p-8 shadow-2xl">
          <h2 className="text-white font-bold text-lg mb-1">Admin Sign In</h2>
          <p className="text-gray-500 text-sm mb-6">Enter your admin credentials to continue.</p>

          {error && (
            <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-5 text-sm text-red-400">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />{error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@example.com" required
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-primary/50 focus:bg-primary/5 transition-all" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Password</label>
              <div className="relative">
                <input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-12 text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-primary/50 focus:bg-primary/5 transition-all" />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors p-1">
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Admin Secret</label>
              <input type="password" value={adminSecret} onChange={e => setAdminSecret(e.target.value)} placeholder="••••••••" required
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-primary/50 focus:bg-primary/5 transition-all" />
            </div>
            <button type="submit" disabled={loading}
              className="w-full bg-[#10e774] text-black font-bold text-sm py-3.5 rounded-xl hover:brightness-110 transition-all disabled:opacity-60 disabled:cursor-not-allowed mt-2">
              {loading ? <span className="flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" />Signing in…</span> : "Sign In to Admin"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-600 mt-4">
          Restricted access · Admin credentials only
        </p>
      </div>
    </div>
  );
}

// ── Status Badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    premium: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    trial:   "bg-blue-500/20 text-blue-400 border-blue-500/30",
    expired: "bg-red-500/20 text-red-400 border-red-500/30",
    active:  "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${cfg[status] || "bg-white/5 text-gray-400 border-white/10"}`}>
      {status}
    </span>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-[#0f172a] border border-white/[0.06] rounded-2xl p-5">
      <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">{label}</p>
      <p className={`text-2xl font-black ${color || "text-white"}`}>{value}</p>
      {sub && <p className="text-xs text-gray-600 mt-1">{sub}</p>}
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
function AdminDashboard({ session, onLogout }: { session: AdminSession; onLogout: () => void }) {
  const [tab, setTab] = useState<"overview" | "users" | "payments" | "partners" | "system">("overview");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [userPage, setUserPage] = useState(1);
  const [userTotalPages, setUserTotalPages] = useState(1);
  const [userTotal, setUserTotal] = useState(0);
  const USER_PAGE_SIZE = 20;
  const [upgradeEmail, setUpgradeEmail] = useState("");
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [userActionLoading, setUserActionLoading] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AdminUser | null>(null);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [settleLoading, setSettleLoading] = useState(false);

  const call = useCallback((path: string, opts?: RequestInit) => adminFetch(path, session, opts), [session]);

  const flash = (ok: boolean, text: string) => {
    setActionMsg({ ok, text });
    setTimeout(() => setActionMsg(null), 4000);
  };

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const [s, h] = await Promise.allSettled([
        call("/api/admin/stats"),
        call("/api/admin/system-health"),
      ]);
      if (s.status === "fulfilled") setStats(s.value);
    } catch (e: any) {
      flash(false, e.message);
    } finally { setLoading(false); }
  }, [call]);

  const loadUsers = useCallback(async (page = userPage) => {
    setLoading(true);
    try {
      const search = userSearch ? `&search=${encodeURIComponent(userSearch)}` : "";
      const r = await call(`/api/admin/users?limit=${USER_PAGE_SIZE}&page=${page}${search}`);
      setUsers(r.users || []);
      setUserTotal(r.total || 0);
      setUserTotalPages(r.pages || 1);
      setUserPage(page);
    } finally { setLoading(false); }
  }, [call, userSearch, userPage]);

  const loadPayments = useCallback(async () => {
    setLoading(true);
    try {
      const r = await call("/api/admin/payments?limit=50");
      setPayments(r.payments || []);
    } catch { } finally { setLoading(false); }
  }, [call]);

  const loadPartners = useCallback(async () => {
    setLoading(true);
    try {
      const r = await call("/api/admin/partners");
      setPartners(r.partners || []);
    } catch { } finally { setLoading(false); }
  }, [call]);

  const loadCommissions = useCallback(async (partnerId: number) => {
    try {
      const r = await call(`/api/admin/partners/${partnerId}/commissions`);
      setCommissions(r.commissions || []);
    } catch { setCommissions([]); }
  }, [call]);

  const settlePartner = async (partnerId: number) => {
    setSettleLoading(true);
    try {
      await call(`/api/admin/partners/${partnerId}/settle`, { method: "POST" });
      flash(true, "Commissions settled!");
      loadPartners();
      loadCommissions(partnerId);
    } catch (e: any) { flash(false, e.message); }
    finally { setSettleLoading(false); }
  };

  useEffect(() => { loadOverview(); }, [loadOverview]);
  useEffect(() => { if (tab === "users") loadUsers(); }, [tab, loadUsers]);
  useEffect(() => { if (tab === "payments") loadPayments(); }, [tab, loadPayments]);
  useEffect(() => { if (tab === "partners") loadPartners(); }, [tab, loadPartners]);

  const run = async (fn: () => Promise<any>, msg: string) => {
    try { await fn(); flash(true, msg); } catch (e: any) { flash(false, e.message); }
  };

  const handleUpgrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!upgradeEmail.trim()) return;
    setUpgradeLoading(true);
    try {
      await call("/api/auth/admin/upgrade-by-email", {
        method: "POST",
        body: JSON.stringify({ email: upgradeEmail.trim().toLowerCase(), days: 30 }),
      });
      flash(true, `✓ ${upgradeEmail} upgraded to premium (30 days)`);
      setUpgradeEmail("");
      if (tab === "users") loadUsers();
    } catch (e: any) { flash(false, e.message); }
    finally { setUpgradeLoading(false); }
  };

  const userAction = async (userId: number, action: "grant" | "revoke" | "verify-email" | "delete", email: string) => {
    setUserActionLoading(userId);
    try {
      if (action === "delete") {
        await call(`/api/admin/users/${userId}`, { method: "DELETE" });
        flash(true, `✓ User ${email} deleted`);
        setConfirmDelete(null);
      } else {
        const opts: RequestInit = { method: "POST" };
        if (action === "grant") opts.body = JSON.stringify({ days: 30 });
        await call(`/api/admin/users/${userId}/${action}`, opts);
        const label = action === "grant" ? "Premium granted (30 days)" : action === "revoke" ? "Premium revoked" : "Email verified";
        flash(true, `✓ ${email}: ${label}`);
      }
      loadUsers();
      loadOverview();
    } catch (e: any) { flash(false, e.message); }
    finally { setUserActionLoading(null); }
  };

  const tabs = [
    { id: "overview",  label: "Overview",  icon: BarChart3 },
    { id: "users",     label: "Users",     icon: Users },
    { id: "payments",  label: "Payments",  icon: CreditCard },
    { id: "partners",  label: "Partners",  icon: UserPlus },
    { id: "system",    label: "System",    icon: Settings },
  ] as const;

  return (
    <div className="min-h-screen bg-[#080b10] text-white">
      {/* Top bar */}
      <div className="border-b border-white/[0.06] bg-[#0a0e16] px-4 sm:px-8 py-4 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Shield className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-black tracking-widest">SCORE<span style={{ color: "#10e774" }}>PHANTOM</span></p>
            <p className="text-[10px] text-gray-500">Admin Panel · {session.email}</p>
          </div>
        </div>
        <button onClick={onLogout} className="flex items-center gap-2 text-xs text-gray-500 hover:text-red-400 transition-colors px-3 py-2 rounded-lg hover:bg-red-500/10 border border-transparent hover:border-red-500/20">
          <LogOut size={14} /> Sign Out
        </button>
      </div>

      {/* Flash message */}
      {actionMsg && (
        <div className={`fixed top-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold shadow-xl border ${actionMsg.ok ? "bg-emerald-900/90 border-emerald-500/30 text-emerald-300" : "bg-red-900/90 border-red-500/30 text-red-300"}`}>
          {actionMsg.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {actionMsg.text}
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-6">
        {/* Tabs */}
        <div className="flex gap-1 bg-white/[0.03] border border-white/[0.06] rounded-2xl p-1 mb-8 overflow-x-auto">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all flex-1 justify-center ${tab === id ? "bg-primary/15 text-primary border border-primary/20" : "text-gray-500 hover:text-white hover:bg-white/5"}`}>
              <Icon size={15} />{label}
            </button>
          ))}
        </div>

        {/* ── OVERVIEW ── */}
        {tab === "overview" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-white">Platform Overview</h2>
              <button onClick={loadOverview} disabled={loading} className="flex items-center gap-2 text-xs text-gray-400 hover:text-white px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-all border border-white/[0.06]">
                <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
              </button>
            </div>
            {loading && !stats ? (
              <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-primary" /></div>
            ) : stats ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <StatCard label="Total Users" value={stats.total_users ?? "—"} />
                  <StatCard label="Premium" value={stats.premium_users ?? "—"} color="text-primary" />
                  <StatCard label="On Trial" value={stats.trial_users ?? "—"} color="text-blue-400" />
                  <StatCard label="Expired" value={stats.expired_users ?? "—"} color="text-red-400" />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <StatCard label="Total Revenue" value={stats.revenue_total ? `₦${Number(stats.revenue_total).toLocaleString()}` : "₦0"} color="text-primary" />
                  <StatCard label="Today's Revenue" value={stats.revenue_today ? `₦${Number(stats.revenue_today).toLocaleString()}` : "₦0"} />
                  <StatCard label="Payments Today" value={stats.payments_today ?? 0} />
                </div>
              </>
            ) : (
              <div className="text-center py-12 text-gray-500 text-sm">No stats available. Check server logs.</div>
            )}

            {/* Quick Upgrade */}
            <div className="bg-[#0f172a] border border-white/[0.06] rounded-2xl p-6">
              <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-2"><Crown size={15} className="text-primary" /> Quick Upgrade User</h3>
              <p className="text-xs text-gray-500 mb-4">Manually grant 30-day premium access to a user by email.</p>
              <form onSubmit={handleUpgrade} className="flex gap-3">
                <input value={upgradeEmail} onChange={e => setUpgradeEmail(e.target.value)} placeholder="user@example.com" type="email"
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-primary/50 transition-all" />
                <button type="submit" disabled={upgradeLoading}
                  className="bg-primary/20 border border-primary/30 text-primary font-bold text-sm px-5 py-2.5 rounded-xl hover:bg-primary/30 transition-all disabled:opacity-50 whitespace-nowrap">
                  {upgradeLoading ? <Loader2 size={15} className="animate-spin" /> : "Upgrade →"}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ── USERS ── */}
        {tab === "users" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="text-lg font-black text-white">Users <span className="text-gray-500 font-normal text-sm">({userTotal} total)</span></h2>
              <div className="flex gap-2">
                <input value={userSearch} onChange={e => setUserSearch(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { setUserPage(1); loadUsers(1); } }}
                  placeholder="Search email…"
                  className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-gray-600 focus:outline-none focus:border-primary/50 w-48" />
                <button onClick={() => { setUserPage(1); loadUsers(1); }} disabled={loading} className="bg-primary/10 border border-primary/20 text-primary text-xs font-bold px-4 py-2 rounded-xl hover:bg-primary/20 transition-all disabled:opacity-50">
                  {loading ? <Loader2 size={13} className="animate-spin" /> : "Search"}
                </button>
              </div>
            </div>
            <div className="bg-[#0f172a] border border-white/[0.06] rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-white/[0.06]">
                    {["ID", "Email", "Status", "Trial Ends", "Premium Expires", "Payments", "Actions"].map(h => (
                      <th key={h} className="text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider px-4 py-3">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {users.map(u => {
                      const isLoading = userActionLoading === u.id;
                      const st = u.access?.status || u.status;
                      return (
                        <tr key={u.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                          <td className="px-4 py-3 text-gray-500 text-xs">{u.id}</td>
                          <td className="px-4 py-3 text-white text-xs font-medium">{u.email}</td>
                          <td className="px-4 py-3"><StatusBadge status={st} /></td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{u.trial_ends_at ? new Date(u.trial_ends_at).toLocaleDateString() : "—"}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{u.premium_expires_at ? new Date(u.premium_expires_at).toLocaleDateString() : "—"}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{u.payments?.length ?? 0}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {/* Grant 30-day Premium */}
                              <button disabled={isLoading} onClick={() => userAction(u.id, "grant", u.email)}
                                title="Grant 30-day Premium"
                                className="bg-primary/10 border border-primary/20 text-primary text-[10px] font-bold px-2 py-1 rounded-lg hover:bg-primary/20 transition-all disabled:opacity-40 whitespace-nowrap">
                                {isLoading ? <Loader2 size={10} className="animate-spin inline" /> : "👑 Grant"}
                              </button>
                              {/* Revoke Premium */}
                              {st === "active" && (
                                <button disabled={isLoading} onClick={() => userAction(u.id, "revoke", u.email)}
                                  title="Revoke Premium"
                                  className="bg-orange-500/10 border border-orange-500/20 text-orange-400 text-[10px] font-bold px-2 py-1 rounded-lg hover:bg-orange-500/20 transition-all disabled:opacity-40 whitespace-nowrap">
                                  Revoke
                                </button>
                              )}
                              {/* Verify Email */}
                              <button disabled={isLoading} onClick={() => userAction(u.id, "verify-email", u.email)}
                                title="Manually verify email"
                                className="bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-bold px-2 py-1 rounded-lg hover:bg-blue-500/20 transition-all disabled:opacity-40 whitespace-nowrap">
                                ✓ Verify
                              </button>
                              {/* Delete */}
                              <button disabled={isLoading} onClick={() => setConfirmDelete(u)}
                                title="Delete user"
                                className="bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-bold px-2 py-1 rounded-lg hover:bg-red-500/20 transition-all disabled:opacity-40">
                                🗑
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {!loading && users.length === 0 && (
                      <tr><td colSpan={7} className="text-center py-8 text-gray-600 text-sm">No users found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination */}
            {userTotalPages > 1 && (
              <div className="flex items-center justify-between px-1">
                <p className="text-xs text-gray-500">
                  Page {userPage} of {userTotalPages} · showing {users.length} of {userTotal} users
                </p>
                <div className="flex gap-2">
                  <button
                    disabled={userPage <= 1 || loading}
                    onClick={() => loadUsers(userPage - 1)}
                    className="bg-white/5 border border-white/10 text-gray-300 text-xs font-bold px-4 py-2 rounded-xl hover:bg-white/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed">
                    ← Prev
                  </button>
                  {/* Page number chips */}
                  {Array.from({ length: Math.min(userTotalPages, 7) }, (_, i) => {
                    const pg = userPage <= 4 ? i + 1 : userPage + i - 3;
                    if (pg < 1 || pg > userTotalPages) return null;
                    return (
                      <button key={pg} onClick={() => loadUsers(pg)} disabled={loading}
                        className={`text-xs font-bold w-8 h-8 rounded-xl transition-all ${pg === userPage ? "bg-primary/20 border border-primary/30 text-primary" : "bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10"}`}>
                        {pg}
                      </button>
                    );
                  })}
                  <button
                    disabled={userPage >= userTotalPages || loading}
                    onClick={() => loadUsers(userPage + 1)}
                    className="bg-white/5 border border-white/10 text-gray-300 text-xs font-bold px-4 py-2 rounded-xl hover:bg-white/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed">
                    Next →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── DELETE CONFIRMATION MODAL ── */}
        {confirmDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="bg-[#0f172a] border border-red-500/20 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
              <h3 className="text-white font-bold text-base mb-2">Delete User?</h3>
              <p className="text-gray-400 text-sm mb-5">This will permanently delete <span className="text-white font-semibold">{confirmDelete.email}</span> and all their data. This cannot be undone.</p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmDelete(null)}
                  className="flex-1 bg-white/5 border border-white/10 text-gray-400 text-sm font-bold py-2.5 rounded-xl hover:bg-white/10 transition-all">
                  Cancel
                </button>
                <button onClick={() => userAction(confirmDelete.id, "delete", confirmDelete.email)}
                  className="flex-1 bg-red-500/20 border border-red-500/30 text-red-400 text-sm font-bold py-2.5 rounded-xl hover:bg-red-500/30 transition-all">
                  {userActionLoading === confirmDelete.id ? <Loader2 size={16} className="animate-spin mx-auto" /> : "Delete"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── PAYMENTS ── */}
        {tab === "payments" && (
          <div className="space-y-4">
            <h2 className="text-lg font-black text-white">Payments <span className="text-gray-500 font-normal text-sm">({payments.length})</span></h2>
            <div className="bg-[#0f172a] border border-white/[0.06] rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-white/[0.06]">
                    {["ID", "User ID", "Reference", "Amount", "Status", "Paid At"].map(h => (
                      <th key={h} className="text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider px-4 py-3">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {payments.map((p: any) => (
                      <tr key={p.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-3 text-gray-500 text-xs">{p.id}</td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{p.user_id}</td>
                        <td className="px-4 py-3 text-gray-400 text-xs font-mono">{p.reference}</td>
                        <td className="px-4 py-3 text-white text-xs font-semibold">₦{Number(p.amount || 0).toLocaleString()}</td>
                        <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{p.paid_at ? new Date(p.paid_at).toLocaleString() : "—"}</td>
                      </tr>
                    ))}
                    {!loading && payments.length === 0 && (
                      <tr><td colSpan={6} className="text-center py-8 text-gray-600 text-sm">No payments found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── PARTNERS ── */}
        {tab === "partners" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-white">Partner Referrals</h2>
              <button onClick={loadPartners} disabled={loading} className="flex items-center gap-2 text-xs text-gray-400 hover:text-white px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-all border border-white/[0.06]">
                <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
              </button>
            </div>

            {partners.length === 0 && !loading && (
              <div className="bg-[#0f172a] border border-white/[0.06] rounded-2xl p-8 text-center">
                <p className="text-gray-500 text-sm">No partner referrals yet.</p>
                <p className="text-gray-600 text-xs mt-1">Partners appear here when their referred users make a verified payment.</p>
              </div>
            )}

            {partners.length > 0 && (
              <div className="bg-[#0f172a] border border-white/[0.06] rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                        {["Partner", "Code", "Paid Referrals", "Total Commission", "Pending", "Settled", "Actions"].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-[11px] font-bold text-gray-500 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {partners.map(p => (
                        <tr key={p.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                          <td className="px-4 py-3 text-xs text-white">{p.email}</td>
                          <td className="px-4 py-3"><span className="text-xs font-mono bg-primary/10 text-primary px-2 py-0.5 rounded">{p.own_referral_code}</span></td>
                          <td className="px-4 py-3 text-xs text-gray-300">{p.total_referred_paid}</td>
                          <td className="px-4 py-3 text-xs font-bold text-white">₦{Number(p.total_commission).toLocaleString()}</td>
                          <td className="px-4 py-3 text-xs text-yellow-400">₦{Number(p.pending_commission).toLocaleString()}</td>
                          <td className="px-4 py-3 text-xs text-emerald-400">₦{Number(p.settled_commission).toLocaleString()}</td>
                          <td className="px-4 py-3 flex gap-2">
                            <button onClick={() => { setSelectedPartner(p); loadCommissions(p.id); }}
                              className="text-xs text-primary hover:underline">View</button>
                            {Number(p.pending_commission) > 0 && (
                              <button onClick={() => settlePartner(p.id)} disabled={settleLoading}
                                className="text-xs bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded hover:bg-emerald-500/20 transition-all disabled:opacity-50">
                                {settleLoading ? "…" : "Settle"}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Commission detail drawer */}
            {selectedPartner && (
              <div className="bg-[#0f172a] border border-primary/20 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-white">{selectedPartner.email}</h3>
                    <p className="text-xs text-gray-500">Code: {selectedPartner.own_referral_code} · {selectedPartner.total_referred_paid} paid referral(s)</p>
                  </div>
                  <button onClick={() => { setSelectedPartner(null); setCommissions([]); }}
                    className="text-xs text-gray-500 hover:text-white px-2 py-1 rounded bg-white/5 hover:bg-white/10">Close</button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                        {["Referred User", "Payment", "Commission", "Status", "Date"].map(h => (
                          <th key={h} className="text-left px-3 py-2 text-[11px] font-bold text-gray-500 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {commissions.map(c => (
                        <tr key={c.id} className="border-b border-white/[0.04]">
                          <td className="px-3 py-2 text-xs text-gray-300">{c.referred_email || `#${c.referred_user_id}`}</td>
                          <td className="px-3 py-2 text-xs text-white">₦{Number(c.gross_amount).toLocaleString()}</td>
                          <td className="px-3 py-2 text-xs font-bold text-primary">₦{Number(c.commission_amount).toLocaleString()}</td>
                          <td className="px-3 py-2">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${c.status === 'settled' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-yellow-500/15 text-yellow-400'}`}>
                              {c.status.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-500">{c.created_at ? new Date(c.created_at).toLocaleDateString() : "—"}</td>
                        </tr>
                      ))}
                      {commissions.length === 0 && (
                        <tr><td colSpan={5} className="px-3 py-4 text-xs text-gray-600 text-center">No commissions found.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── SYSTEM ── */}
        {tab === "system" && (
          <div className="space-y-6">
            <h2 className="text-lg font-black text-white">System Controls</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {/* Enrichment */}
              <div className="bg-[#0f172a] border border-white/[0.06] rounded-2xl p-5 space-y-3">
                <h3 className="text-sm font-bold text-white">Fixture Enrichment</h3>
                <p className="text-xs text-gray-500">Enrich fixtures with form, H2H, and odds data from LiveScore API.</p>
                <div className="flex flex-col gap-2">
                  <button onClick={() => run(() => call("/api/admin/run-enrichment", { method: "POST", body: JSON.stringify({ limit: 50 }) }), "Enrichment started (50 fixtures)")}
                    className="w-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold px-4 py-2.5 rounded-xl hover:bg-primary/20 transition-all">
                    Enrich 50 Fixtures
                  </button>
                  <button onClick={() => run(() => call("/api/admin/run-enrichment", { method: "POST", body: JSON.stringify({ limit: 200 }) }), "Full enrichment started (200 fixtures)")}
                    className="w-full bg-white/5 border border-white/10 text-gray-300 text-xs font-bold px-4 py-2.5 rounded-xl hover:bg-white/10 transition-all">
                    Full Enrichment (200)
                  </button>
                </div>
              </div>

              {/* Fixtures */}
              <div className="bg-[#0f172a] border border-white/[0.06] rounded-2xl p-5 space-y-3">
                <h3 className="text-sm font-bold text-white">Fixture Seeding</h3>
                <p className="text-xs text-gray-500">Re-seed fixtures from LiveScore API for the next 7 days.</p>
                <button onClick={() => run(() => call("/api/admin/reseed", { method: "POST" }), "Reseeding started in background…")}
                  className="w-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold px-4 py-2.5 rounded-xl hover:bg-primary/20 transition-all">
                  Re-Seed Fixtures
                </button>
              </div>

              {/* Prediction Cache */}
              <div className="bg-[#0f172a] border border-white/[0.06] rounded-2xl p-5 space-y-3">
                <h3 className="text-sm font-bold text-white">Prediction Cache</h3>
                <p className="text-xs text-gray-500">Clear cached predictions so the engine rebuilds fresh picks.</p>
                <button onClick={() => run(() => call("/api/admin/clear-prediction-cache", { method: "POST" }), "Prediction cache cleared — engine will re-run fresh")}
                  className="w-full bg-orange-500/10 border border-orange-500/20 text-orange-400 text-xs font-bold px-4 py-2.5 rounded-xl hover:bg-orange-500/20 transition-all">
                  Clear Prediction Cache
                </button>
              </div>

              {/* Odds Cache */}
              <div className="bg-[#0f172a] border border-white/[0.06] rounded-2xl p-5 space-y-3">
                <h3 className="text-sm font-bold text-white">Odds Cache</h3>
                <p className="text-xs text-gray-500">Clear league slug and fixture odds caches.</p>
                <div className="flex flex-col gap-2">
                  <button onClick={() => run(() => call("/api/admin/clear-odds-cache", { method: "POST" }), "League slug cache cleared")}
                    className="w-full bg-white/5 border border-white/10 text-gray-300 text-xs font-bold px-4 py-2.5 rounded-xl hover:bg-white/10 transition-all">
                    Clear League Cache
                  </button>
                  <button onClick={() => run(() => call("/api/admin/clear-fixture-odds", { method: "POST" }), "Fixture odds cleared")}
                    className="w-full bg-white/5 border border-white/10 text-gray-300 text-xs font-bold px-4 py-2.5 rounded-xl hover:bg-white/10 transition-all">
                    Clear Fixture Odds
                  </button>
                </div>
              </div>
            </div>

            {/* Manual upgrade section */}
            <div className="bg-[#0f172a] border border-white/[0.06] rounded-2xl p-6">
              <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-2"><Crown size={15} className="text-primary" /> Manual Premium Upgrade</h3>
              <p className="text-xs text-gray-500 mb-4">Grant 30-day premium access by email address.</p>
              <form onSubmit={handleUpgrade} className="flex gap-3">
                <input value={upgradeEmail} onChange={e => setUpgradeEmail(e.target.value)} placeholder="user@example.com" type="email"
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-primary/50 transition-all" />
                <button type="submit" disabled={upgradeLoading}
                  className="bg-primary/20 border border-primary/30 text-primary font-bold text-sm px-5 py-2.5 rounded-xl hover:bg-primary/30 transition-all disabled:opacity-50 whitespace-nowrap">
                  {upgradeLoading ? <Loader2 size={15} className="animate-spin" /> : "Upgrade →"}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function Admin() {
  const [session, setSession] = useState<AdminSession | null>(() => loadSession());

  const handleLogin = (s: AdminSession) => setSession(s);
  const handleLogout = () => { clearSession(); setSession(null); };

  if (!session) return <LoginScreen onLogin={handleLogin} />;
  return <AdminDashboard session={session} onLogout={handleLogout} />;
}
