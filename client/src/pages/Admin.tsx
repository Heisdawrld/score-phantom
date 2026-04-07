/**
 * Admin.tsx — Standalone Admin Panel
 *
 * Completely independent from the main app auth system.
 * Has its own email + password login that calls /api/auth/admin-login.
 * The server verifies the credentials match ADMIN_EMAIL + ADMIN_SECRET.
 * No ProtectedRoute, no shared auth state.
 */
import React, { useState, useEffect, useCallback } from "react";
import { Eye, EyeOff, LogOut, RefreshCw, Users, CreditCard, BarChart3, Settings, CheckCircle2, AlertCircle, Crown, Clock, Loader2, Shield, UserPlus, Link2, Copy, X } from "lucide-react";

// ── Config ────────────────────────────────────────────────────────────────────
const API = "";
const STORAGE_KEY = "sp_admin_session";

// ── Types ─────────────────────────────────────────────────────────────────────
interface AdminSession { token: string; adminSecret: string; email: string; }
interface AdminStats { total_users: number; premium_users: number; trial_users: number; expired_users: number; revenue_total: number; payments_today: number; revenue_today: number; fixtures_total: number; }
interface AdminUser { id: number; email: string; status: string; trial_ends_at: string | null; premium_expires_at: string | null; subscription_expires_at: string | null; payments?: any[]; access?: any; own_referral_code?: string | null; referred_by_code?: string | null; }
interface AdminPayment { id: number; user_id: number; reference: string; amount: number; amount_currency: string; status: string; paid_at: string | null; created_at: string; }
interface Partner { partner_id: number; name: string; email: string | null; referral_code: string; referral_link: string; commission_rate: number; status: string; notes: string | null; total_referred_signups: number; total_referred_trials: number; total_referred_premium: number; total_referred_paid: number; total_revenue: number; total_commission: number; pending_commission: number; settled_commission: number; last_payout_at: string | null; created_at: string; own_referral_code?: string; }
interface Commission { id: number; referred_user_id: number; referred_email: string; referred_signup_date: string | null; payment_id: number | null; payment_reference: string | null; gross_amount: number; commission_rate: number; commission_amount: number; status: string; created_at: string; paid_at: string | null; settled_at: string | null; payment_date: string | null; payment_status: string | null; notes: string | null; }

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
  const [refCodeModal, setRefCodeModal] = useState<AdminUser | null>(null);
  const [refCodeInput, setRefCodeInput] = useState("");
  const [refCodeLoading, setRefCodeLoading] = useState(false);
  const [refCodeResult, setRefCodeResult] = useState<{ code: string; link: string } | null>(null);
  // Create Partner modal
  const [createPartnerOpen, setCreatePartnerOpen] = useState(false);
  const [createPartnerForm, setCreatePartnerForm] = useState({ name: "", email: "", code: "", status: "active", notes: "" });
  const [createPartnerLoading, setCreatePartnerLoading] = useState(false);
  const [createPartnerError, setCreatePartnerError] = useState("");
  // Partner ledger settle-selected
  const [selectedCommIds, setSelectedCommIds] = useState<Set<number>>(new Set());
  const [settleSelectedLoading, setSettleSelectedLoading] = useState(false);

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
      const r = await call("/api/admin/partners/" + partnerId + "/commissions");
      setCommissions(r.commissions || []);
    } catch { setCommissions([]); }
  }, [call]);

  const createPartner = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatePartnerLoading(true); setCreatePartnerError("");
    try {
      await call("/api/admin/partners", { method: "POST", body: JSON.stringify({ name: createPartnerForm.name.trim(), email: createPartnerForm.email.trim()||undefined, code: createPartnerForm.code.trim(), status: createPartnerForm.status, notes: createPartnerForm.notes.trim()||undefined }) });
      flash(true, "Partner created!");
      setCreatePartnerOpen(false);
      setCreatePartnerForm({ name: "", email: "", code: "", status: "active", notes: "" });
      loadPartners();
    } catch (e: any) { setCreatePartnerError(e.message || "Failed to create partner"); }
    finally { setCreatePartnerLoading(false); }
  };

  const settleSelected = async (partnerId: number) => {
    if (selectedCommIds.size === 0) return;
    setSettleSelectedLoading(true);
    try {
      await call("/api/admin/partners/" + partnerId + "/settle-selected", { method: "POST", body: JSON.stringify({ ids: Array.from(selectedCommIds) }) });
      flash(true, "Selected commissions settled!");
      setSelectedCommIds(new Set());
      loadPartners();
      if (selectedPartner) loadCommissions(selectedPartner.partner_id);
    } catch (e: any) { flash(false, e.message); }
    finally { setSettleSelectedLoading(false); }
  };

  const reverseCommission = async (commId: number) => {
    if (!confirm("Reverse this commission? It will be removed from pending/paid totals.")) return;
    try {
      await call("/api/admin/commissions/" + commId + "/reverse", { method: "POST" });
      flash(true, "Commission reversed");
      if (selectedPartner) loadCommissions(selectedPartner.partner_id);
      loadPartners();
    } catch (e: any) { flash(false, e.message || "Failed"); }
  };
  const changePartnerStatus = async (partnerId: number, status: string) => {
    try {
      await call("/api/admin/partners/" + partnerId + "/status", { method: "POST", body: JSON.stringify({ status }) });
      flash(true, "Status updated to " + status);
      loadPartners();
    } catch (e: any) { flash(false, e.message || "Failed"); }
  };
  const deletePartner = async (partnerId: number) => {
    try {
      await call("/api/admin/partners/" + partnerId, { method: "DELETE" });
      flash(true, "Partner removed");
      setSelectedPartner(null);
      setCommissions([]);
      loadPartners();
    } catch (e: any) { flash(false, e.message); }
  };

  const settlePartner = async (partnerId: number) => {
    setSettleLoading(true);
    try {
      await call("/api/admin/partners/" + partnerId + "/settle", { method: "POST" });
      flash(true, "All pending commissions settled!");
      loadPartners();
      loadCommissions(partnerId);
      setSelectedCommIds(new Set());
    } catch (e: any) { flash(false, e.message); }
    finally { setSettleLoading(false); }
  };

  const generateRefCode = async (userId: number, customCode: string) => {
    setRefCodeLoading(true);
    setRefCodeResult(null);
    try {
      const r = await call(`/api/admin/users/${userId}/referral-code`, {
        method: "POST",
        body: JSON.stringify({ code: customCode }),
      });
      setRefCodeResult({ code: r.referral_code, link: r.referral_link });
      flash(true, `Referral code "${r.referral_code}" generated!`);
      loadUsers();
    } catch (e: any) { flash(false, e.message); }
    finally { setRefCodeLoading(false); }
  };

  const removeRefCode = async (userId: number) => {
    try {
      await call(`/api/admin/users/${userId}/referral-code`, { method: "DELETE" });
      flash(true, "Referral code removed");
      loadUsers();
    } catch (e: any) { flash(false, e.message); }
  };

  useEffect(() => { loadOverview(); }, [loadOverview]);
  useEffect(() => { if (tab === "users") loadUsers(); }, [tab, loadUsers]);
  useEffect(() => { if (tab === "payments") loadPayments(); }, [tab, loadPayments]);
  useEffect(() => { if (tab === "partners") { loadPartners(); setSelectedPartner(null); setCommissions([]); setSelectedCommIds(new Set()); } }, [tab, loadPartners]);

  const run = async (fn: () => Promise<any>, msg: string) => {
    try { await fn(); flash(true, msg); } catch (e: any) { const raw = e?.message || ""; const friendly = /SQL|sqlite|SQLITE|no such column/i.test(raw) ? "Data sync error — please retry. Run Enrichment first if this persists." : (raw || "Operation failed"); flash(false, friendly); }
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
                    {["ID", "Email", "Status", "Referral Code", "Premium Expires", "Referred By", "Actions"].map(h => (
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
                          <td className="px-4 py-3 text-xs">
                            {u.own_referral_code ? (
                              <span className="font-mono bg-primary/10 text-primary px-2 py-0.5 rounded text-[10px] font-bold">{u.own_referral_code}</span>
                            ) : (
                              <span className="text-gray-600">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{u.premium_expires_at ? new Date(u.premium_expires_at).toLocaleDateString() : "—"}</td>
                          <td className="px-4 py-3 text-xs">
                            {u.referred_by_code ? (
                              <span className="font-mono bg-yellow-500/10 text-yellow-400 px-2 py-0.5 rounded text-[10px]">{u.referred_by_code}</span>
                            ) : (
                              <span className="text-gray-600">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {/* Generate Referral Code */}
                              <button disabled={isLoading} onClick={() => { setRefCodeModal(u); setRefCodeInput(""); setRefCodeResult(null); }}
                                title={u.own_referral_code ? "Change referral code" : "Generate referral code"}
                                className="bg-purple-500/10 border border-purple-500/20 text-purple-400 text-[10px] font-bold px-2 py-1 rounded-lg hover:bg-purple-500/20 transition-all disabled:opacity-40 whitespace-nowrap">
                                <Link2 size={10} className="inline mr-0.5" /> {u.own_referral_code ? "Code" : "Gen Code"}
                              </button>
                              {/* Grant 30-day Premium */}
                              <button disabled={isLoading} onClick={() => userAction(u.id, "grant", u.email)}
                                title="Grant 30-day Premium"
                                className="bg-primary/10 border border-primary/20 text-primary text-[10px] font-bold px-2 py-1 rounded-lg hover:bg-primary/20 transition-all disabled:opacity-40 whitespace-nowrap">
                                {isLoading ? <Loader2 size={10} className="animate-spin inline" /> : "Grant"}
                              </button>
                              {/* Revoke Premium */}
                              {st === "active" && (
                                <button disabled={isLoading} onClick={() => userAction(u.id, "revoke", u.email)}
                                  title="Revoke Premium"
                                  className="bg-orange-500/10 border border-orange-500/20 text-orange-400 text-[10px] font-bold px-2 py-1 rounded-lg hover:bg-orange-500/20 transition-all disabled:opacity-40 whitespace-nowrap">
                                  Revoke
                                </button>
                              )}
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

        {/* ── REFERRAL CODE MODAL ── */}
        {refCodeModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="bg-[#0f172a] border border-purple-500/20 rounded-2xl p-6 max-w-md w-full shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-bold text-base flex items-center gap-2"><Link2 size={16} className="text-purple-400" /> Referral Code</h3>
                <button onClick={() => setRefCodeModal(null)} className="text-gray-500 hover:text-white"><X size={16} /></button>
              </div>
              <p className="text-gray-400 text-sm mb-1">{refCodeModal.email}</p>
              {refCodeModal.own_referral_code && (
                <div className="mb-4 bg-purple-500/10 border border-purple-500/20 rounded-xl px-4 py-3">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Current Code</p>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-purple-300 font-bold text-sm">{refCodeModal.own_referral_code}</span>
                    <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}/?ref=${refCodeModal.own_referral_code}`)}
                      title="Copy referral link"
                      className="text-gray-500 hover:text-purple-300 transition-colors"><Copy size={13} /></button>
                    <button onClick={() => { removeRefCode(refCodeModal.id); setRefCodeModal(null); }}
                      title="Remove code"
                      className="text-gray-500 hover:text-red-400 transition-colors ml-auto text-[10px]">Remove</button>
                  </div>
                  <p className="text-[10px] text-gray-600 mt-1 break-all">{window.location.origin}/?ref={refCodeModal.own_referral_code}</p>
                </div>
              )}

              {refCodeResult ? (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-4 mb-4 space-y-2">
                  <p className="text-emerald-400 font-bold text-sm flex items-center gap-2"><CheckCircle2 size={14} /> Code Generated</p>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-white font-bold">{refCodeResult.code}</span>
                    <button onClick={() => navigator.clipboard.writeText(refCodeResult.link)}
                      className="bg-white/10 text-gray-300 text-[10px] px-2 py-1 rounded hover:bg-white/20 flex items-center gap-1"><Copy size={10} /> Copy Link</button>
                  </div>
                  <p className="text-[10px] text-gray-500 break-all">{refCodeResult.link}</p>
                </div>
              ) : (
                <div className="space-y-3 mb-4">
                  <div>
                    <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">Custom Code (optional)</label>
                    <input value={refCodeInput} onChange={e => setRefCodeInput(e.target.value)}
                      placeholder="e.g. MAZI, KING, DAVID..."
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-purple-500/50 transition-all font-mono" />
                    <p className="text-[10px] text-gray-600 mt-1">3-20 characters. Letters, numbers, underscore, hyphen. Leave blank to auto-generate.</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => generateRefCode(refCodeModal.id, refCodeInput.trim())} disabled={refCodeLoading}
                      className="flex-1 bg-purple-500/20 border border-purple-500/30 text-purple-300 font-bold text-sm py-2.5 rounded-xl hover:bg-purple-500/30 transition-all disabled:opacity-50">
                      {refCodeLoading ? <Loader2 size={15} className="animate-spin mx-auto" /> : refCodeInput.trim() ? `Set "${refCodeInput.trim().toUpperCase()}"` : "Auto-Generate"}
                    </button>
                  </div>
                </div>
              )}

              <button onClick={() => setRefCodeModal(null)}
                className="w-full bg-white/5 border border-white/10 text-gray-400 text-sm font-bold py-2.5 rounded-xl hover:bg-white/10 transition-all">
                Close
              </button>
            </div>
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
                    {["ID", "User", "Reference", "Amount", "Status", "Referrer", "Paid At"].map(h => (
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
                        <td className="px-4 py-3 text-xs">{(p as any).referred_by_code ? <span className="font-mono bg-yellow-500/10 text-yellow-400 px-2 py-0.5 rounded text-[10px] font-bold">{(p as any).referred_by_code}</span> : <span className="text-gray-600">—</span>}</td>
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

        {/* ── PARTNERS ── */}
        {tab === "partners" && (
          <div className="space-y-6">

            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-white">Partners</h2>
                <p className="text-xs text-gray-500 mt-0.5">Manage partner referral codes, track earnings and settle commissions.</p>
              </div>
              <div className="flex gap-2">
                <button onClick={loadPartners} disabled={loading} className="flex items-center gap-2 text-xs text-gray-400 hover:text-white px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-all border border-white/[0.06]">
                  <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
                </button>
                <button onClick={() => { setCreatePartnerOpen(true); setCreatePartnerError(""); }}
                  className="flex items-center gap-2 text-xs text-white px-4 py-2 rounded-lg bg-primary/20 border border-primary/30 hover:bg-primary/30 transition-all font-semibold">
                  <UserPlus size={13} /> New Partner
                </button>
              </div>
            </div>

            {/* Create Partner Modal */}
            {createPartnerOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
                <div className="bg-[#0f172a] border border-primary/20 rounded-2xl p-6 max-w-md w-full shadow-2xl">
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="text-white font-bold text-base flex items-center gap-2"><UserPlus size={16} className="text-primary" /> Create Partner</h3>
                    <button onClick={() => setCreatePartnerOpen(false)} className="text-gray-500 hover:text-white"><X size={16} /></button>
                  </div>
                  {createPartnerError && (
                    <div className="mb-4 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-xs text-red-400 flex items-center gap-2">
                      <AlertCircle size={13} /> {createPartnerError}
                    </div>
                  )}
                  <form onSubmit={createPartner} className="space-y-3">
                    <div>
                      <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">Partner Name *</label>
                      <input required value={createPartnerForm.name} onChange={e => setCreatePartnerForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Mazi Emeka" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-primary/50 transition-all" />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">Partner Email</label>
                      <input type="email" value={createPartnerForm.email} onChange={e => setCreatePartnerForm(f => ({ ...f, email: e.target.value }))} placeholder="partner@email.com (optional)" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-primary/50 transition-all" />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">Referral Code *</label>
                      <input required value={createPartnerForm.code} onChange={e => setCreatePartnerForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="e.g. MAZI" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-primary/50 font-mono tracking-widest transition-all" />
                      <p className="text-[10px] text-gray-600 mt-1">Link: score-phantom.onrender.com/?ref={createPartnerForm.code||"CODE"} · 25% commission · max 5 partners</p>
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 uppercase tracking-wider block mb-1">Notes (internal)</label>
                      <input value={createPartnerForm.notes} onChange={e => setCreatePartnerForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. WhatsApp handle, recruitment channel" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-primary/50 transition-all" />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button type="button" onClick={() => setCreatePartnerOpen(false)} className="flex-1 bg-white/5 border border-white/10 text-gray-400 text-sm font-bold py-2.5 rounded-xl hover:bg-white/10 transition-all">Cancel</button>
                      <button type="submit" disabled={createPartnerLoading} className="flex-1 bg-primary/20 border border-primary/30 text-primary font-bold text-sm py-2.5 rounded-xl hover:bg-primary/30 transition-all disabled:opacity-50">
                        {createPartnerLoading ? <Loader2 size={15} className="animate-spin mx-auto" /> : "Create Partner"}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
            {/* Partner List */}
            {partners.length === 0 && !loading && (
              <div className="bg-[#0f172a] border border-white/[0.06] rounded-2xl p-8 text-center">
                <UserPlus size={28} className="text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400 text-sm font-semibold">No partners yet</p>
                <p className="text-gray-600 text-xs mt-1">Click &quot;New Partner&quot; to create your first partner and generate a referral link.</p>
              </div>
            )}

            {partners.length > 0 && (
              <div className="bg-[#0f172a] border border-white/[0.06] rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                          {["Partner", "Code / Link", "Signups", "Trial", "Premium", "Revenue", "Commission", "Pending", "Settled", "Last Payout", "Actions"].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {partners.map(p => (
                        <tr key={p.partner_id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                          <td className="px-4 py-3">
                            <p className="text-xs text-white font-semibold">{p.name}</p>
                            <p className="text-[10px] text-gray-500">{p.email || "—"}</p>
                            <span className={"text-[9px] font-bold px-1.5 py-0.5 rounded-full " + (p.status==="active"?"bg-emerald-500/15 text-emerald-400":p.status==="paused"?"bg-yellow-500/15 text-yellow-400":"bg-red-500/15 text-red-400")}>{(p.status||"active").toUpperCase()}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-mono bg-primary/10 text-primary px-2 py-0.5 rounded font-bold">{p.referral_code}</span>
                              <button onClick={() => { navigator.clipboard.writeText(p.referral_code); flash(true, "Code copied!"); }} title="Copy code" className="text-gray-600 hover:text-primary transition-colors"><Copy size={11} /></button>
                              <button onClick={() => { navigator.clipboard.writeText(p.referral_link); flash(true, "Link copied!"); }} title="Copy link" className="text-gray-600 hover:text-blue-400 transition-colors"><Link2 size={11} /></button>
                            </div>
                            <p className="text-[9px] text-gray-600 mt-0.5 max-w-[160px] truncate">{p.referral_link}</p>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-300">{Number(p.total_referred_signups)}</td>
                          <td className="px-4 py-3"><span className="text-xs font-bold text-blue-400">{Number(p.total_referred_trials||0)}</span></td>
                          <td className="px-4 py-3"><span className="text-xs font-bold text-primary">{Number(p.total_referred_premium||0)}</span></td>
                          <td className="px-4 py-3 text-xs text-gray-300">{Number(p.total_referred_paid)}</td>
                          <td className="px-4 py-3 text-xs text-gray-300">₦{Number(p.total_revenue||0).toLocaleString()}</td>
                          <td className="px-4 py-3 text-xs font-bold text-white">₦{Number(p.total_commission).toLocaleString()}</td>
                          <td className="px-4 py-3 text-xs font-bold text-yellow-400">&#8358;{Number(p.pending_commission).toLocaleString()}</td>
                          <td className="px-4 py-3 text-xs font-bold text-emerald-400">&#8358;{Number(p.settled_commission).toLocaleString()}</td>
                          <td className="px-4 py-3 text-[10px] text-gray-500">{p.last_payout_at ? new Date(p.last_payout_at).toLocaleDateString() : "Never"}</td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1.5">
                              <button onClick={() => { setSelectedPartner(p); loadCommissions(p.partner_id); setSelectedCommIds(new Set()); }}
                                className="text-[10px] bg-primary/10 border border-primary/20 text-primary px-2 py-1 rounded-lg hover:bg-primary/20 transition-all font-bold">Ledger</button>
                              {Number(p.pending_commission) > 0 && (
                                <button onClick={() => settlePartner(p.partner_id)} disabled={settleLoading}
                                  className="text-[10px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-1 rounded-lg hover:bg-emerald-500/20 transition-all disabled:opacity-50 font-bold">Settle All</button>
                              )}
                              <button onClick={() => { if (confirm("Remove partner " + p.name + "?")) deletePartner(p.partner_id); }}
                                className="text-[10px] bg-red-500/10 border border-red-500/20 text-red-400 px-2 py-1 rounded-lg hover:bg-red-500/20 transition-all">Remove</button>
                              {p.status==="active" && <button onClick={() => changePartnerStatus(p.partner_id,"paused")} className="text-[10px] bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 px-2 py-1 rounded-lg hover:bg-yellow-500/20 transition-all">Pause</button>}
                              {p.status!=="active" && <button onClick={() => changePartnerStatus(p.partner_id,"active")} className="text-[10px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-1 rounded-lg hover:bg-emerald-500/20 transition-all">Activate</button>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {/* Partner Ledger Panel */}
            {selectedPartner && (
              <div className="bg-[#0f172a] border border-primary/20 rounded-2xl p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-white">{selectedPartner.name}</h3>
                    <p className="text-xs text-gray-500">{selectedPartner.email} &middot; Code: <span className="font-mono text-primary">{selectedPartner.referral_code}</span> &middot; Rate: {Math.round(selectedPartner.commission_rate * 100)}%</p>
                    <div className="flex gap-4 mt-2">
                      <span className="text-[10px] text-gray-500">Signups: <span className="text-white font-bold">{selectedPartner.total_referred_signups}</span></span>
                      <span className="text-[10px] text-blue-400">Trial: <span className="font-bold">{Number(selectedPartner.total_referred_trials||0)}</span></span>
                      <span className="text-[10px] text-primary">Premium: <span className="font-bold">{Number(selectedPartner.total_referred_premium||0)}</span></span>
                      <span className="text-[10px] text-yellow-400">Pending: <span className="font-bold">&#8358;{Number(selectedPartner.pending_commission).toLocaleString()}</span></span>
                      <span className="text-[10px] text-emerald-400">Settled: <span className="font-bold">&#8358;{Number(selectedPartner.settled_commission).toLocaleString()}</span></span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {selectedCommIds.size > 0 && (
                      <button onClick={() => settleSelected(selectedPartner.partner_id)} disabled={settleSelectedLoading}
                        className="text-xs bg-yellow-500/15 border border-yellow-500/25 text-yellow-400 px-3 py-1.5 rounded-xl hover:bg-yellow-500/25 transition-all font-bold disabled:opacity-50">
                        {settleSelectedLoading ? <Loader2 size={13} className="animate-spin inline" /> : "Mark as Paid (" + selectedCommIds.size + ")"}
                      </button>
                    )}
                    {Number(selectedPartner.pending_commission) > 0 && (
                      <button onClick={() => settlePartner(selectedPartner.partner_id)} disabled={settleLoading}
                        className="text-xs bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 px-3 py-1.5 rounded-xl hover:bg-emerald-500/25 transition-all font-bold disabled:opacity-50">
                        {settleLoading ? <Loader2 size={13} className="animate-spin inline" /> : "Mark All Pending as Paid"}
                      </button>
                    )}
                    <button onClick={() => { setSelectedPartner(null); setCommissions([]); setSelectedCommIds(new Set()); }}
                      className="text-xs text-gray-500 hover:text-white px-2 py-1.5 rounded bg-white/5 hover:bg-white/10">Close</button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                        <th className="px-2 py-2 w-8"></th>
                          {["Referred User", "Signed Up", "Ref #", "Payment", "Commission", "Status", "Payment Date", "Paid Date", ""].map(h => (
                          <th key={h} className="text-left px-3 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {commissions.map(c => (
                        <tr key={c.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                          <td className="px-2 py-2">
                            {c.status === "pending" && (
                              <input type="checkbox" checked={selectedCommIds.has(c.id)}
                                onChange={e => {
                                  const s = new Set(selectedCommIds);
                                  if (e.target.checked) s.add(c.id); else s.delete(c.id);
                                  setSelectedCommIds(s);
                                }}
                                className="w-3.5 h-3.5 accent-primary cursor-pointer" />
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-300 max-w-[140px] truncate">{c.referred_email || "#" + c.referred_user_id}</td>
                          <td className="px-3 py-2 text-[10px] text-gray-500">{c.referred_signup_date ? new Date(c.referred_signup_date).toLocaleDateString() : "—"}</td>
                          <td className="px-3 py-2 text-[9px] font-mono text-gray-600 max-w-[100px] truncate" title={c.payment_reference||""}>{c.payment_reference||"—"}</td>
                          <td className="px-3 py-2 text-[10px] text-gray-500">{c.referred_signup_date ? new Date(c.referred_signup_date).toLocaleDateString() : "—"}</td>
                          <td className="px-3 py-2">
                            <span className={"text-[10px] font-bold px-2 py-0.5 rounded-full " + (c.payment_status === "verified" ? "bg-emerald-500/15 text-emerald-400" : "bg-gray-500/15 text-gray-400")}>
                              {c.payment_status || "—"}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs text-white">&#8358;{Number(c.gross_amount).toLocaleString()}</td>
                          <td className="px-3 py-2 text-xs font-bold text-primary">&#8358;{Number(c.commission_amount).toLocaleString()} <span className="text-[9px] text-gray-500">({Math.round(c.commission_rate * 100)}%)</span></td>
                          <td className="px-3 py-2">
                            <span className={"text-[10px] font-bold px-2 py-0.5 rounded-full " + (c.status==="paid"||c.status==="settled" ? "bg-emerald-500/15 text-emerald-400" : c.status==="reversed" ? "bg-red-500/15 text-red-400 line-through" : "bg-yellow-500/15 text-yellow-400")}>
                              {c.status==="settled"?"PAID":c.status.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-[10px] text-gray-500">{c.payment_date ? new Date(c.payment_date).toLocaleDateString() : "—"}</td>
                          <td className="px-3 py-2 text-[10px] text-gray-500">{(c.paid_at||c.settled_at) ? new Date((c.paid_at||c.settled_at)!).toLocaleDateString() : "—"}</td>
                          <td className="px-3 py-2">
                            {c.status!=="reversed" && <button onClick={() => reverseCommission(c.id)} className="text-[9px] bg-red-500/10 border border-red-500/20 text-red-400 px-1.5 py-0.5 rounded hover:bg-red-500/20 transition-all">Reverse</button>}
                          </td>
                        </tr>
                      ))}
                      {commissions.length === 0 && (
                        <tr><td colSpan={9} className="px-3 py-6 text-xs text-gray-600 text-center">No commissions recorded yet for this partner.</td></tr>
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
                <button onClick={() => { run(() => call("/api/admin/rebuild-track-record", { method: "POST", body: JSON.stringify({ days: 30 }) }), "Track Record rebuild started — building predictions + evaluating results for last 30 days. This may take 2-3 minutes."); }} className="w-full bg-primary/10 border border-primary/30 text-primary text-xs font-bold px-4 py-2.5 rounded-xl hover:bg-primary/20 transition-all">🔄 Rebuild Track Record (last 30 days)</button>
                <button onClick={() => { if(confirm("Clear ALL prediction_outcomes? This resets track record.")) run(() => call("/api/admin/clear-track-record", { method: "POST" }), "Track record cleared"); }} className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 text-sm text-red-400 border border-red-500/20">🗑️ Clear Track Record (reset outcomes)</button>
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
