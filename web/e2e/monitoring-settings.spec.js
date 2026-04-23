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

async function gotoMonitoring(page) {
  await login(page);
  await expect(page.locator('table tbody tr')).toHaveCount(8, { timeout: 15_000 });
  await page.getByRole('link', { name: 'Reg monitoring' }).click();
  await expect(page.getByRole('heading', { name: 'Regulatory Monitoring' })).toBeVisible({ timeout: 10_000 });
}

async function gotoSettings(page) {
  await login(page);
  await expect(page.locator('table tbody tr')).toHaveCount(8, { timeout: 15_000 });
  await page.getByRole('link', { name: 'AI Configuration' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 10_000 });
}

// ─── FE-MON-001 ───────────────────────────────────────────────────────────────

test('FE-MON-001: Regulatory Monitoring screen loads without errors', async ({ page }) => {
  const errors = [];
  await login(page);
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push(err.message));

  await expect(page.locator('table tbody tr')).toHaveCount(8, { timeout: 15_000 });
  await page.getByRole('link', { name: 'Reg monitoring' }).click();
  await expect(page.getByRole('heading', { name: 'Regulatory Monitoring' })).toBeVisible({ timeout: 10_000 });
  // Wait for loading to complete — "Monitored Sources" panel header appears after fetch
  await expect(page.getByText('Monitored Sources')).toBeVisible({ timeout: 15_000 });
  expect(errors).toHaveLength(0);
});

// ─── FE-MON-002 ───────────────────────────────────────────────────────────────

test('FE-MON-002: Sources panel shows all five configured sources', async ({ page }) => {
  await gotoMonitoring(page);
  // Source names appear in the Monitored Sources table; use first() to avoid strict-mode
  // violation when a source name also appears in health/banner text
  await expect(page.getByText('FCA News RSS').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('FCA Publications RSS').first()).toBeVisible();
  await expect(page.getByText('FOS Decisions').first()).toBeVisible();
  await expect(page.getByText('RBI Press Releases').first()).toBeVisible();
  await expect(page.getByText('EBA Publications').first()).toBeVisible();
});

// ─── FE-MON-003 ───────────────────────────────────────────────────────────────

test('FE-MON-003: Pending Review count badge updates after approval', async ({ page }) => {
  const fakeChunk = {
    id:            'aaaaaaaa-0000-0000-0000-000000000001',
    title:         'Test Regulatory Chunk',
    jurisdiction:  'UK',
    document_type: 'guidance',
    source_id:     null,
    chunk_text:    'This is a test regulatory chunk for pending review.',
    created_at:    new Date().toISOString(),
    status:        'pending_review',
  };

  let approved = false;
  await page.route(/knowledge-chunks/, (route) => {
    const method = route.request().method();
    const url    = route.request().url();

    if (method === 'PATCH' && url.includes('/review')) {
      approved = true;
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'active' }) });
    } else if (method === 'GET' && url.includes('limit=100')) {
      // Only intercept the monitoring page's request (limit=100); let PendingActionsContext (limit=200) hit the real API
      const body = approved ? '[]' : JSON.stringify([fakeChunk]);
      route.fulfill({ status: 200, contentType: 'application/json', body });
    } else {
      route.continue();
    }
  });

  await gotoMonitoring(page);

  // Fake chunk must appear in Pending Review panel
  await expect(page.getByText('Test Regulatory Chunk').first()).toBeVisible({ timeout: 10_000 });

  // Open the review modal and approve
  await page.getByRole('button', { name: 'Review' }).click();
  await page.getByRole('button', { name: 'Approve' }).click();

  // After approval load() re-fetches → second GET returns [] → empty state shown
  await expect(page.getByText('No chunks pending review')).toBeVisible({ timeout: 10_000 });
});

// ─── FE-SET-001 ───────────────────────────────────────────────────────────────

test('FE-SET-001: Settings screen loads without errors', async ({ page }) => {
  const errors = [];
  await login(page);
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push(err.message));

  await expect(page.locator('table tbody tr')).toHaveCount(8, { timeout: 15_000 });
  await page.getByRole('link', { name: 'AI Configuration' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 10_000 });
  // Wait for config panel to finish loading — skeleton replaced by form
  await expect(page.getByRole('button', { name: 'Test connection' })).toBeVisible({ timeout: 15_000 });
  expect(errors).toHaveLength(0);
});

// ─── FE-SET-002 ───────────────────────────────────────────────────────────────

test('FE-SET-002: AI Configuration panel loads saved config', async ({ page }) => {
  await page.route(/settings\/ai-config$/, (route) => {
    if (route.request().method() === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          primary_provider:          'OpenAI',
          primary_model:             'gpt-4o',
          primary_api_key_encrypted: null,
          primary_endpoint_url:      null,
          challenger_percentage:     0,
          data_agreement_tier:       'standard',
          tokenisation_enabled:      true,
        }),
      });
    } else {
      route.continue();
    }
  });

  await gotoSettings(page);
  // Wait for skeleton to clear
  await expect(page.getByRole('button', { name: 'Test connection' })).toBeVisible({ timeout: 15_000 });
  // Provider select and model input must reflect the intercepted config
  await expect(page.locator('#primary-provider')).toHaveValue('OpenAI');
  await expect(page.locator('#primary-model')).toHaveValue('gpt-4o');
});

// ─── FE-SET-003 ───────────────────────────────────────────────────────────────

test('FE-SET-003: Connection Test button shows result message', async ({ page }) => {
  await page.route(/settings\/ai-config\/test/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ model: 'gpt-4o', response_time_ms: 42 }),
    }),
  );

  await gotoSettings(page);
  await expect(page.getByRole('button', { name: 'Test connection' })).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText(/responded in 42ms/)).toBeVisible({ timeout: 10_000 });
});
