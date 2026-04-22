import 'dotenv/config';
import { randomUUID } from 'crypto';
import { pool } from '../pool.js';

// ─── Date helpers ─────────────────────────────────────────────────────────────
function daysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(9, 0, 0, 0);
  return d.toISOString();
}
function addDays(iso, n) {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString();
}
function hoursFromNow(iso) {
  return (new Date(iso) - Date.now()) / 3_600_000;
}

// ─── Pre-generate all UUIDs so cross-references can be set on first insert ───
const STAFF_ID = randomUUID();

const CU = {
  sarah:  randomUUID(),
  marcus: randomUUID(),
  priya:  randomUUID(),
  james:  randomUUID(),
  aisha:  randomUUID(),
  tom:    randomUUID(),
};

const CA = {
  c1: randomUUID(), c2: randomUUID(), c3: randomUUID(), c4: randomUUID(),
  c5: randomUUID(), c6: randomUUID(), c7: randomUUID(), c8: randomUUID(),
};

const CM = {
  c1:  randomUUID(), c2:  randomUUID(), c3:  randomUUID(), c4:  randomUUID(),
  c5:  randomUUID(), c6:  randomUUID(), c7:  randomUUID(), c8:  randomUUID(),
  c9:  randomUUID(), c10: randomUUID(), c11: randomUUID(), c12: randomUUID(),
  c13: randomUUID(), c14: randomUUID(), c15: randomUUID(),
};

const AI = {
  a1: randomUUID(), // complaint_classification — Case 5
  a2: randomUUID(), // response_draft — Case 1, pending
  a3: randomUUID(), // risk_flag — Case 3
  a4: randomUUID(), // ruleset_impact_assessment — Case 4
};

// ─── Opened-at anchors ─────────────────────────────────────────────────────────
const O = {
  c1: daysAgo(55), c2: daysAgo(54), c3: daysAgo(30), c4: daysAgo(60),
  c5: daysAgo(14), c6: daysAgo(7),  c7: daysAgo(3),  c8: daysAgo(60),
};

// ─── Main ─────────────────────────────────────────────────────────────────────
async function seed() {
  const db = await pool.connect();
  const counts = {
    customers: 0, cases: 0, communications: 0, deadlines: 0, ai_actions: 0,
  };

  try {
    await db.query('BEGIN');

    // ── 0. Fetch ruleset IDs ──────────────────────────────────────────────────
    const { rows: rsRows } = await db.query(
      `SELECT id, rule_type FROM ruleset
       WHERE version = 'UK-FCA-2024-v1' AND is_active = true`
    );
    if (!rsRows.length) throw new Error('UK FCA ruleset not found — run migrations first.');
    const RS = Object.fromEntries(rsRows.map((r) => [r.rule_type, r.id]));

    // ── 1. Clear existing seed data (reverse FK order) ────────────────────────
    console.log('Clearing existing seed data…');
    const ACCS = ['ACC-44821', 'ACC-39014', 'ACC-51203', 'ACC-28876', 'ACC-61090', 'ACC-17342'];

    await db.query(
      `DELETE FROM ai_actions WHERE case_id IN (
         SELECT id FROM cases WHERE customer_id IN (
           SELECT id FROM customers WHERE external_ref = ANY($1)
         )
       )`,
      [ACCS]
    );
    await db.query(
      `DELETE FROM deadlines WHERE case_id IN (
         SELECT id FROM cases WHERE customer_id IN (
           SELECT id FROM customers WHERE external_ref = ANY($1)
         )
       )`,
      [ACCS]
    );
    await db.query(
      `DELETE FROM communications WHERE customer_id IN (
         SELECT id FROM customers WHERE external_ref = ANY($1)
       )`,
      [ACCS]
    );
    await db.query(
      `DELETE FROM cases WHERE customer_id IN (
         SELECT id FROM customers WHERE external_ref = ANY($1)
       )`,
      [ACCS]
    );
    await db.query(
      `DELETE FROM customers WHERE external_ref = ANY($1)`,
      [ACCS]
    );
    console.log('  ✓ Cleared\n');

    // ── 2. Customers ──────────────────────────────────────────────────────────
    console.log('Inserting customers…');
    const customers = [
      [CU.sarah,  'ACC-44821', 'Sarah Okonkwo',   'sarah.okonkwo@email.com',  false],
      [CU.marcus, 'ACC-39014', 'Marcus Tetteh',   'marcus.tetteh@email.com',  false],
      [CU.priya,  'ACC-51203', 'Priya Nambiar',   'p.nambiar@email.com',      true ],
      [CU.james,  'ACC-28876', 'James Whitfield', 'j.whitfield@email.com',    false],
      [CU.aisha,  'ACC-61090', 'Aisha Conteh',    'aisha.conteh@email.com',   false],
      [CU.tom,    'ACC-17342', 'Tom Barratt',     'tom.barratt@email.com',    false],
    ];
    for (const [id, ref, name, email, vuln] of customers) {
      await db.query(
        `INSERT INTO customers (id, external_ref, full_name, email, jurisdiction, vulnerable_flag, consent_status)
         VALUES ($1, $2, $3, $4, 'UK', $5, 'given')`,
        [id, ref, name, email, vuln]
      );
      counts.customers++;
      console.log(`  ✓ ${name}${vuln ? ' [vulnerable]' : ''}`);
    }

    // ── 3. Cases ──────────────────────────────────────────────────────────────
    console.log('\nInserting cases…');
    // All cases share the FINAL_RESPONSE ruleset row as the FK anchor
    const caseRulesetId = RS.FINAL_RESPONSE;

    const cases = [
      {
        id: CA.c1, ref: 'NQ-2026-0001', cust: CU.sarah,  cat: 'irresponsible_lending',
        ch: 'email',  st: 'under_review',      openedAt: O.c1,
        isImpl: false, aiDet: false,
      },
      {
        id: CA.c2, ref: 'NQ-2026-0002', cust: CU.marcus, cat: 'arrears_handling',
        ch: 'chat',   st: 'under_review',      openedAt: O.c2,
        isImpl: false, aiDet: false,
      },
      {
        id: CA.c3, ref: 'NQ-2026-0003', cust: CU.priya,  cat: 'fee_dispute',
        ch: 'postal', st: 'under_review',      openedAt: O.c3,
        isImpl: false, aiDet: false,
        notes: 'Vulnerable customer — mental health disclosure on file. Apply Consumer Duty vulnerability protocols throughout.',
      },
      {
        id: CA.c4, ref: 'NQ-2026-0004', cust: CU.james,  cat: 'collections_conduct',
        ch: 'email',  st: 'fos_referred',      openedAt: O.c4,
        isImpl: false, aiDet: false, fosRef: 'FOS-2024-00891',
      },
      {
        id: CA.c5, ref: 'NQ-2026-0005', cust: CU.aisha,  cat: 'affordability_check',
        ch: 'chat',   st: 'open',              openedAt: O.c5,
        isImpl: true,  aiDet: true,
      },
      {
        id: CA.c6, ref: 'NQ-2026-0006', cust: CU.tom,    cat: 'default_notice_dispute',
        ch: 'postal', st: 'open',              openedAt: O.c6,
        isImpl: false, aiDet: false,
      },
      {
        id: CA.c7, ref: 'NQ-2026-0007', cust: CU.sarah,  cat: 'payment_allocation',
        ch: 'email',  st: 'open',              openedAt: O.c7,
        isImpl: false, aiDet: false,
      },
      {
        id: CA.c8, ref: 'NQ-2026-0008', cust: CU.marcus, cat: 'data_subject_access',
        ch: 'email',  st: 'closed_not_upheld', openedAt: O.c8,
        isImpl: false, aiDet: false, closedAt: new Date().toISOString(),
      },
    ];

    for (const c of cases) {
      await db.query(
        `INSERT INTO cases
           (id, case_ref, customer_id, ruleset_id, status, category, channel_received,
            opened_at, closed_at, is_implicit, ai_detected, fos_ref, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          c.id, c.ref, c.cust, caseRulesetId, c.st, c.cat, c.ch,
          c.openedAt, c.closedAt ?? null,
          c.isImpl, c.aiDet,
          c.fosRef ?? null, c.notes ?? null,
        ]
      );
      counts.cases++;
      console.log(`  ✓ ${c.ref}  ${c.cat}  (${c.st})`);
    }

    // ── 4. Communications (15) ────────────────────────────────────────────────
    console.log('\nInserting communications…');

    const DRAFT_BODY = `Dear Ms Okonkwo,

Thank you for your patience while we have been investigating your complaint (reference NQ-2026-0001) regarding the affordability assessment conducted at the time your loan was originated.

We have now completed our review of your account history, the affordability assessment documentation held on file, and your stated circumstances at the time of application.

Our findings indicate that the affordability assessment carried out at origination did not adequately account for your existing credit commitments. On the basis of the information available to us at the time, a prudent lender applying CONC 5 standards ought to have made further enquiries before proceeding.

We are therefore minded to uphold your complaint in full. We propose to refund all interest and charges applied to your account since inception, totalling £1,847.23, and to write off the outstanding balance of £3,204.50. We will also write to the credit reference agencies to request removal of any adverse entries relating to this account.

[DRAFT — PENDING HUMAN REVIEW: Please verify figures against account ledger before sending. Confirm FOS referral paragraph required given 56-day deadline approaching.]`;

    const comms = [
      // C1: Inbound email — Sarah, Case 1, Day 0
      {
        id: CM.c1, caseId: CA.c1, custId: CU.sarah,
        channel: 'email', dir: 'inbound', authorType: 'customer',
        sentAt: O.c1,
        subject: 'Complaint regarding my loan — Account ACC-44821',
        body: `Dear Complaints Team,

I am writing to make a formal complaint about the personal loan I took out with you in March 2024 (account reference ACC-44821).

I do not believe you carried out adequate affordability checks before lending to me. At the time of my application I had existing credit card debt of approximately £8,000 and my income was irregular due to freelance work. I was not asked to provide details of my existing commitments, and the loan was approved within hours of my application.

I am now struggling to make the repayments and have fallen into arrears. I believe that if a proper affordability assessment had been carried out, this loan would not have been granted.

I am requesting a full review and I believe I am entitled to a refund of all interest and charges paid to date, as well as removal of any adverse credit file entries. Please treat this as a formal complaint.

Yours sincerely,
Sarah Okonkwo`,
      },

      // C2: Outbound staff email — Case 1 acknowledgement, Day 1
      {
        id: CM.c2, caseId: CA.c1, custId: CU.sarah,
        channel: 'email', dir: 'outbound', authorType: 'staff',
        aiGenerated: false,
        sentAt: addDays(O.c1, 1),
        subject: 'We have received your complaint — NQ-2026-0001',
        body: `Dear Ms Okonkwo,

Thank you for contacting us. We have received your complaint and registered it under reference NQ-2026-0001.

We take all complaints seriously and will investigate the matters you have raised thoroughly. We aim to provide you with a full response within 8 weeks of receiving your complaint (by ${new Date(addDays(O.c1, 56)).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}).

If we are unable to resolve your complaint within this timeframe we will write to you to explain the reason for the delay and when you can expect a full response. You also have the right at any stage to refer your complaint to the Financial Ombudsman Service, free of charge.

If you have any additional information or documents you would like us to consider, please send them to complaints@nuqe.co.uk quoting your reference number.

Yours sincerely,
Complaints Team`,
      },

      // C3: Outbound AI approved — Case 1 holding response, Day 30
      {
        id: CM.c3, caseId: CA.c1, custId: CU.sarah,
        channel: 'email', dir: 'outbound', authorType: 'ai_draft',
        aiGenerated: true, aiApprovedBy: STAFF_ID, aiApprovedAt: addDays(O.c1, 30),
        sentAt: addDays(O.c1, 30),
        subject: 'Update on your complaint — NQ-2026-0001',
        body: `Dear Ms Okonkwo,

We are writing to update you on the progress of your complaint (reference NQ-2026-0001) regarding the affordability assessment on your loan account.

We have completed our initial review and are continuing our investigation. We are reviewing the affordability documentation held on file at the time of your application and cross-referencing this with your account history.

We expect to be in a position to provide you with our full response by ${new Date(addDays(O.c1, 56)).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}. We apologise that we have not been able to resolve this matter sooner.

If at any point you are dissatisfied with our handling of your complaint, or if we do not provide a final response within 8 weeks of receipt, you have the right to refer your complaint to the Financial Ombudsman Service (FOS) free of charge. The FOS can be reached at www.financial-ombudsman.org.uk or on 0800 023 4567.

Yours sincerely,
Complaints Team`,
      },

      // C4: Inbound email — Sarah chasing, Case 1, Day 50
      {
        id: CM.c4, caseId: CA.c1, custId: CU.sarah,
        channel: 'email', dir: 'inbound', authorType: 'customer',
        sentAt: addDays(O.c1, 50),
        subject: 'Re: Update on your complaint — NQ-2026-0001',
        body: `Dear Complaints Team,

I am following up on my complaint NQ-2026-0001, submitted over seven weeks ago. I have not received a final response and I am becoming very frustrated with the delay.

I am aware that under FCA rules you are required to provide a final response within 8 weeks. That deadline is approaching and I have not had any further communication from you since your update in March.

Could you please advise when I will receive a full response? If I do not hear from you by the deadline I will be referring this matter to the Financial Ombudsman Service without further notice.

Sarah Okonkwo`,
      },

      // C5: Inbound chat — Marcus, Case 2, Day 0
      {
        id: CM.c5, caseId: CA.c2, custId: CU.marcus,
        channel: 'chat', dir: 'inbound', authorType: 'customer',
        sentAt: O.c2,
        subject: null,
        body: `Hi, I need to speak to someone urgently about my account. Your collections team has been calling me multiple times every day, including at 9 in the evening which I find really distressing. I've been trying to sort out a payment plan for weeks but no one is getting back to me properly. I made a request last month and I was told someone would call me back but nobody ever did. I'm in a really difficult financial situation right now and I feel like you're just making things worse. Is there anything you can do to help me?`,
      },

      // C6: Inbound postal — Priya, Case 3, Day 0
      {
        id: CM.c6, caseId: CA.c3, custId: CU.priya,
        channel: 'postal', dir: 'inbound', authorType: 'customer',
        sentAt: O.c3,
        subject: 'Formal Complaint — Disputed Charges, Account ACC-51203',
        body: `Dear Complaints Team,

I am writing to formally complain about charges applied to my account (ACC-51203) which I believe are incorrect.

Over the past three months, late payment fees totalling £145 have been applied to my account. I have a standing order in place which was set up to make payments automatically on the due date each month. Copies of my bank statements are enclosed showing that the standing order payments were made on time in each case.

I believe these fees have been applied in error due to a processing delay on your systems, not any failure on my part. I am requesting an immediate refund of the £145 in charges and, if any adverse information has been reported to credit reference agencies, I request that this be corrected without delay.

I should also mention that I am currently receiving support for a mental health condition and the stress caused by these incorrect charges has been significant. I would appreciate a prompt and sensitive response.

Yours sincerely,
Priya Nambiar`,
      },

      // C7: AI draft pending — Case 1 response draft (the greyed-out pending item)
      {
        id: CM.c7, caseId: CA.c1, custId: CU.sarah,
        channel: 'email', dir: 'outbound', authorType: 'ai_draft',
        aiGenerated: true, aiApprovedBy: null, aiApprovedAt: null,
        sentAt: null,
        subject: 'Final Response to Your Complaint — NQ-2026-0001',
        body: DRAFT_BODY,
        metadata: { ai_action_id: AI.a2 },
      },

      // C8: Inbound email — James, Case 4, Day 0
      {
        id: CM.c8, caseId: CA.c4, custId: CU.james,
        channel: 'email', dir: 'inbound', authorType: 'customer',
        sentAt: O.c4,
        subject: 'Urgent complaint — collections conduct, Account ACC-28876',
        body: `Dear Sir/Madam,

I am writing in a state of extreme distress about the conduct of your collections team towards me over the past two months.

I received a default notice on my account last month despite being in an agreed payment arrangement. I have the written confirmation of this arrangement from your team. Despite this, the collections activity has continued and on two separate occasions a representative has attended my home address without prior arrangement or warning.

This conduct is, in my view, both unlawful and an infringement of my rights as a consumer. I have experienced significant anxiety as a result. I am formally lodging a complaint and I am copying this correspondence to the Financial Conduct Authority.

I expect an acknowledgement within 24 hours and a full investigation. If I do not receive a satisfactory response I will be referring this matter to the Financial Ombudsman Service immediately.

James Whitfield`,
      },

      // C9: Outbound AI approved — Case 4 holding response, Day 2
      {
        id: CM.c9, caseId: CA.c4, custId: CU.james,
        channel: 'email', dir: 'outbound', authorType: 'ai_draft',
        aiGenerated: true, aiApprovedBy: STAFF_ID, aiApprovedAt: addDays(O.c4, 2),
        sentAt: addDays(O.c4, 2),
        subject: 'We have received your complaint — NQ-2026-0004',
        body: `Dear Mr Whitfield,

We have received your complaint and want you to know that we take the matters you have raised extremely seriously.

Your complaint has been registered under reference NQ-2026-0004 and has been escalated immediately to our specialist complaints team. We have also placed an immediate hold on all collections activity on your account pending the outcome of our investigation.

We are investigating the conduct you have described, including the circumstances surrounding the default notice and the home visits. We will provide you with our full response within 8 weeks of receiving your complaint.

We understand how distressing this situation has been. If you would like to speak with someone in the meantime, please call our dedicated complaints line on 0800 000 0000 and quote your reference number.

Yours sincerely,
Customer Resolutions Team`,
      },

      // C10: Outbound staff — Case 4 final response + FOS referral, Day 55
      {
        id: CM.c10, caseId: CA.c4, custId: CU.james,
        channel: 'email', dir: 'outbound', authorType: 'staff',
        aiGenerated: false,
        sentAt: addDays(O.c4, 55),
        subject: 'Final Response to Your Complaint — NQ-2026-0004',
        body: `Dear Mr Whitfield,

Please find below our final response to your complaint (reference NQ-2026-0004).

We have completed our investigation into your complaint regarding the conduct of our collections team. Having reviewed all records, call logs, account notes, and your payment arrangement documentation, we uphold your complaint in full.

Our investigation confirmed that: (1) a valid payment arrangement was in place at the time the default notice was issued; (2) the default notice was issued in error and should not have been sent; and (3) on two occasions, an external collections representative attended your home without the required prior agreement, which is contrary to our collections policy and FCA requirements.

We sincerely apologise for the distress this has caused you. As a resolution we are: removing the default notice and requesting immediate correction of your credit file; applying a goodwill payment of £350 to your account in recognition of the distress and inconvenience caused; and waiving all charges applied during the disputed period.

This matter has been referred to the Financial Ombudsman Service under reference FOS-2024-00891. You have the right to refer this complaint to the FOS within 6 months of this letter if you are dissatisfied with our response. The FOS can be reached at www.financial-ombudsman.org.uk.

Yours sincerely,
Head of Complaints`,
      },

      // C11: Inbound chat — Aisha, Case 5 (implicit complaint), Day 0
      {
        id: CM.c11, caseId: CA.c5, custId: CU.aisha,
        channel: 'chat', dir: 'inbound', authorType: 'customer',
        sentAt: O.c5,
        subject: null,
        body: `Hi, I've been trying to get some help with my repayments for a while now and I'm not sure what to do. I'm struggling to keep up with the payments and I'm getting worried. When I first took out the loan my income wasn't stable — I was between jobs — but I was told it would be fine and the payments were manageable. Now I'm not sure how I'm going to keep going. I don't want to fall behind but I also don't know what options I have. I feel like the loan wasn't right for me in the first place. Is there anything you can do to help me look at my options?`,
      },

      // C12: Inbound postal — Tom, Case 6, Day 0
      {
        id: CM.c12, caseId: CA.c6, custId: CU.tom,
        channel: 'postal', dir: 'inbound', authorType: 'customer',
        sentAt: O.c6,
        subject: 'Dispute of Default Notice — Account ACC-17342',
        body: `Dear Complaints Team,

I am writing to dispute the default notice issued on my account (ACC-17342) dated 10 April 2026.

At the time the default notice was issued I was operating under an agreed payment arrangement confirmed in your letter dated 18 March 2026. I have enclosed a copy of that letter. All payments required under the arrangement were made on time and in full, as shown by the enclosed bank statements.

The default notice therefore appears to have been issued in error. I request that you: (1) investigate this matter urgently; (2) cancel the default notice immediately; (3) write to any credit reference agencies to whom the default has been reported and request removal of the adverse entry.

I would also ask that you confirm whether any further collections action is planned, as I am concerned about receiving further incorrect notices.

Yours faithfully,
Tom Barratt`,
      },

      // C13: Inbound email — Sarah, Case 7 (payment allocation), Day 0
      {
        id: CM.c13, caseId: CA.c7, custId: CU.sarah,
        channel: 'email', dir: 'inbound', authorType: 'customer',
        sentAt: O.c7,
        subject: 'Incorrect payment allocation — Account ACC-44821',
        body: `Dear Complaints Team,

I am writing regarding what appears to be an error in how a payment was allocated on my account (ACC-44821).

On 18 April 2026 I made a payment of £350 which I intended to be applied to reduce my outstanding principal balance. However, reviewing my account online I can see that a portion of the payment — approximately £127 — appears to have been allocated to fees and charges rather than the balance.

I believe under the Consumer Credit Act payments should be allocated in the order most beneficial to me as the customer. I would be grateful if you could investigate and confirm that the payment has been correctly allocated, and if not, that the allocation is corrected and any resulting charges reversed.

Thank you,
Sarah Okonkwo`,
      },

      // C14: Inbound email — Marcus, Case 8 (DSAR), Day 0
      {
        id: CM.c14, caseId: CA.c8, custId: CU.marcus,
        channel: 'email', dir: 'inbound', authorType: 'customer',
        sentAt: O.c8,
        subject: 'Subject Access Request — Account ACC-39014',
        body: `Dear Data Protection Team,

Pursuant to Article 15 of the UK General Data Protection Regulation and Section 45 of the Data Protection Act 2018, I am formally requesting a copy of all personal data you hold relating to me.

My account reference is ACC-39014. I request copies of all data including but not limited to: full account history and transaction records; all correspondence sent to and received from me; call recordings and transcripts; internal notes and case records; affordability assessment documentation; any data shared with third parties including credit reference agencies; and details of all automated decisions made about me.

Please acknowledge receipt of this request and confirm the expected date of response. I understand you have one month to comply with this request.

Marcus Tetteh`,
      },

      // C15: Inbound email — Priya chasing, Case 3, Day 25
      {
        id: CM.c15, caseId: CA.c3, custId: CU.priya,
        channel: 'email', dir: 'inbound', authorType: 'customer',
        sentAt: addDays(O.c3, 25),
        subject: 'Re: Formal Complaint — Disputed Charges, Account ACC-51203',
        body: `Dear Complaints Team,

I am writing to follow up on the formal complaint letter I sent approximately three weeks ago regarding incorrectly applied charges on account ACC-51203.

I have not received an acknowledgement and am concerned that my letter may not have been received. Could you please confirm whether you have received my complaint and provide me with a reference number and an indication of when I can expect a response?

I should note that the situation is causing me ongoing stress and I would be grateful for prompt communication.

Yours sincerely,
Priya Nambiar`,
      },
    ];

    for (const c of comms) {
      await db.query(
        `INSERT INTO communications
           (id, case_id, customer_id, channel, direction, subject, body, body_plain,
            author_type, ai_generated, ai_approved_by, ai_approved_at,
            sent_at, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          c.id, c.caseId, c.custId, c.channel, c.dir,
          c.subject ?? null, c.body, c.body,
          c.authorType,
          c.aiGenerated  ?? false,
          c.aiApprovedBy ?? null,
          c.aiApprovedAt ?? null,
          c.sentAt       ?? null,
          c.metadata     ? JSON.stringify(c.metadata) : null,
        ]
      );
      counts.communications++;
    }
    console.log(`  ✓ ${counts.communications} communications inserted`);

    // ── 5. Deadlines (open + under_review cases only: c1–c3, c5–c7) ──────────
    console.log('\nInserting deadlines…');

    const deadlineCases = [
      { id: CA.c1, openedAt: O.c1 },
      { id: CA.c2, openedAt: O.c2 },
      { id: CA.c3, openedAt: O.c3 },
      { id: CA.c5, openedAt: O.c5 },
      { id: CA.c6, openedAt: O.c6 },
      { id: CA.c7, openedAt: O.c7 },
    ];

    for (const c of deadlineCases) {
      // ACKNOWLEDGE (3 days) — mark as met on time for all cases
      const ackDue = addDays(c.openedAt, 3);
      await db.query(
        `INSERT INTO deadlines (id, case_id, ruleset_id, deadline_type, due_at, met_at)
         VALUES ($1,$2,$3,'ACKNOWLEDGE',$4,$5)`,
        [randomUUID(), c.id, RS.ACKNOWLEDGE, ackDue, addDays(c.openedAt, 1)]
      );
      counts.deadlines++;

      // FINAL_RESPONSE (56 days) — within 48h for c1 and c2
      const frDue      = addDays(c.openedAt, 56);
      const hrsUntilFR = hoursFromNow(frDue);
      const alert48h   = (hrsUntilFR > 0 && hrsUntilFR <= 48)
        ? addDays(c.openedAt, 54)  // alert fired 2 days before deadline
        : null;

      await db.query(
        `INSERT INTO deadlines (id, case_id, ruleset_id, deadline_type, due_at, alerted_at_48h)
         VALUES ($1,$2,$3,'FINAL_RESPONSE',$4,$5)`,
        [randomUUID(), c.id, RS.FINAL_RESPONSE, frDue, alert48h]
      );
      counts.deadlines++;

      // FOS_REFERRAL (56 days — same date)
      await db.query(
        `INSERT INTO deadlines (id, case_id, ruleset_id, deadline_type, due_at, alerted_at_48h)
         VALUES ($1,$2,$3,'FOS_REFERRAL',$4,$5)`,
        [randomUUID(), c.id, RS.FOS_REFERRAL, frDue, alert48h]
      );
      counts.deadlines++;
    }
    console.log(`  ✓ ${counts.deadlines} deadlines inserted`);

    // ── 6. AI Actions (4) ─────────────────────────────────────────────────────
    console.log('\nInserting AI actions…');

    const aiActions = [
      // A1: complaint_classification — Case 5, approved
      {
        id: AI.a1, caseId: CA.c5, commId: CM.c11,
        type: 'complaint_classification',
        input: 'Classify customer chat message for Case 5 (Aisha Conteh, ACC-61090). Determine whether this constitutes an implicit complaint under DISP 1.3.',
        output: `Classification: IMPLICIT_COMPLAINT (confidence: 0.93)

The customer's message satisfies DISP 1.3 implicit complaint criteria. Key indicators present:
1. Expressed dissatisfaction with the lending decision at origination ("I feel like the loan wasn't right for me in the first place")
2. Allegation of inadequate affordability assessment ("my income wasn't stable — I was between jobs — but I was told it would be fine")
3. Current financial distress causally linked to the firm's actions
4. Implicit request for a review of the lending decision ("Is there anything you can do to help me look at my options?")

Recommended action: Create case under category 'affordability_check'. Flag for irresponsible lending assessment. Apply Consumer Duty vulnerability screening given language indicators of financial distress.`,
        model: 'claude-sonnet-4-6', provider: 'Claude', score: 0.930,
        status: 'approved',
        aiClass: 'implicit_complaint', humanClass: 'implicit_complaint',
        reviewedBy: STAFF_ID, reviewedAt: addDays(O.c5, 0),
        note: 'Agreed with classification. Case created and assigned to lending review team.',
      },

      // A2: response_draft — Case 1, pending
      {
        id: AI.a2, caseId: CA.c1, commId: CM.c7,
        type: 'response_draft',
        input: `Draft final response for irresponsible lending complaint NQ-2026-0001 (Sarah Okonkwo, ACC-44821). Case opened ${O.c1}. 56-day FINAL_RESPONSE deadline approaching. Affordability assessment at origination found to be inadequate — existing debt not recorded.`,
        output: DRAFT_BODY,
        model: 'claude-sonnet-4-6', provider: 'Claude', score: 0.870,
        status: 'pending',
        aiClass: null, humanClass: null,
        reviewedBy: null, reviewedAt: null, note: null,
      },

      // A3: risk_flag — Case 3, approved (vulnerability)
      {
        id: AI.a3, caseId: CA.c3, commId: CM.c6,
        type: 'risk_flag',
        input: 'Review inbound postal complaint for Case 3 (Priya Nambiar, ACC-51203) for risk flags and vulnerability indicators.',
        output: `RISK FLAG — VULNERABILITY IDENTIFIED (confidence: 0.91)

The customer's letter contains an explicit disclosure of a mental health condition ("I am currently receiving support for a mental health condition") directly linked to distress caused by the firm's conduct.

This triggers mandatory Consumer Duty vulnerability obligations:
1. Flag account with vulnerability indicator
2. Ensure all subsequent communications are reviewed for tone, clarity, and accessibility
3. Assign to a trained vulnerability specialist handler
4. Consider waiving or expediting the fees dispute given the vulnerability context
5. Do not require the customer to repeat her disclosure in follow-up contacts — record it and act on it

Regulatory basis: FCA FG21/1 (Vulnerable Customers Guidance), Consumer Duty (PS22/9), CONC 7.

Case priority elevated to HIGH.`,
        model: 'claude-sonnet-4-6', provider: 'Claude', score: 0.910,
        status: 'approved',
        aiClass: 'vulnerability_flag', humanClass: 'vulnerability_flag',
        reviewedBy: STAFF_ID, reviewedAt: addDays(O.c3, 2),
        note: 'Confirmed. Account flagged. Assigned to vulnerability team. Expedited review authorised.',
      },

      // A4: ruleset_impact_assessment — Case 4, approved
      {
        id: AI.a4, caseId: CA.c4, commId: CM.c8,
        type: 'ruleset_impact_assessment',
        input: 'Assess applicable FCA ruleset obligations and likely FOS outcome for Case 4 (James Whitfield, ACC-28876). Collections conduct complaint including erroneous default notice and two unannounced home visits.',
        output: `RULESET IMPACT ASSESSMENT — NQ-2026-0004

Applicable rules:
- CONC 7.9.4: Firms must not visit a customer's home without prior agreement. Two confirmed visits without prior arrangement. BREACH CONFIRMED.
- CONC 7.9.3(c): Must not use threatening behaviour or apply undue pressure. Characterisation depends on visit conduct — investigation ongoing.
- DISP 1.6.2: 56-day FINAL_RESPONSE deadline. Case opened ${O.c4}. Deadline: ${addDays(O.c4, 56).slice(0,10)}.
- Consumer Duty (PS22/9): Firm has caused foreseeable harm. Breach of cross-cutting rule requiring firms to avoid causing foreseeable harm to retail customers.

FOS outcome assessment (HIGH confidence): FOS would very likely uphold this complaint. The erroneous default notice combined with unannounced home visits constitute clear CONC 7 breaches. FOS standard remediation in this category: removal of default; compensation £200–£500 for distress depending on severity; charges waiver.

Recommended resolution: Uphold in full. Issue written apology. Remove default notice immediately. Goodwill payment minimum £250. Refer proactively to FOS given strength of customer's case and risk of adverse FOS determination.`,
        model: 'claude-sonnet-4-6', provider: 'Claude', score: 0.950,
        status: 'approved',
        aiClass: null, humanClass: null,
        reviewedBy: STAFF_ID, reviewedAt: addDays(O.c4, 3),
        note: 'Assessment accurate. Approved for case file. Proactive FOS referral agreed — goodwill at £350.',
      },
    ];

    for (const a of aiActions) {
      await db.query(
        `INSERT INTO ai_actions
           (id, case_id, communication_id, action_type, ai_input, ai_output,
            ai_model, ai_provider, confidence_score, status,
            ai_classification, human_classification,
            reviewed_by, reviewed_at, review_note,
            tokenisation_applied)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,true)`,
        [
          a.id, a.caseId, a.commId, a.type, a.input, a.output,
          a.model, a.provider, a.score, a.status,
          a.aiClass, a.humanClass,
          a.reviewedBy, a.reviewedAt, a.note,
        ]
      );
      counts.ai_actions++;
    }
    console.log(`  ✓ ${counts.ai_actions} AI actions inserted`);

    await db.query('COMMIT');

    // ── 7. Summary ─────────────────────────────────────────────────────────────
    const WIDTH = 20;
    console.log('\n' + '─'.repeat(44));
    console.log('  Demo seed complete\n');
    for (const [table, n] of Object.entries(counts)) {
      console.log(`  ${'  ' + table}`.padEnd(WIDTH + 2) + `${n} rows inserted`);
    }
    console.log('─'.repeat(44));

  } catch (err) {
    await db.query('ROLLBACK');
    console.error('\nSeed failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    db.release();
    await pool.end();
  }
}

seed();
