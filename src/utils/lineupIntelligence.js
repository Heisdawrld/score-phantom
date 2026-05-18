import { clamp, safeNum } from './math.js';

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function round(value, digits = 4) {
  if (!Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function firstDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

function firstBoolean(...values) {
  for (const value of values) {
    if (typeof value === 'boolean') return value;
  }
  return null;
}

function lower(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeConfidence(value, fallback = null) {
  const raw = safeNum(value, null);
  if (raw == null) return fallback;
  if (raw > 1.01) return clamp(raw / 100, 0, 1);
  return clamp(raw, 0, 1);
}

function normalizePosition(position) {
  const raw = lower(position);
  if (!raw) return 'UNK';
  if (raw === 'gk' || raw.includes('goalkeeper') || raw.includes('keeper')) return 'GK';
  if (raw.includes('center back') || raw.includes('centre back') || raw === 'cb') return 'CB';
  if (raw.includes('full') || raw.includes('back') || raw === 'rb' || raw === 'lb' || raw === 'rwb' || raw === 'lwb' || raw === 'wb') return 'FB';
  if (raw.includes('defensive mid') || raw === 'dm' || raw === 'cdm') return 'DM';
  if (raw.includes('attacking mid') || raw === 'am' || raw === 'cam') return 'AM';
  if (raw.includes('mid') || raw === 'cm' || raw === 'rcm' || raw === 'lcm') return 'CM';
  if (raw.includes('wing') || raw === 'rw' || raw === 'lw' || raw === 'rm' || raw === 'lm') return 'W';
  if (raw.includes('forward') || raw.includes('striker') || raw === 'st' || raw === 'cf' || raw === 'ss') return 'ST';
  if (raw.startsWith('d')) return 'CB';
  if (raw.startsWith('m')) return 'CM';
  if (raw.startsWith('f')) return 'ST';
  return 'UNK';
}

function roleWeight(positionCode) {
  switch (positionCode) {
    case 'GK': return 1.0;
    case 'CB': return 0.82;
    case 'FB': return 0.62;
    case 'DM': return 0.72;
    case 'CM': return 0.58;
    case 'AM': return 0.74;
    case 'W': return 0.78;
    case 'ST': return 0.92;
    default: return 0.55;
  }
}

function attackShare(positionCode) {
  switch (positionCode) {
    case 'ST': return 1.0;
    case 'W': return 0.82;
    case 'AM': return 0.70;
    case 'CM': return 0.35;
    case 'FB': return 0.22;
    case 'DM': return 0.18;
    case 'CB': return 0.06;
    case 'GK': return 0.0;
    default: return 0.25;
  }
}

function defenseShare(positionCode) {
  switch (positionCode) {
    case 'GK': return 1.0;
    case 'CB': return 0.92;
    case 'FB': return 0.58;
    case 'DM': return 0.54;
    case 'CM': return 0.26;
    case 'AM': return 0.12;
    case 'W': return 0.10;
    case 'ST': return 0.05;
    default: return 0.22;
  }
}

function creatorShare(positionCode) {
  switch (positionCode) {
    case 'AM': return 0.84;
    case 'W': return 0.70;
    case 'CM': return 0.54;
    case 'FB': return 0.22;
    case 'ST': return 0.18;
    case 'DM': return 0.15;
    default: return 0.05;
  }
}

function statusWeight(player) {
  const text = `${lower(player?.status)} ${lower(player?.reason)} ${lower(player?.type)}`;
  if (text.includes('suspend')) return 1.0;
  if (text.includes('out') || text.includes('injur') || text.includes('unavailable')) return 0.88;
  if (text.includes('doubt') || text.includes('question') || text.includes('late test')) return 0.55;
  if (text.includes('rest') || text.includes('rotation')) return 0.72;
  return 0.78;
}

function importanceSignal(player) {
  const ai = normalizeConfidence(firstDefined(player?.ai_score, player?.player?.ai_score), null);
  const rating = clamp(safeNum(firstDefined(player?.rating, player?.player?.rating), 0) / 10, 0, 1);
  const stats = player?.stats || player?.player?.stats || null;
  const xg = clamp(safeNum(stats?.xg, 0) / 2.2, 0, 1);
  const assists = clamp(safeNum(stats?.assists, 0) / 1.5, 0, 1);
  const minutes = clamp(safeNum(stats?.minutes, 0) / 900, 0, 1);
  let flagBoost = 0;
  const text = `${lower(player?.reason)} ${lower(player?.status)} ${lower(player?.note)} ${lower(player?.role)}`;
  if (text.includes('captain')) flagBoost = Math.max(flagBoost, 0.9);
  if (text.includes('key') || text.includes('starter') || text.includes('first team')) flagBoost = Math.max(flagBoost, 0.82);
  return clamp(Math.max(ai ?? 0, rating, xg, assists * 0.9, minutes * 0.7, flagBoost, 0.35), 0, 1);
}

function summariseImpactTag(positionCode, impactScore) {
  if (positionCode === 'GK' && impactScore >= 0.7) return 'goalkeeper';
  if ((positionCode === 'ST' || positionCode === 'W' || positionCode === 'AM') && impactScore >= 0.65) return 'attack';
  if ((positionCode === 'CB' || positionCode === 'FB' || positionCode === 'DM') && impactScore >= 0.65) return 'defense';
  if ((positionCode === 'CM' || positionCode === 'AM' || positionCode === 'W') && impactScore >= 0.55) return 'creator';
  return 'squad';
}

function buildAbsenceReason(player) {
  const name = player.playerName || 'Player';
  const why = player.reason || player.status || 'unavailable';
  const tag = player.impactTag === 'goalkeeper'
    ? 'starting keeper'
    : player.impactTag === 'attack'
      ? 'attacking outlet'
      : player.impactTag === 'defense'
        ? 'defensive pillar'
        : player.impactTag === 'creator'
          ? 'chance creator'
          : 'squad loss';
  return `${name} (${tag}, ${why})`;
}

function normalizeUnavailablePlayer(player) {
  const positionCode = normalizePosition(firstDefined(
    player?.position,
    player?.pos,
    player?.specific_position,
    player?.player?.position,
    player?.player?.specific_position,
  ));

  const impactBase = roleWeight(positionCode);
  const importance = importanceSignal(player);
  const severity = statusWeight(player);
  const rawImpact = impactBase * (0.45 + (importance * 0.7)) * severity;
  const impactScore = clamp(rawImpact, 0, 1.2);
  const attackImpact = impactScore * attackShare(positionCode);
  const defenseImpact = impactScore * defenseShare(positionCode);
  const creatorImpact = impactScore * creatorShare(positionCode);
  const goalkeeperImpact = positionCode === 'GK' ? impactScore : 0;
  const impactTag = summariseImpactTag(positionCode, impactScore);

  return {
    ...player,
    playerName: player?.player?.name || player?.name || player?.short_name || 'Player',
    reason: player?.reason || player?.status || player?.type || 'Unavailable',
    positionCode,
    roleWeight: round(impactBase),
    importanceScore: round(importance),
    severityScore: round(severity),
    impactScore: round(impactScore),
    attackImpact: round(attackImpact),
    defenseImpact: round(defenseImpact),
    creatorImpact: round(creatorImpact),
    goalkeeperImpact: round(goalkeeperImpact),
    impactTag,
    isKeyAbsence: impactScore >= 0.68 || importance >= 0.8,
  };
}

function deriveLineupStatus(side, players) {
  const explicitConfirmed = firstBoolean(side?.confirmed, side?.is_confirmed, side?.confirmed_lineup, side?.lineup_confirmed);
  const explicitPredicted = firstBoolean(side?.predicted, side?.is_predicted, side?.ai_predicted);
  const explicitStatus = lower(firstDefined(side?.status, side?.lineup_status));

  if (explicitConfirmed === true || explicitStatus.includes('confirm')) return 'confirmed';
  if (explicitPredicted === true || explicitStatus.includes('predict') || explicitStatus.includes('project')) return 'predicted';
  if (players.length >= 10) return 'predicted';
  if (players.length >= 7) return 'partial';
  return 'unknown';
}

function deriveSideIntelligence(side, unavailablePlayers = []) {
  const players = asArray(side?.players || side?.starters || side?.lineup || side?.starting);
  const substitutes = asArray(side?.substitutes);
  const normalizedUnavailable = asArray(unavailablePlayers)
    .map(normalizeUnavailablePlayer)
    .sort((a, b) => safeNum(b.impactScore, 0) - safeNum(a.impactScore, 0));

  const status = deriveLineupStatus(side, players);
  const isConfirmed = status === 'confirmed';
  const explicitConfidence = normalizeConfidence(firstDefined(
    side?.confidence,
    side?.lineup_confidence,
    side?.prediction_confidence,
    side?.ai_confidence,
  ), null);
  const playerCompleteness = clamp(players.length / 11, 0, 1);
  const baseConfidence = explicitConfidence != null
    ? explicitConfidence
    : status === 'confirmed'
      ? 0.96
      : status === 'predicted'
        ? 0.68
        : status === 'partial'
          ? 0.45
          : 0.30;
  const certaintyScore = clamp((baseConfidence * 0.75) + (playerCompleteness * 0.25), 0, 1);

  const totalImpact = normalizedUnavailable.reduce((sum, player) => sum + safeNum(player.impactScore, 0), 0);
  const attackImpact = normalizedUnavailable.reduce((sum, player) => sum + safeNum(player.attackImpact, 0), 0);
  const defenseImpact = normalizedUnavailable.reduce((sum, player) => sum + safeNum(player.defenseImpact, 0), 0);
  const creatorImpact = normalizedUnavailable.reduce((sum, player) => sum + safeNum(player.creatorImpact, 0), 0);
  const goalkeeperImpact = normalizedUnavailable.reduce((sum, player) => sum + safeNum(player.goalkeeperImpact, 0), 0);
  const keyAbsences = normalizedUnavailable.filter((player) => player.isKeyAbsence).slice(0, 3);
  const weightedAbsenceScore = clamp(totalImpact / 2.8, 0, 1);
  const dependenceScore = totalImpact > 0
    ? clamp(safeNum(keyAbsences[0]?.impactScore, 0) / totalImpact, 0, 1)
    : 0;

  return {
    status,
    confirmed: isConfirmed,
    confidence: round(certaintyScore),
    formation: firstDefined(side?.formation, side?.predicted_formation, null),
    playerCount: players.length,
    substituteCount: substitutes.length,
    unavailableCount: normalizedUnavailable.length,
    weightedAbsenceScore: round(weightedAbsenceScore),
    attackAbsenceScore: round(clamp(attackImpact / 1.45, 0, 1)),
    defenseAbsenceScore: round(clamp(defenseImpact / 1.55, 0, 1)),
    creatorAbsenceScore: round(clamp(creatorImpact / 1.25, 0, 1)),
    goalkeeperAbsenceScore: round(clamp(goalkeeperImpact / 1.0, 0, 1)),
    dependenceScore: round(dependenceScore),
    keyAbsences,
    keyAbsenceReasons: keyAbsences.map(buildAbsenceReason),
  };
}

export function buildLineupIntelligence(rawLineups, fallbackUnavailablePlayers = null) {
  if (!rawLineups && !fallbackUnavailablePlayers) return null;

  const lineups = rawLineups?.lineups || rawLineups || {};
  const unavailablePlayers = rawLineups?.unavailable_players || fallbackUnavailablePlayers || {};

  const home = deriveSideIntelligence(lineups?.home || rawLineups?.home || {}, unavailablePlayers?.home || lineups?.home?.unavailable || []);
  const away = deriveSideIntelligence(lineups?.away || rawLineups?.away || {}, unavailablePlayers?.away || lineups?.away?.unavailable || []);

  const hasLineupData = home.playerCount > 0 || away.playerCount > 0;
  const certaintyScore = round((safeNum(home.confidence, 0.3) + safeNum(away.confidence, 0.3)) / 2);
  const bothConfirmed = home.confirmed === true && away.confirmed === true;
  const certaintyLabel = bothConfirmed
    ? 'confirmed'
    : certaintyScore >= 0.62
      ? 'predicted'
      : 'waiting';

  const note = !hasLineupData
    ? 'Waiting for lineups'
    : bothConfirmed
      ? 'Confirmed XIs available'
      : certaintyScore >= 0.65
        ? 'Predicted lineups available'
        : 'Lineups still uncertain';

  return {
    available: hasLineupData || home.unavailableCount > 0 || away.unavailableCount > 0,
    certaintyScore,
    certaintyLabel,
    bothConfirmed,
    note,
    home,
    away,
  };
}
