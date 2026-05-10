export function isoDate(offsetDays = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export function oddsApiDateTime(offsetDays = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  d.setUTCMilliseconds(0);
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function apiSportsFreeWindowDates(daysAhead = 2) {
  const safeAhead = Math.min(Math.max(Number(daysAhead || 2), 1), 2);
  return Array.from({ length: safeAhead }, (_, i) => isoDate(i));
}
