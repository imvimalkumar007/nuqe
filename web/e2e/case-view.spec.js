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

// Navigate to the NQ-2026-0001 case by clicking the dashboard row — avoids
// full-page-reload auth issues that arise from page.goto('/cases/:id') directly.
async function gotoCase(page) {
  await login(page);
  await expect(page.locator('table tbody tr')).toHaveCount(8, { timeout: 15_000 });
  await page.locator('table tbody tr').filter({ hasText: 'NQ-2026-0001' }).click();
  await expect(page.getByText('Sarah Okonkwo')).toBeVisible({ timeout: 15_000 });
}

// ─── FE-CASE-001 ───────────────────────────────────────────────────────────────

test('FE-CASE-001: clicking case row navigates to /cases/:id', async ({ page }) => {
  await login(page);
  await expect(page.locator('table tbody tr')).toHaveCount(8, { timeout: 15_000 });
  await page.locator('table tbody tr').filter({ hasText: 'NQ-2026-0001' }).click();
  await expect(page).toHaveURL(/\/cases\/[0-9a-f-]+/, { timeout: 15_000 });
});

// ─── FE-CASE-002 ───────────────────────────────────────────────────────────────

test('FE-CASE-002: case header shows case_ref and customer name', async ({ page }) => {
  await gotoCase(page);
  // exact: true avoids matching NQ-2026-0001 inside comm subject/body text
  await expect(page.getByText('NQ-2026-0001', { exact: true })).toBeVisible();
  await expect(page.getByText('Sarah Okonkwo', { exact: true })).toBeVisible();
});

// ─── FE-CASE-003 ───────────────────────────────────────────────────────────────

test('FE-CASE-003: DISP deadline panel shows three milestones', async ({ page }) => {
  await gotoCase(page);
  await expect(page.getByText('ACKNOWLEDGE')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('FINAL_RESPONSE')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('FOS_REFERRAL')).toBeVisible({ timeout: 10_000 });
});

// ─── FE-CASE-004 ───────────────────────────────────────────────────────────────

test('FE-CASE-004: communication timeline shows 5 seeded communications', async ({ page }) => {
  await gotoCase(page);
  await expect(
    page.getByText('Communication timeline — 5 entries'),
  ).toBeVisible({ timeout: 15_000 });
});

// ─── FE-CASE-005 ───────────────────────────────────────────────────────────────

test('FE-CASE-005: pending AI draft renders with Pending review badge', async ({ page }) => {
  await gotoCase(page);
  await expect(page.getByText('Pending review')).toBeVisible({ timeout: 15_000 });
  // All three action buttons must be visible
  await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit & Approve' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reject' })).toBeVisible();
});

// ─── FE-CASE-006 ───────────────────────────────────────────────────────────────

test('FE-CASE-006: Approve button calls PATCH /ai-actions/:id/approve', async ({ page }) => {
  // Intercept to avoid consuming DB state
  await page.route('**/ai-actions/*/approve', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'approved' }) }),
  );

  await gotoCase(page);
  await expect(page.getByText('Pending review')).toBeVisible({ timeout: 15_000 });

  const approveReq = page.waitForRequest((req) =>
    req.url().includes('/ai-actions/') && req.url().endsWith('/approve') && req.method() === 'PATCH',
  );
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await approveReq;
});

// ─── FE-CASE-007 ───────────────────────────────────────────────────────────────

test('FE-CASE-007: Edit & Approve pre-fills compose textarea with draft body', async ({ page }) => {
  // Intercept so the draft action is not consumed
  await page.route('**/ai-actions/*/approve', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'approved' }) }),
  );

  await gotoCase(page);
  await expect(page.getByText('Pending review')).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: 'Edit & Approve' }).click();

  // Compose textarea should be filled with the draft body
  const textarea = page.locator('textarea').first();
  await expect(textarea).not.toBeEmpty({ timeout: 5_000 });
});

// ─── FE-CASE-008 ───────────────────────────────────────────────────────────────

test('FE-CASE-008: Reject button calls PATCH /ai-actions/:id/reject', async ({ page }) => {
  // Intercept to avoid consuming DB state
  await page.route('**/ai-actions/*/reject', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'rejected' }) }),
  );

  await gotoCase(page);
  await expect(page.getByText('Pending review')).toBeVisible({ timeout: 15_000 });

  const rejectReq = page.waitForRequest((req) =>
    req.url().includes('/ai-actions/') && req.url().endsWith('/reject') && req.method() === 'PATCH',
  );
  await page.getByRole('button', { name: 'Reject' }).click();
  await rejectReq;
});
