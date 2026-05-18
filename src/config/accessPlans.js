export const DAY_IN_MS = 24 * 60 * 60 * 1000;

export const PLAN_AMOUNT_NGN = 3000;
export const PLAN_DURATION_DAYS = 30;

export const WEEKLY_PLAN_AMOUNT_NGN = 1000;
export const WEEKLY_PLAN_DURATION_DAYS = 7;

export const TRIAL_DURATION_DAYS = 7;

export function getFutureIsoFromNow(days) {
  return new Date(Date.now() + days * DAY_IN_MS).toISOString();
}
