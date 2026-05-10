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
