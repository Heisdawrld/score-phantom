export type BasketballDecision = "BET" | "WATCH" | "SKIP";

export interface BasketballRecommendation {
  market?: string | null;
  pick?: string | null;
  selection?: string | null;
  modelProbability?: number | null;
  bookmakerLine?: number | null;
  bookmakerPrice?: number | null;
  impliedProbability?: number | null;
  edge?: number | null;
  edgePoints?: number | null;
  phantomScore?: number | null;
  riskLevel?: string | null;
  noClearEdge?: boolean;
  reasons?: string[];
}

export interface BasketballProjection {
  homePoints?: number | null;
  awayPoints?: number | null;
  total?: number | null;
  spread?: number | null;
  favorite?: string | null;
  homeWinProbability?: number | null;
  awayWinProbability?: number | null;
  marginVolatility?: number | null;
  totalVolatility?: number | null;
}

export interface BasketballPrediction {
  engineVersion?: string;
  league?: { key?: string; label?: string };
  game?: {
    id?: string | number;
    homeTeam?: string;
    awayTeam?: string;
    status?: string;
    startTime?: string;
  };
  projection?: BasketballProjection;
  intel?: {
    dataQuality?: number;
    dataCoverageLabel?: string;
    sampleQuality?: number;
    oddsQuality?: number;
    bookmakerCount?: number;
    bookmakers?: string[];
    volatility?: number;
    limitations?: string[];
  };
  recommendation?: BasketballRecommendation;
  candidates?: BasketballRecommendation[];
}

export interface BasketballGame {
  id: string | number;
  league_key?: string;
  external_game_id?: string | number;
  odds_event_id?: string | number;
  status?: string;
  start_time?: string;
  home_team?: string;
  away_team?: string;
  prediction_summary?: {
    market?: string | null;
    selection?: string | null;
    modelProbability?: number | null;
    bookmakerLine?: number | null;
    bookmakerPrice?: number | null;
    edge?: number | null;
    phantomScore?: number | null;
    riskLevel?: string | null;
    noClearEdge?: boolean;
  } | null;
}

export function clampBasketball(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

export function basketballDecision(prediction?: BasketballPrediction | null): BasketballDecision {
  const rec = prediction?.recommendation;
  if (!rec || rec.noClearEdge || !rec.pick) return "SKIP";
  const score = Number(rec.phantomScore || 0);
  const probability = Number(rec.modelProbability || 0);
  const coverage = Number(prediction?.intel?.dataQuality || 0);
  const oddsQuality = Number(prediction?.intel?.oddsQuality || 0);
  if (score >= 72 && probability >= 0.62 && coverage >= 60 && oddsQuality >= 65) return "BET";
  return "WATCH";
}

export function basketballGameHref(prediction?: BasketballPrediction | null) {
  const league = prediction?.league?.key || "basketball";
  const id = prediction?.game?.id;
  return id == null ? "/basketball" : `/basketball/games/${encodeURIComponent(String(league))}/${encodeURIComponent(String(id))}`;
}

export function formatBasketballTip(value?: string | null) {
  if (!value) return "TBD";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "TBD";
  return date.toLocaleString("en-NG", {
    timeZone: "Africa/Lagos",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function basketballMarketLabel(value?: string | null) {
  const market = String(value || "").toLowerCase();
  if (market === "moneyline") return "Moneyline";
  if (market === "spread") return "Spread";
  if (market === "total") return "Game total";
  return value || "No market";
}

export function basketballPercent(value?: number | null, digits = 0) {
  const number = Number(value || 0);
  return `${(number * 100).toFixed(digits)}%`;
}

export function basketballEdgeLabel(rec?: BasketballRecommendation | null) {
  if (!rec) return "—";
  if (rec.edgePoints != null) return `${Number(rec.edgePoints).toFixed(1)} pts`;
  if (rec.edge != null) return `${(Number(rec.edge) * 100).toFixed(1)}%`;
  return "—";
}

export function basketballDecisionTone(decision: BasketballDecision) {
  if (decision === "BET") return "border-emerald-300/25 bg-emerald-400/10 text-emerald-200";
  if (decision === "WATCH") return "border-amber-300/25 bg-amber-400/10 text-amber-100";
  return "border-rose-300/20 bg-rose-400/10 text-rose-200";
}
