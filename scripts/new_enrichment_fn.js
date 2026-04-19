export async function fetchAndStoreEnrichment(fixture) {
  if (!fixture.home_team_id || !fixture.away_team_id || String(fixture.home_team_id).trim() === '' || String(fixture.away_team_id).trim() === '') {
    console.warn('[enrichmentService] Skipping ' + fixture.home_team_name + ' vs ' + fixture.away_team_name + ' - missing team IDs');
    return { h2h: [], homeForm: [], awayForm: [], standings: [], homeMomentum: null, awayMomentum: null, homeProfile: null, awayProfile: null, lineupModifier: null, completeness: { score: 0, tier: 'thin', checks: {} }, homeStats: null, awayStats: null, matchStats: null, matchEvents: null, actualHomeXg: null, actualAwayXg: null, shotmap: null, refereeData: null, injuries: null, odds: null };
  }
  console.log('[enrichmentService] Enriching ' + fixture.home_team_name + ' vs ' + fixture.away_team_name);
  let eventDetail = null, bsdH2H = [], bsdHomeFormStats = null, bsdAwayFormStats = null;
  let actualHomeXg = null, actualAwayXg = null, matchStats = null, matchEvents = null;
  let shotmap = null, refereeData = null, injuries = null;
  try {
    const eventId = fixture.id || fixture.match_id;
    eventDetail = await fetchEventDetail(eventId, false);
    if (eventDetail) {
      const h2hBlock = eventDetail.head_to_head;
      if (h2hBlock && h2hBlock.recent_matches && h2hBlock.recent_matches.length > 0) {
        bsdH2H = h2hBlock.recent_matches.map(m => ({ home: m.home || '', away: m.away || '', score: m.score || null, date: m.date || '', competition: '' })).filter(m => m.score);
      }
      bsdHomeFormStats = eventDetail.home_form || null;
      bsdAwayFormStats = eventDetail.away_form || null;
      actualHomeXg = eventDetail.actual_home_xg != null ? eventDetail.actual_home_xg : (eventDetail.home_xg_live != null ? eventDetail.home_xg_live : null);
      actualAwayXg = eventDetail.actual_away_xg != null ? eventDetail.actual_away_xg : (eventDetail.away_xg_live != null ? eventDetail.away_xg_live : null);
      if (eventDetail.referee) { refereeData = { name: eventDetail.referee.name, yellowCards: eventDetail.referee.yellowCards, redCards: eventDetail.referee.redCards }; }
      const unavail = eventDetail.unavailable_players;
      if (unavail && ((unavail.home && unavail.home.length) || (unavail.away && unavail.away.length))) {
        injuries = { home: unavail.home || [], away: unavail.away || [], homeMissingCount: (unavail.home || []).length, awayMissingCount: (unavail.away || []).length };
      }
    }
  } catch (err) { console.warn('[enrichmentService] Event detail fetch failed:', err.message); }
  const homeFormRaw = await fetchTeamRecentEvents(fixture.home_team_id);
  const awayFormRaw = await fetchTeamRecentEvents(fixture.away_team_id);
  const localHome   = await fetchLocalTeamForm(fixture.home_team_name);
  const localAway   = await fetchLocalTeamForm(fixture.away_team_name);
  const localH2h    = await fetchLocalH2H(fixture.home_team_name, fixture.away_team_name);
  const homeFormMerged = mergeForm(homeFormRaw, localHome);
  const awayFormMerged = mergeForm(awayFormRaw, localAway);
  const h2hMerged = bsdH2H.length > 0 ? mergeForm(bsdH2H, localH2h) : mergeForm([], localH2h);
  await sleep(300);
  const standingsRaw = await fetchStandings(fixture.tournament_id).catch(() => []);
  const standings = (standingsRaw || []).map(normaliseStandingsRow);
  const homeFormFallback = homeFormMerged.length < 3 ? extractFormFromStandings(standings, fixture.home_team_id, fixture.home_team_name) : [];
  const awayFormFallback = awayFormMerged.length < 3 ? extractFormFromStandings(standings, fixture.away_team_id, fixture.away_team_name) : [];
  const homeFormFinal = filterRelevantForm(homeFormMerged.length >= homeFormFallback.length ? homeFormMerged : homeFormFallback, fixture.home_team_name, 50);
  const awayFormFinal = filterRelevantForm(awayFormMerged.length >= awayFormFallback.length ? awayFormMerged : awayFormFallback, fixture.away_team_name, 50);
  const homeProfile = buildTeamProfile(fixture.home_team_name, homeFormFinal, []);
  const awayProfile = buildTeamProfile(fixture.away_team_name, awayFormFinal, []);
  if (bsdHomeFormStats) { const n = bsdHomeFormStats.matches_played || 0; if (n > 0) { if (bsdHomeFormStats.goals_scored_last_n != null) homeProfile.avgGoalsScored = +(bsdHomeFormStats.goals_scored_last_n / n).toFixed(2); if (bsdHomeFormStats.goals_conceded_last_n != null) homeProfile.avgGoalsConceded = +(bsdHomeFormStats.goals_conceded_last_n / n).toFixed(2); if (bsdHomeFormStats.avg_xg != null) homeProfile.avgXg = +bsdHomeFormStats.avg_xg.toFixed(3); if (bsdHomeFormStats.avg_xg_conceded != null) homeProfile.avgXgConceded = +bsdHomeFormStats.avg_xg_conceded.toFixed(3); if (bsdHomeFormStats.avg_shots != null) homeProfile.avgShots = +bsdHomeFormStats.avg_shots.toFixed(1); if (bsdHomeFormStats.avg_shots_on_target != null) homeProfile.avgShotsOnTarget = +bsdHomeFormStats.avg_shots_on_target.toFixed(1); homeProfile.formString = bsdHomeFormStats.form_string || homeProfile.formString; homeProfile.matchesAnalyzed = Math.max(homeProfile.matchesAnalyzed || 0, n); homeProfile.bsdEnriched = true; } }
  if (bsdAwayFormStats) { const n = bsdAwayFormStats.matches_played || 0; if (n > 0) { if (bsdAwayFormStats.goals_scored_last_n != null) awayProfile.avgGoalsScored = +(bsdAwayFormStats.goals_scored_last_n / n).toFixed(2); if (bsdAwayFormStats.goals_conceded_last_n != null) awayProfile.avgGoalsConceded = +(bsdAwayFormStats.goals_conceded_last_n / n).toFixed(2); if (bsdAwayFormStats.avg_xg != null) awayProfile.avgXg = +bsdAwayFormStats.avg_xg.toFixed(3); if (bsdAwayFormStats.avg_xg_conceded != null) awayProfile.avgXgConceded = +bsdAwayFormStats.avg_xg_conceded.toFixed(3); if (bsdAwayFormStats.avg_shots != null) awayProfile.avgShots = +bsdAwayFormStats.avg_shots.toFixed(1); if (bsdAwayFormStats.avg_shots_on_target != null) awayProfile.avgShotsOnTarget = +bsdAwayFormStats.avg_shots_on_target.toFixed(1); awayProfile.formString = bsdAwayFormStats.form_string || awayProfile.formString; awayProfile.matchesAnalyzed = Math.max(awayProfile.matchesAnalyzed || 0, n); awayProfile.bsdEnriched = true; } }
  const homeMomentum = computeMomentum(homeFormFinal, fixture.home_team_name);
  const awayMomentum = computeMomentum(awayFormFinal, fixture.away_team_name);
  let lineupModifier = null;
  try { const rawLineup = await fetchPredictedLineup(fixture.id); lineupModifier = parseLineupModifier(normaliseBsdLineup(rawLineup)); } catch (_) {}
  const completeness = computeDataCompleteness({ homeForm: homeFormFinal, awayForm: awayFormFinal, h2h: h2hMerged, standings, matchEvents, lineupModifier });
  if (bsdHomeFormStats && bsdAwayFormStats && completeness.score < 0.80) { completeness.score = Math.min(0.80, completeness.score + 0.15); completeness.tier = completeness.score >= 0.75 ? 'rich' : completeness.score >= 0.50 ? 'good' : 'partial'; completeness.checks.hasBsdFormStats = true; }
  const tierLabel = { rich: 'DEEP', good: 'BASIC', partial: 'LIMITED', thin: 'NO_DATA' }[completeness.tier] || '?';
  console.log('[enrichmentService] ' + fixture.home_team_name + ' vs ' + fixture.away_team_name + ' -> ' + tierLabel + ' (' + completeness.score + ') | home_form=' + homeFormFinal.length + ' away_form=' + awayFormFinal.length + ' h2h=' + h2hMerged.length + ' bsdStats=' + (bsdHomeFormStats ? 'YES' : 'no') + ' injuries=' + (injuries ? ('H:' + injuries.homeMissingCount + ' A:' + injuries.awayMissingCount) : 'none'));
  return { h2h: cloneForm(h2hMerged), homeForm: cloneForm(homeFormFinal), awayForm: cloneForm(awayFormFinal), standings, homeMomentum, awayMomentum, lineupModifier, completeness, homeStats: homeProfile, awayStats: awayProfile, homeProfile, awayProfile, matchStats, matchEvents, actualHomeXg, actualAwayXg, shotmap, bsdHomeFormStats, bsdAwayFormStats, refereeData, injuries, odds: null };
}