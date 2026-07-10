import { useState, useEffect, useCallback } from "react";

/**
 * useRecentlyViewed — tracks fixture IDs the user has visited, stored in localStorage.
 *
 * Stores the last 8 viewed fixtures as [{ fixtureId, homeTeam, awayTeam, homeLogo,
 * awayLogo, tournament, pick, probability, viewedAt }]. Used by the Dashboard to
 * show a "Recently Viewed" strip so users can quickly jump back to matches they
 * were exploring.
 *
 * No backend dependency — purely client-side. Capped at 8 entries to keep
 * localStorage small and the strip focused.
 */

export interface RecentlyViewedItem {
  fixtureId: string;
  homeTeam: string;
  awayTeam: string;
  homeLogo?: string;
  awayLogo?: string;
  tournament?: string;
  pick?: string;
  probability?: number;
  viewedAt: number; // epoch ms
}

const STORAGE_KEY = "sp_recently_viewed";
const MAX_ITEMS = 8;

function load(): RecentlyViewedItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MAX_ITEMS) : [];
  } catch {
    return [];
  }
}

function save(items: RecentlyViewedItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
  } catch {
    // localStorage might be full or disabled — silently ignore
  }
}

export function useRecentlyViewed() {
  const [items, setItems] = useState<RecentlyViewedItem[]>([]);

  // Load on mount
  useEffect(() => {
    setItems(load());
  }, []);

  // Listen for cross-tab updates (e.g., user opens a match in another tab)
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setItems(load());
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  /** Add or move a fixture to the top of the recently viewed list. */
  const addRecentlyViewed = useCallback((item: Omit<RecentlyViewedItem, "viewedAt">) => {
    setItems(prev => {
      // Remove any existing entry for this fixture (dedup by fixtureId)
      const filtered = prev.filter(p => p.fixtureId !== item.fixtureId);
      const next = [{ ...item, viewedAt: Date.now() }, ...filtered].slice(0, MAX_ITEMS);
      save(next);
      return next;
    });
  }, []);

  /** Clear all recently viewed items. */
  const clearRecentlyViewed = useCallback(() => {
    setItems([]);
    save([]);
  }, []);

  return { recentlyViewed: items, addRecentlyViewed, clearRecentlyViewed };
}
