import { test, expect } from '@playwright/test';

const EMAIL    = 'admin@nuqe.io';
const PASSWORD = 'NuqeAdmin2026!';

async function login(page) {
  await page.goto('/login');
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/complaints', { timeout: 15_000 });
}

// ─── FE-DASH-001 ───────────────────────────────────────────────────────────────

test('FE-DASH-001: dashboard loads without console errors', async ({ page }) => {
  await login(page);

  // Start listening for errors only after login — pre-login 401 on /auth/refresh
  // is expected behaviour (no cookie on first visit).
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.waitForSelector('table tbody tr', { timeout: 15_000 });
  expect(errors).toHaveLength(0);
});

// ─── FE-DASH-002 ───────────────────────────────────────────────────────────────

test('FE-DASH-002: all 8 seed cases visible in table', async ({ page }) => {
  await login(page);
  // Wait until the loading skeleton is replaced by real rows (skeleton has 6 rows)
  await expect(page.locator('table tbody tr')).toHaveCount(8, { timeout: 15_000 });
});

// ─── FE-DASH-003 ───────────────────────────────────────────────────────────────

test('FE-DASH-003: breach risk metric card shows count 2', async ({ page }) => {
  await login(page);
  await page.waitForSelector('table tbody tr', { timeout: 15_000 });

  const card = page.locator('p:text("Breach risk") ~ p').first();
  await expect(card).toHaveText('2', { timeout: 10_000 });
});

// ─── FE-DASH-004 ───────────────────────────────────────────────────────────────

test('FE-DASH-004: under review metric card shows count 3', async ({ page }) => {
  await login(page);
  await page.waitForSelector('table tbody tr', { timeout: 15_000 });

  const card = page.locator('p:text("Under review") ~ p').first();
  await expect(card).toHaveText('3', { timeout: 10_000 });
});

// ─── FE-DASH-005 ───────────────────────────────────────────────────────────────

test('FE-DASH-005: open metric card shows count 3', async ({ page }) => {
  await login(page);
  await page.waitForSelector('table tbody tr', { timeout: 15_000 });

  const card = page.locator('p:text("Open") ~ p').first();
  await expect(card).toHaveText('3', { timeout: 10_000 });
});

// ─── FE-DASH-006 ───────────────────────────────────────────────────────────────

test('FE-DASH-006: fos referred metric card shows count 1', async ({ page }) => {
  await login(page);
  await page.waitForSelector('table tbody tr', { timeout: 15_000 });

  const card = page.locator('p:text("FOS referred") ~ p').first();
  await expect(card).toHaveText('1', { timeout: 10_000 });
});

// ─── FE-DASH-007 ───────────────────────────────────────────────────────────────

test('FE-DASH-007: knowledge section with 3 items visible in sidebar', async ({ page }) => {
  await login(page);

  await expect(page.getByText('Knowledge', { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('link', { name: 'Regulatory' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Product' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Gaps' })).toBeVisible();
});

// ─── FE-DASH-008 ───────────────────────────────────────────────────────────────

test('FE-DASH-008: settings section with 2 items visible in sidebar', async ({ page }) => {
  await login(page);

  await expect(page.getByText('Settings', { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('link', { name: 'AI Configuration' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Tokeniser' })).toBeVisible();
});
