/**
 * enrichOne.js
 *
 * Entry point for single-fixture enrichment.
 * Delegates to enrichmentService for the full data pipeline,
 * then stores results using storeEnrichment.
 */

import db from '../config/database.js';
import { fetchAndStoreEnrichment } from './enrichmentService.js';
import { buildStoredFixtureMeta } from './fixtureMeta.js';

function parseScore(scoreStr) {
  if (!scoreStr || !scoreStr.includes('-')) return { home: null, away: null };
  const parts = scoreStr.split('-');
  const home = parseInt(parts[0], 10);
  const away = parseInt(parts[1], 10);
  // BUG FIX: Return null instead of NaN when parsing fails.
  // NaN propagates into DB integer columns and corrupts data,
  // and causes all numeric comparisons with NaN to return false.
  if (isNaN(home) || isNaN(away)) return { home: isNaN(home) ? null : home, away: isNaN(away) ? null : away };
  return { home, away };
}

let historicalMetaColumnReady = false;

async function ensureHistoricalMetaColumn() {
  if (historicalMetaColumnReady) return;

  try {
    const info = await db.execute("PRAGMA table_info('historical_matches')");
    const hasMeta = (info.rows || []).some((col) => String(col.name) === 'meta');
    if (!hasMeta) {
      await db.execute('ALTER TABLE historical_matches ADD COLUMN meta TEXT');
      console.log('[enrichOne] Added historical_matches.meta column');
    }
    historicalMetaColumnReady = true;
  } catch (err) {
    const msg = String(err?.message || err?.cause?.message || '').toLowerCase();
    if (msg.includes('duplicate column') && msg.includes('meta')) {
      historicalMetaColumnReady = true;
      return;
    }
    console.warn('[enrichOne] Could not verify historical_matches.meta column:', err.message);
  }
}

function normalizeMatch(match) {
  return {
    home: match?.home || null,
    away: match?.away || null,
    score: match?.score || null,
    date: match?.date || null,
    competition: match?.competition || null,
    home_xg: match?.home_xg || null,
    away_xg: match?.away_xg || null,
    meta: match?.meta || {
      bsd_id: match?._bsdId ?? null,
      bsd_api_id: match?._bsdApiId ?? null,
      home_api_id: match?._homeApiId ?? null,
      away_api_id: match?._awayApiId ?? null,
      stats: match?.stats ?? match?.matchStats ?? null,
      incidents: match?.incidents ?? match?.events ?? null,
      cards: match?.cards ?? null,
      possession: match?.possession ?? null,
      shots: match?.shots ?? null,
      shots_on_target: match?.shots_on_target ?? null,
      raw_status: match?.status ?? null,
    },
  };
}

/**
 * Store enrichment data for a fixture into historical_matches, fixture_odds,
 * and the fixtures.meta JSON field.
 */
export async function storeEnrichment(fixtureId, data, markEnriched = true) {
  await ensureHistoricalMetaColumn();

  // Collect all INSERT statements for batch execution
  const insertStatements = [];

  const sections = [
    { key: 'h2h', type: 'h2h' },
    { key: 'homeForm', type: 'home_form' },
    { key: 'awayForm', type: 'away_form' },
  ];

  for (const section of sections) {
    const matches = Array.isArray(data?.[section.key]) ? data[section.key] : [];

    for (const match of matches) {
      if (match._synthetic) continue;

      const normalized = normalizeMatch(match);
      const { home, away } = parseScore(normalized.score);

      insertStatements.push({
        sql: `
          INSERT INTO historical_matches (
            fixture_id, type, date,
            home_team, away_team,
            home_goals, away_goals,
            home_xg, away_xg, meta
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          fixtureId,
          section.type,
          normalized.date,
          normalized.home,
          normalized.away,
          home,
          away,
          normalized.home_xg,
          normalized.away_xg,
          JSON.stringify(normalized.meta || {})
        ],
      });
    }
  }

  // Execute DELETE + all INSERTs atomically using db.batch()
  const batchStatements = [
    { sql: `DELETE FROM historical_matches WHERE fixture_id = ?`, args: [fixtureId] },
    ...insertStatements,
  ];
  await db.batch(batchStatements);

  if (data?.odds) {
    await db.execute({
      sql: `
        INSERT INTO fixture_odds (
          fixture_id,
          home, draw, away,
          btts_yes, btts_no, over_under
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (fixture_id) DO UPDATE SET
          home = EXCLUDED.home, draw = EXCLUDED.draw, away = EXCLUDED.away,
          btts_yes = EXCLUDED.btts_yes, btts_no = EXCLUDED.btts_no,
          over_under = EXCLUDED.over_under
      `,
      args: [
        fixtureId,
        data.odds.home ?? null,
        data.odds.draw ?? null,
        data.odds.away ?? null,
        data.odds.btts_yes ?? null,
        data.odds.btts_no ?? null,
        data.odds.over_under ?? null,
      ],
    });
  }

  const refreshedAt = new Date().toISOString();
  const meta = buildStoredFixtureMeta(data, refreshedAt);

  const completenessTier = data?.completeness?.tier ?? 'thin';
  const tierMap = {
    rich:    { enrichment_status: 'deep',     data_quality: 'excellent' },
    good:    { enrichment_status: 'basic',    data_quality: 'good' },
    partial: { enrichment_status: 'limited',  data_quality: 'moderate' },
    thin:    { enrichment_status: 'no_data',  data_quality: 'poor' },
  };
  const { enrichment_status, data_quality } = tierMap[completenessTier] ?? tierMap.thin;

  await db.execute({
    sql: `UPDATE fixtures
          SET enriched = ?, meta = ?, enrichment_status = ?, data_quality = ?, enriched_at = ?
          WHERE id = ?`,
    args: [markEnriched ? 1 : 0, JSON.stringify(meta), enrichment_status, data_quality, refreshedAt, fixtureId],
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
      `(${fixture.home_team_name} vs ${fixture.away_team_name}) — marking as no_data to clear queue`
    );
  }

  await storeEnrichment(fixture.id, data, true);
  return data;
}
