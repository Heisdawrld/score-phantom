import { test, expect, Page } from '@playwright/test';

const email = process.env.E2E_LOGIN_EMAIL;
const password = process.env.E2E_LOGIN_PASSWORD;

if (!email || !password) {
  throw new Error('Missing E2E_LOGIN_EMAIL or E2E_LOGIN_PASSWORD');
}

function byButtonOrLink(page: Page, name: RegExp) {
  return page.getByRole('button', { name }).or(page.getByRole('link', { name }));
}

function initialsFromEmail(value: string): string {
  const local = value.split('@')[0] || value;
  const letters = local.replace(/[^a-zA-Z]/g, '');
  const base = (letters || local).slice(0, 2);
  return base.toUpperCase();
}

async function openMatchIfAvailable(page: Page) {
  const matchButtons = page.getByRole('button', { name: /vs/i });
  const count = await matchButtons.count();
  if (count > 0) {
    await matchButtons.first().click();
    await expect(page.getByText(/ScorePhantom Analysis/i)).toBeVisible({ timeout: 15000 });
    await page.keyboard.press('Escape').catch(() => {});
    await page.mouse.click(10, 10);
  } else {
    await expect(page.getByText(/No fixtures for/i)).toBeVisible();
  }
}

async function openTopPicks(page: Page) {
  await byButtonOrLink(page, /Top Picks/i).click();
  if (page.url().includes('/paywall')) {
    await expect(page.getByText(/Unlock the Algorithm|Pay with Flutterwave|Upgrade/i)).toBeVisible();
  } else {
    await expect(page.getByRole('heading', { name: /Best Tips Today/i })).toBeVisible();
  }
}

test('scorephantom full journey', async ({ page }) => {
  await page.goto('/home');
  const startTrial = byButtonOrLink(page, /Start Free Trial/i);
  await expect(startTrial).toBeVisible();
  await startTrial.click();
  await expect(page).toHaveURL(/\/login/i);

  const emailLogin = byButtonOrLink(page, /Sign in with Email/i);
  if (await emailLogin.isVisible().catch(() => false)) {
    await emailLogin.click();
  }

  const emailInput = page.locator('input[type="email"]');
  await expect(emailInput).toBeVisible();
  await emailInput.fill(email);
  const passwordInput = page.locator('input[type="password"]');
  await expect(passwordInput).toBeVisible();
  await passwordInput.fill(password);

  await byButtonOrLink(page, /^Sign in$/i).click();

  await expect(page.getByPlaceholder('Search teams or leagues...')).toBeVisible({ timeout: 20000 });
  await expect(page).toHaveURL(/\/dashboard/i);

  await openMatchIfAvailable(page);

  await byButtonOrLink(page, /Record/i).click();
  await expect(page.getByRole('heading', { name: /Track Record/i })).toBeVisible();

  await byButtonOrLink(page, /Results/i).click();
  await expect(page.getByRole('heading', { name: /Prediction Results/i })).toBeVisible();

  await openTopPicks(page);

  await byButtonOrLink(page, /ACCA/i).click();
  await expect(page.getByText(/ACCA Calculator/i)).toBeVisible();

  await page.goto('/league-favorites');
  if (page.url().includes('/league-favorites')) {
    await expect(page.getByRole('heading', { name: /League Favorites/i })).toBeVisible();
  } else {
    await expect(page.getByPlaceholder('Search teams or leagues...')).toBeVisible();
  }

  const initials = initialsFromEmail(email);
  const accountButton = page.getByRole('button', { name: new RegExp(initials, 'i') });
  await accountButton.click({ timeout: 10000 });
  await byButtonOrLink(page, /Sign Out/i).click();
  await expect(page).toHaveURL(/\/login/i);
});


