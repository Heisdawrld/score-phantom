/**
 * enrichOne.js
 *
 * Entry point for single-fixture enrichment.
 * Delegates to enrichmentService for the full data pipeline,
 * then stores results using storeEnrichment.
 */

import db from '../config/database.js';
import { fetchAndStoreEnrichment } from './enrichmentService.js';

function parseScore(scoreStr) {
  if (!scoreStr || !scoreStr.includes('-')) return { home: null, away: null };
  const parts = scoreStr.split('-');
  const home = parseInt(parts[0], 10);
  const away = parseInt(parts[1], 10);
  if (isNaN(home) || isNaN(away)) return { home: null, away: null };
  return { home, away };
}

function normalizeMatch(match) {
  return {
    home: match?.home || null,
    away: match?.away || null,
    score: match?.score || null,
    date: match?.date || null,
    competition: match?.competition || null,
  };
}

/**
 * Store enrichment data for a fixture into historical_matches, fixture_odds,
 * and the fixtures.meta JSON field.
 */
export async function storeEnrichment(fixtureId, data, markEnriched = true) {
  // Clear and re-insert historical match rows
  await db.execute({
    sql: `DELETE FROM historical_matches WHERE fixture_id = ?`,
    args: [fixtureId],
  });

  const sections = [
    { key: 'h2h', type: 'h2h' },
    { key: 'homeForm', type: 'home_form' },
    { key: 'awayForm', type: 'away_form' },
  ];

  for (const section of sections) {
    const matches = Array.isArray(data?.[section.key]) ? data[section.key] : [];

    for (const match of matches) {
      const normalized = normalizeMatch(match);
      const { home, away } = parseScore(normalized.score);

      await db.execute({
        sql: `
          INSERT INTO historical_matches (
            fixture_id, type, date,
            home_team, away_team,
            home_goals, away_goals
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          fixtureId,
          section.type,
          normalized.date,
          normalized.home,
          normalized.away,
          home,
          away,
        ],
      });
    }
  }

  // Store odds if present
  if (data?.odds) {
    await db.execute({
      sql: `
        INSERT OR REPLACE INTO fixture_odds (
          fixture_id, home, draw, away, btts_yes, btts_no, over_under
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        fixtureId,
        data.odds.home ?? null,
        data.odds.draw ?? null,
        data.odds.away ?? null,
        data.odds.btts_yes ?? null,
        data.odds.btts_no ?? null,
        data.odds.over_under ? JSON.stringify(data.odds.over_under) : null,
      ],
    });
  }

  // Store everything in fixtures.meta — including team profiles
  const meta = {
    standings: Array.isArray(data?.standings) ? data.standings : [],
    homeStats: data?.homeStats ?? null,
    awayStats: data?.awayStats ?? null,
    homeProfile: data?.homeProfile ?? null,
    awayProfile: data?.awayProfile ?? null,
    lineupModifier: data?.lineupModifier ?? null,
    completeness: data?.completeness ?? null,
    homeMomentum: data?.homeMomentum ?? null,
    awayMomentum: data?.awayMomentum ?? null,
    // Keep form arrays in meta for backward compatibility
    h2h: Array.isArray(data?.h2h) ? data.h2h : [],
    homeForm: Array.isArray(data?.homeForm) ? data.homeForm : [],
    awayForm: Array.isArray(data?.awayForm) ? data.awayForm : [],
  };

  await db.execute({
    sql: `UPDATE fixtures SET enriched = ?, meta = ? WHERE id = ?`,
    args: [markEnriched ? 1 : 0, JSON.stringify(meta), fixtureId],
  });
}

/**
 * Enrich a single fixture using the full enrichmentService pipeline.
 *
 * @param {object} fixture - fixture row from DB
 * @returns {object} enrichment data bundle
 */
export async function enrichFixture(fixture) {
  const data = await fetchAndStoreEnrichment(fixture);

  if (!data) {
    throw new Error('No data returned from enrichmentService');
  }

  const hasUsableData = (data.homeForm?.length > 0) || (data.awayForm?.length > 0);

  if (!hasUsableData) {
    console.warn(
      `[enrichOne] No usable form data for fixture ${fixture.id} ` +
      `(${fixture.home_team_name} vs ${fixture.away_team_name}) — will retry on next request`
    );
  }

  await storeEnrichment(fixture.id, data, hasUsableData);
  return data;
}
