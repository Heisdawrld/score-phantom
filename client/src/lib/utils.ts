import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatOdds(val: number | null | undefined): string {
  if (val === null || val === undefined) return "-";
  return val.toFixed(2);
}

export function formatPct(val: number | null | undefined): string {
  if (val === null || val === undefined) return "0%";
  // Some APIs return 0.65, some return 65. Handle both cleanly.
  const num = val <= 1 && val > 0 ? val * 100 : val;
  return `${num.toFixed(0)}%`;
}

/** Align with server-side form logic — short team labels were mis-classifying home/away in the Stats tab. */
export function fuzzyTeamMatch(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const na = String(a).toLowerCase().trim();
  const nb = String(b).toLowerCase().trim();
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const wa = na.split(/\s+/)[0] || "";
  const wb = nb.split(/\s+/)[0] || "";
  if (wa.length >= 4 && (wa === wb || wa.includes(wb) || wb.includes(wa))) return true;
  return false;
}

export function sortMatchesByDateDesc<T extends { date?: string | null }>(rows: T[]): T[] {
  return [...rows].sort(
    (x, y) => new Date(y.date || 0).getTime() - new Date(x.date || 0).getTime(),
  );
}

/**
 * Unified odds resolution — single source of truth for mapping a pick label
 * to the correct odds field from the API response.
 *
 * Used by both PredictionPanel and PredictionTab so they always resolve
 * the same odds for the same pick.
 */
export function getOddsForPick(odds: any, pick: string, market: string): { value: number; label: string } | null {
  if (!odds) return null;
  const p = String(pick || "").toLowerCase();
  const m = String(market || "").toLowerCase();
  if (m.includes("match result") || m.includes("1x2")) {
    if (p.includes("draw")) return { value: odds.draw, label: "Draw" };
    if (p.includes(" win") && !p.includes("dnb")) {
      const val = odds.home ?? odds.away;
      return val ? { value: val, label: "Win" } : null;
    }
  }
  if (m.includes("over/under") || m.includes("total")) {
    const ou = odds.over_under || {};
    const get = (nested: any, flat: any) => nested ?? flat;
    if (p.includes("over 2.5")) return { value: get(ou.over_2_5, odds.over_2_5), label: "Over 2.5" };
    if (p.includes("under 2.5")) return { value: get(ou.under_2_5, odds.under_2_5), label: "Under 2.5" };
    if (p.includes("over 1.5")) return { value: get(ou.over_1_5, odds.over_1_5), label: "Over 1.5" };
    if (p.includes("under 1.5")) return { value: get(ou.under_1_5, odds.under_1_5), label: "Under 1.5" };
    if (p.includes("over 3.5")) return { value: get(ou.over_3_5, odds.over_3_5), label: "Over 3.5" };
    if (p.includes("under 3.5")) return { value: get(ou.under_3_5, odds.under_3_5), label: "Under 3.5" };
  }
  if (m.includes("both teams") || m.includes("btts")) {
    if (p.includes("not") || p === "both teams not to score") return { value: odds.btts_no, label: "BTTS No" };
    return { value: odds.btts_yes, label: "BTTS Yes" };
  }
  if (m.includes("draw no bet") || m.includes("dnb")) {
    const val = odds.home ?? odds.away;
    return val ? { value: val, label: "DNB" } : null;
  }
  if (m.includes("double chance")) {
    const val = odds.home ?? odds.away;
    return val ? { value: val, label: "DC" } : null;
  }
  return null;
}
