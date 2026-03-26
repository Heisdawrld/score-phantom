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
