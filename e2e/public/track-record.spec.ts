import { test, expect } from '@playwright/test';

test('a visitor can inspect the record and isolate an unpriced engine cohort', async ({ page }) => {
  await page.goto('/home');
  await expect(page.getByText('Example analysis', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'View track record' }).click();
  await expect(page).toHaveURL(/\/track-record$/);
  await expect(page.getByRole('heading', { name: 'Track Record', exact: true })).toBeVisible();
  await expect(page.getByText('2 picks in ROI sample', { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Engine version' }).selectOption('4.0.0');
  await expect(page.getByText('No eligible priced results')).toBeVisible();
  await expect(page.getByText('0 picks in ROI sample', { exact: true })).toBeVisible();
  await expect(page.getByText('Unavailable', { exact: true })).toBeVisible();
  await expect(page).not.toHaveURL(/login/);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  const clippedCards = await page.locator('.interactive-card').evaluateAll(cards => cards.some(card => card.scrollWidth > card.clientWidth));
  expect(clippedCards).toBe(false);
});

test('direct public routes do not require a session', async ({ page }) => {
  for (const path of ['/track-record', '/basketball/track-record']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'Track Record', exact: true })).toBeVisible();
    await expect(page).not.toHaveURL(/login/);
  }
});

test('an API outage is shown as an error rather than an empty successful record', async ({ page }) => {
  await page.route('**/api/track-record/**', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Unavailable"}' }));
  await page.goto('/track-record');
  await expect(page.getByRole('alert')).toContainText('Some results could not be loaded', { timeout: 20000 });
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
  await expect(page.getByText('Building Track Record', { exact: true })).not.toBeVisible();
});
