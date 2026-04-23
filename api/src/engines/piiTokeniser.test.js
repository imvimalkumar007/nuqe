import { tokenise, detokenise } from './piiTokeniser.js';

// ─── PII-001 ──────────────────────────────────────────────────────────────────

test('PII-001: Layer 1 replaces email addresses', () => {
  const { tokenisedText, tokenMap } = tokenise(
    'Please contact jane.doe@example.com for more information.'
  );

  expect(tokenisedText).not.toContain('jane.doe@example.com');
  const emailToken = Object.entries(tokenMap).find(([, v]) => v === 'jane.doe@example.com');
  expect(emailToken).toBeDefined();
  expect(emailToken[0]).toMatch(/\[EMAIL-\d+\]/);
});

// ─── PII-002 ──────────────────────────────────────────────────────────────────

test('PII-002: Layer 1 replaces UK phone numbers', () => {
  const { tokenisedText, tokenMap } = tokenise(
    'You can reach us on 07700 900123 or leave a message.'
  );

  expect(tokenisedText).not.toContain('07700 900123');
  const phoneToken = Object.entries(tokenMap).find(([, v]) => v === '07700 900123');
  expect(phoneToken).toBeDefined();
  expect(phoneToken[0]).toMatch(/\[PHONE-\d+\]/);
});

// ─── PII-003 ──────────────────────────────────────────────────────────────────

test('PII-003: Layer 1 replaces loan refs in NQ-YYYY-NNNN format', () => {
  const { tokenisedText, tokenMap } = tokenise(
    'Your complaint reference is NQ-2024-0042. We will respond shortly.'
  );

  expect(tokenisedText).not.toContain('NQ-2024-0042');
  const loanToken = Object.entries(tokenMap).find(([, v]) => v === 'NQ-2024-0042');
  expect(loanToken).toBeDefined();
  expect(loanToken[0]).toMatch(/\[LOANREF-\d+\]/);
});

// ─── PII-004 ──────────────────────────────────────────────────────────────────

test('PII-004: Layer 2 replaces StepChange with a DEBTORG token', () => {
  const { tokenisedText, tokenMap } = tokenise(
    'The customer mentioned they had contacted StepChange for debt advice.'
  );

  expect(tokenisedText).not.toContain('StepChange');
  const debtToken = Object.entries(tokenMap).find(([k]) => k.includes('DEBTORG'));
  expect(debtToken).toBeDefined();
  expect(debtToken[1]).toBe('StepChange');
});

// ─── PII-005 ──────────────────────────────────────────────────────────────────

test('PII-005: Layer 2 replaces "mental health" with a VULNERABILITY token', () => {
  const { tokenisedText, tokenMap } = tokenise(
    'The customer disclosed they are experiencing mental health difficulties.'
  );

  expect(tokenisedText).not.toContain('mental health');
  const vulnToken = Object.entries(tokenMap).find(([k]) => k.includes('VULNERABILITY'));
  expect(vulnToken).toBeDefined();
  expect(vulnToken[1]).toBe('mental health');
});

// ─── PII-006 ──────────────────────────────────────────────────────────────────

test('PII-006: Person name not caught by Layer 1 is tokenised', () => {
  // "David Johnson" has no title prefix (L1 won't match) and isn't in the L2 vocab.
  // It should be detected by L3 (NLP compromise) or L4 (title-case fallback).
  const { tokenisedText, tokenMap } = tokenise(
    'David Johnson submitted a complaint on Monday.'
  );

  expect(tokenisedText).not.toContain('David Johnson');
  const nameToken = Object.entries(tokenMap).find(([, v]) => v === 'David Johnson');
  expect(nameToken).toBeDefined();
  expect(nameToken[0]).toMatch(/\[NAME-\d+\]/);
});

// ─── PII-007 ──────────────────────────────────────────────────────────────────

test('PII-007: detokenise restores all original values correctly', () => {
  const original =
    'Contact Mr John Smith at john.smith@example.com or 07700 900456 re: NQ-2025-0099.';

  const { tokenisedText, tokenMap } = tokenise(original);

  // Should have replaced sensitive fields
  expect(tokenisedText).not.toContain('john.smith@example.com');
  expect(tokenisedText).not.toContain('07700 900456');
  expect(tokenisedText).not.toContain('NQ-2025-0099');

  const restored = detokenise(tokenisedText, tokenMap);
  expect(restored).toBe(original);
});

// ─── PII-008 ──────────────────────────────────────────────────────────────────

test('PII-008: Low confidence detections are reflected in lowConfidenceFlags count', () => {
  // 8-digit account number (confidence 0.65) triggers a low-confidence flag.
  // Use isolated digits to avoid overlap with phone patterns.
  const { lowConfidenceFlags, tokenMap } = tokenise(
    'Please reference account 12345678 in your reply.'
  );

  expect(lowConfidenceFlags).toBeGreaterThan(0);

  // The 8-digit value should still be tokenised despite low confidence
  const accountToken = Object.entries(tokenMap).find(([, v]) => v === '12345678');
  expect(accountToken).toBeDefined();
});
