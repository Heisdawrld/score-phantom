import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { ChevronRight, ChevronDown, ChevronUp, Trophy, Zap, Lock, AlertCircle, Flame, BarChart2, Activity, Star, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfidenceRing } from "@/components/ui/ConfidenceRing";
import { ConfidenceBadge } from "@/components/ui/ConfidenceBadge";
import { TeamLogo } from "@/components/TeamLogo";

function toWAT(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-NG', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit', hour12: false });
  } catch { return ''; }
}

export function EnrichmentBadge({ status }: { status?: string | null }) {
  const config: Record<string, { label: string; cls: string }> = {
    deep:    { label: "Deep",     cls: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
    basic:   { label: "Basic",    cls: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
    limited: { label: "Limited",  cls: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
    no_data: { label: "No Data",  cls: "bg-white/5 text-white/30 border-white/10" },
  };
  const c = !status ? { label: ". . .", cls: "bg-white/5 text-white/20 border-white/8 animate-pulse" } : (config[status] ?? config["no_data"]);
  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider shrink-0 ${c.cls}`}>
      {c.label}
    </span>
  );
}
