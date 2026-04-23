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

async function gotoAnalytics(page) {
  await login(page);
  await expect(page.locator('table tbody tr')).toHaveCount(8, { timeout: 15_000 });
  await page.getByRole('link', { name: 'Performance' }).click();
  await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible({ timeout: 10_000 });
}

// ─── FE-ANA-001 ───────────────────────────────────────────────────────────────

test('FE-ANA-001: analytics screen loads without console errors', async ({ page }) => {
  const errors = [];
  await login(page);
  // Attach error listeners after login so pre-login 401s are not captured
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push(err.message));

  await expect(page.locator('table tbody tr')).toHaveCount(8, { timeout: 15_000 });
  await page.getByRole('link', { name: 'Performance' }).click();
  await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible({ timeout: 10_000 });
  // Wait for data to finish loading before asserting errors
  await expect(page.getByText('Approval Rate')).toBeVisible({ timeout: 15_000 });
  expect(errors).toHaveLength(0);
});

// ─── FE-ANA-002 ───────────────────────────────────────────────────────────────

test('FE-ANA-002: AI Accuracy tab visible and active by default', async ({ page }) => {
  await gotoAnalytics(page);
  await expect(page.getByRole('button', { name: 'AI Accuracy' })).toBeVisible({ timeout: 10_000 });
  // AccuracyTab is rendered (confirming the tab is active)
  await expect(page.getByText('Approval Rate')).toBeVisible({ timeout: 15_000 });
});

// ─── FE-ANA-003 ───────────────────────────────────────────────────────────────

test('FE-ANA-003: approval rate shown as a percentage', async ({ page }) => {
  await gotoAnalytics(page);
  // MetricCard renders: label "Approval Rate" + value + "%" suffix span
  await expect(page.getByText('Approval Rate')).toBeVisible({ timeout: 15_000 });
  // The % suffix must appear somewhere on the page (MetricCard default suffix)
  await expect(page.locator('span').filter({ hasText: /^\%$/ }).first()).toBeVisible({ timeout: 10_000 });
});

// ─── FE-ANA-004 ───────────────────────────────────────────────────────────────

test('FE-ANA-004: empty state shown when AI accuracy API returns no data', async ({ page }) => {
  // Return JSON null so normalizeAccuracy returns null → empty state renders
  await page.route('**/metrics/ai-accuracy**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }),
  );
  await gotoAnalytics(page);
  await expect(page.getByText('No accuracy data for this period.')).toBeVisible({ timeout: 10_000 });
});

// ─── FE-ANA-005 ───────────────────────────────────────────────────────────────

test('FE-ANA-005: date range selector triggers re-fetch', async ({ page }) => {
  await gotoAnalytics(page);
  // Wait for the initial load to complete
  await expect(page.getByText('Approval Rate')).toBeVisible({ timeout: 15_000 });

  // Listen for the next ai-accuracy request BEFORE clicking
  const refetchReq = page.waitForRequest(
    (req) => req.url().includes('/metrics/ai-accuracy') && req.method() === 'GET',
    { timeout: 10_000 },
  );
  await page.getByRole('button', { name: 'Last 7 days' }).click();
  await refetchReq;
});

// ─── FE-ANA-006 ───────────────────────────────────────────────────────────────

test('FE-ANA-006: Model Comparison tab hidden when no challenger configured', async ({ page }) => {
  await gotoAnalytics(page);
  // Wait for model-comparison fetch to settle (ai-accuracy loading complete)
  await expect(page.getByText('Approval Rate')).toBeVisible({ timeout: 15_000 });

  // No challenger in seed data → tab button must not exist
  await expect(page.getByRole('button', { name: 'Model Comparison' })).toHaveCount(0);
  // Info nudge visible to user
  await expect(page.getByText(/Configure a challenger model in/)).toBeVisible({ timeout: 5_000 });
});
