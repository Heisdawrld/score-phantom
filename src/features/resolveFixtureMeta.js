export function resolveFixtureMeta(metaOverride, dbMeta) {
  return metaOverride || dbMeta || {};
}
