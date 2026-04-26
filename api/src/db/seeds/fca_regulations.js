/**
 * FCA regulatory knowledge seed.
 * Covers: CONC, PRIN / Consumer Duty, PROD, DISP (detailed), PSR APP fraud.
 * Chunks are inserted with ON CONFLICT DO NOTHING so the script is idempotent.
 * Run embeddings separately: npm run embed
 */

import { pool } from '../db/pool.js';

const chunks = [

  // ── DISP 1 — Complaints handling ────────────────────────────────────────────

  {
    namespace: 'regulatory', jurisdiction: 'UK',
    document_type: 'regulation',
    source_document: 'DISP 1.3',
    title: 'DISP 1.3 — Complaints handling procedures and root cause analysis',
    chunk_text: `DISP 1.3.1: A firm must have in place and operate appropriate and effective internal complaint-handling procedures for handling complaints. These procedures must be written down and made available to staff dealing with complaints, and to complainants on request.

DISP 1.3.2: The procedures must ensure that complaints are handled efficiently and in a timely manner, that the subject matter of any complaint is investigated competently and impartially, and that complainants receive a fair outcome.

DISP 1.3.3: A firm must carry out a root cause analysis of complaints it receives. Where a firm identifies recurring or systemic problems, it must consider whether these problems may have affected customers who have not complained and take appropriate steps to ensure those customers are not disadvantaged. Root cause analysis should inform improvements to products, services, and processes.

DISP 1.3.4: A firm must appoint a senior manager with responsibility for complaints handling. This should ordinarily be at board level or equivalent, ensuring that complaints receive appropriate organisational attention.`,
    confidence_tier: 'verified', status: 'active', token_count: 190,
  },

  {
    namespace: 'regulatory', jurisdiction: 'UK',
    document_type: 'regulation',
    source_document: 'DISP 1.6',
    title: 'DISP 1.6 — Time limits and final response requirements',
    chunk_text: `DISP 1.6.1: A firm must send a final response to a complainant by the end of 8 weeks after the date it received the complaint. The 8-week period runs from the date the complaint is received — not from the date the firm first notified the customer of its receipt.

DISP 1.6.2: A firm may send an "early resolution" response by close of business on the third business day after receiving the complaint if: (a) the complainant has indicated acceptance of the response; or (b) where the firm reasonably considers the complaint can be resolved within that period.

DISP 1.6.3: If a firm cannot resolve a complaint within 8 weeks, it must send a written response explaining why it cannot yet resolve it, indicating when it expects to do so, and informing the complainant of their right to refer to the Financial Ombudsman Service (FOS).

DISP 1.6.4: The 8-week deadline does not stop running if the firm is awaiting information from a third party. A firm must take reasonable steps to obtain information promptly and manage its case pipeline proactively.

DISP 1.6.5: Where a complaint concerns a payment service governed by the Payment Services Regulations 2017, the maximum period for a final response is 15 business days (extendable to 35 in exceptional circumstances).`,
    confidence_tier: 'verified', status: 'active', token_count: 220,
  },

  {
    namespace: 'regulatory', jurisdiction: 'UK',
    document_type: 'regulation',
    source_document: 'DISP 1.9',
    title: 'DISP 1.9 — Content of written responses and FOS signposting',
    chunk_text: `DISP 1.9.1: A final response from a firm must be in writing and must: (a) accept the complaint and offer appropriate redress or remedial action; or (b) offer redress or remedial action without accepting the complaint; or (c) reject the complaint and give reasons.

DISP 1.9.2: In all cases, the final response must inform the complainant that if they remain dissatisfied they may refer their complaint to the Financial Ombudsman Service (FOS). The letter must include the FOS website address (www.financial-ombudsman.org.uk) and confirm that the complainant must refer the complaint within 6 months of the date of the final response.

DISP 1.9.3: Where a firm is upholding a complaint, the response must specify the redress offered including the amount of any financial compensation, how any interest has been calculated, and a clear deadline by which the redress will be paid.

DISP 1.9.4: Rejection letters must not be written in a way that seeks to dissuade the complainant from pursuing their rights with FOS. The tone must be objective and informative. References to "legal action" by the firm or language designed to intimidate should be avoided.`,
    confidence_tier: 'verified', status: 'active', token_count: 200,
  },

  // ── CONC 5 — Creditworthiness assessment ────────────────────────────────────

  {
    namespace: 'regulatory', jurisdiction: 'UK',
    document_type: 'regulation',
    source_document: 'CONC 5.2',
    title: 'CONC 5.2 — Creditworthiness assessment obligations before lending',
    chunk_text: `CONC 5.2.1: Before making or increasing a regulated credit agreement, a firm must undertake a reasonable assessment of the creditworthiness of the customer. The purpose is to assess the prospect that the customer will be able to meet their repayments in a sustainable manner without the customer incurring undue difficulty.

CONC 5.2.2: A creditworthiness assessment must take account of: (a) the customer's income and expenditure; (b) the customer's financial situation at the time of application; (c) any known future changes to income or expenditure; (d) the total cost of credit including fees and interest; (e) the customer's credit history where available.

CONC 5.2.3: In assessing creditworthiness a firm must consider whether the customer can make repayments without the customer having to borrow more money, dispose of essential assets, use a credit card to make repayments, or materially impact the customer's essential living expenses.

CONC 5.2.4: Where a firm is not satisfied that the customer can meet repayments without undue difficulty, the firm must not make the agreement. The FCA expects firms to decline applications where creditworthiness concerns exist, rather than accepting risk and making higher provisions.

CONC 5.2.5: Affordability checks must be proportionate to the risk, term, and amount of the credit. A higher level of scrutiny is expected for large, long-term, or high-interest-rate credit agreements.`,
    confidence_tier: 'verified', status: 'active', token_count: 210,
  },

  // ── CONC 7 — Arrears, default and recovery ──────────────────────────────────

  {
    namespace: 'regulatory', jurisdiction: 'UK',
    document_type: 'regulation',
    source_document: 'CONC 7.3',
    title: 'CONC 7.3 — Treatment of customers in default or arrears: forbearance obligations',
    chunk_text: `CONC 7.3.2: A firm must treat customers in default or arrears difficulties with forbearance and due consideration. Where a customer is in arrears, the firm must consider reasonable options for resolving the position, including: (a) agreeing a mutually affordable repayment plan; (b) deferring collection activity for a reasonable period; (c) reducing or suspending interest or charges; (d) accepting payment of the outstanding balance in full without enforcement.

CONC 7.3.3: A firm should not put pressure on a customer in financial difficulty to make unrealistic repayment offers. Firms should acknowledge the customer's actual financial position and make offers that take that position into account.

CONC 7.3.4: A firm must not ignore, dismiss, or dismiss without proper consideration an offer of repayment from a customer in difficulty, even if that offer is below the scheduled contractual payment.

CONC 7.3.5: Firms must refer customers showing signs of financial difficulty to free-to-customer debt advice services such as the Money and Pensions Service (MaPS), Citizens Advice, StepChange, or National Debtline, where it would be in the customer's interest to do so.

CONC 7.3.6: Breathing Space Scheme: a firm must suspend enforcement activity and freeze interest and charges for customers who are in an approved Breathing Space debt respite scheme. This applies for the duration of the 60-day Breathing Space period, or the full duration of a Mental Health Crisis Moratorium.`,
    confidence_tier: 'verified', status: 'active', token_count: 220,
  },

  {
    namespace: 'regulatory', jurisdiction: 'UK',
    document_type: 'regulation',
    source_document: 'CONC 7.5',
    title: 'CONC 7.5 — Contact with customers in arrears: permitted times and methods',
    chunk_text: `CONC 7.5.1: A firm must not contact a customer in arrears at times it knows or ought reasonably to know are inconvenient to the customer. The FCA considers the following contact times to be reasonable: Monday to Saturday 8:00am to 9:00pm; Sunday and bank holidays 10:00am to 6:00pm.

CONC 7.5.2: A firm must not contact a customer by telephone more than three times in any single day. Where the customer has not answered, a voicemail should count as a contact attempt. Repeated daily calling without response is likely to constitute unfair or oppressive conduct.

CONC 7.5.3: A firm must stop contact attempts if the customer has indicated — whether verbally or in writing — that they do not wish to be contacted at a particular time, number, or channel. Firms must honour such requests promptly.

CONC 7.5.4: A firm must not threaten to take legal or enforcement action unless it has a genuine and current intention to do so. Vague references to "legal action" or "further steps" in standard arrears letters without genuine intent are likely to be misleading.

CONC 7.5.5: Contact with third parties (e.g. a customer's employer, family members) is only permitted where the customer has given explicit consent, or where contact is necessary to locate the customer after reasonable attempts to contact them directly have failed. Contact must not reveal the nature of the debt to third parties.`,
    confidence_tier: 'verified', status: 'active', token_count: 225,
  },

  // ── PRIN / Consumer Duty ─────────────────────────────────────────────────────

  {
    namespace: 'regulatory', jurisdiction: 'UK',
    document_type: 'regulation',
    source_document: 'PRIN 2.1',
    title: 'PRIN 2.1 — The FCA Principles for Businesses (all 14 Principles)',
    chunk_text: `The FCA Principles for Businesses are the fundamental obligations applicable to all authorised firms. The relevant Principles for consumer-facing firms are:

Principle 1 — Integrity: A firm must conduct its business with integrity.
Principle 2 — Skill, care and diligence: A firm must conduct its business with due skill, care and diligence.
Principle 3 — Management and control: A firm must take reasonable care to organise and control its affairs responsibly and effectively.
Principle 6 — Customers' interests: A firm must pay due regard to the interests of its customers and treat them fairly. This Principle underpins the Treating Customers Fairly (TCF) framework and requires firms to consider customer outcomes, not just process compliance.
Principle 7 — Communications with clients: A firm must pay due regard to the information needs of its clients and communicate information to them in a way which is clear, fair and not misleading.
Principle 9 — Customers: relationships of trust: A firm must take reasonable care to ensure the suitability of its advice and discretionary decisions for any customer who is entitled to rely on its judgment.
Principle 11 — Relations with regulators: A firm must deal with its regulators in an open and cooperative way, and must disclose to the FCA anything relating to the firm of which the FCA would reasonably expect notice.
Principle 12 — Consumer Duty (July 2023): A firm must act to deliver good outcomes for retail customers.`,
    confidence_tier: 'verified', status: 'active', token_count: 230,
  },

  {
    namespace: 'regulatory', jurisdiction: 'UK',
    document_type: 'regulation',
    source_document: 'PRIN 2A — Consumer Duty',
    title: 'Consumer Duty 2023 — Cross-cutting rules and four outcome areas',
    chunk_text: `The Consumer Duty (PRIN 2A), effective 31 July 2023, sets higher and clearer standards of consumer protection for firms operating in retail financial markets.

Cross-cutting rules (PRIN 2A.2): Firms must:
(a) Act in good faith towards retail customers — this requires honesty, fair dealing, and acting consistently with customers' reasonable expectations.
(b) Avoid causing foreseeable harm to retail customers — this includes proactively designing products and communications to prevent consumer detriment, not just reacting to complaints.
(c) Enable and support retail customers to pursue their financial objectives — firms should remove unnecessary barriers, friction, and complexity.

The four outcome areas (PRIN 2A.3–2A.6):
1. Products and services: Products must meet the needs of the identified target market and represent genuine value.
2. Price and value: The overall price paid must be reasonable relative to the benefits received. Firms must conduct value assessments.
3. Consumer understanding: Communications must be clear, not misleading, and help customers make informed decisions. Sludge practices (unnecessary friction to prevent switching or cancellation) are prohibited.
4. Consumer support: Firms must provide support that meets customers' needs across the customer journey, including claims and complaints handling. Firms must not make it harder to complain than to buy.

Monitoring obligations: Firms must monitor and regularly review their products, services, and customer outcomes. Data and MI must be used to identify and address poor outcomes. Boards must receive and engage with annual Consumer Duty assessments.`,
    confidence_tier: 'verified', status: 'active', token_count: 260,
  },

  {
    namespace: 'regulatory', jurisdiction: 'UK',
    document_type: 'regulation',
    source_document: 'PRIN 2A — Consumer Duty (Vulnerable Customers)',
    title: 'Consumer Duty 2023 — Vulnerable customer obligations',
    chunk_text: `FCA Guidance FG21/1 (Guidance for Firms on the Fair Treatment of Vulnerable Customers) defines a vulnerable customer as someone who, due to their personal circumstances, is especially susceptible to harm — particularly when a firm is not acting with appropriate levels of care.

Drivers of vulnerability (FG21/1 paragraph 2.2) include: health (mental or physical health conditions), life events (bereavement, job loss, relationship breakdown), resilience (low ability to withstand financial or emotional shocks), and capability (low literacy, numeracy, digital skills, or English language proficiency).

Obligations under Consumer Duty for vulnerable customers:
- Firms must have a strategy for identifying and responding to vulnerability. This must go beyond asking customers to self-identify.
- Products and services must be designed to meet the needs of vulnerable customers in the target market.
- Communications must be tailored for those with lower literacy, cognitive impairment, or other communication needs. Plain English, simple summaries, and non-digital channels must be available.
- Consumer support processes must not create additional barriers for vulnerable customers. Wait times, complex IVR systems, and online-only processes may disproportionately harm vulnerable customers.
- Frontline staff must be trained to recognise indicators of vulnerability and respond appropriately: slowing down, offering extra time, suggesting alternative contact methods, or escalating to a specialist.
- Where a customer discloses a vulnerability, firms must keep a proportionate record and ensure that information is accessible to staff handling subsequent contacts.`,
    confidence_tier: 'verified', status: 'active', token_count: 245,
  },

  // ── PROD 4 — Product governance ─────────────────────────────────────────────

  {
    namespace: 'regulatory', jurisdiction: 'UK',
    document_type: 'regulation',
    source_document: 'PROD 4.2',
    title: 'PROD 4.2 — Manufacturer product governance obligations',
    chunk_text: `PROD 4.2.1: A manufacturer of a retail investment product or a mass market product must maintain, operate and review a product approval process before any product is made available to customers. The approval process must consider the product's compatibility with the identified target market.

PROD 4.2.2: Target market identification. A manufacturer must identify, at a sufficiently granular level, the target market for each product. The target market must specify the type of customers for whom the product is designed: their objectives, financial situation, needs and characteristics. Manufacturers must also identify customers for whom the product is NOT designed (the "negative target market" or "anti-target market").

PROD 4.2.3: Product value assessment. Under Consumer Duty, manufacturers must carry out a fair value assessment for each product. The assessment must demonstrate that the expected benefits to consumers are reasonable relative to the total cost (price, charges, and any indirect costs). A product that generates high returns for the firm but low consumer benefit is unlikely to represent fair value.

PROD 4.2.4: Periodic review. Manufacturers must periodically review products to assess whether they continue to meet the needs of the target market, whether distribution channels remain appropriate, and whether the value assessment remains valid. Reviews must be triggered by significant changes to the product, market, or regulatory environment.

PROD 4.2.5: Documentation. The target market definition, value assessment, and review outcomes must be documented and made available to distributors on request. Manufacturers must cooperate with distributors' oversight obligations.`,
    confidence_tier: 'verified', status: 'active', token_count: 235,
  },

  // ── PSR — APP fraud reimbursement ────────────────────────────────────────────

  {
    namespace: 'regulatory', jurisdiction: 'UK',
    document_type: 'regulation',
    source_document: 'PSR PS23/3',
    title: 'PSR PS23/3 — Mandatory APP fraud reimbursement (effective 7 October 2024)',
    chunk_text: `The Payment Systems Regulator (PSR) Policy Statement PS23/3 introduced mandatory reimbursement for Authorised Push Payment (APP) fraud via Faster Payments. The rules took effect on 7 October 2024.

Scope: The requirement applies to all credit and payment institutions (PSPs) that offer Faster Payments accounts to consumers, microenterprises, and charities. It does not apply to international transfers, CHAPS payments, or SWIFT transfers.

Reimbursement obligation: Sending PSPs must reimburse victims of APP fraud in full, up to a maximum of £85,000 per claim. The minimum claim threshold is £0 (there is no de minimis floor in the PSR rules, though some PSPs have voluntarily applied a £100 minimum).

50/50 cost split: The receiving PSP (the PSP holding the fraudster's account) must reimburse 50% of the claim value to the sending PSP within the resolution timescales. This creates a shared financial incentive for both PSPs to prevent fraud.

Standard of caution: A consumer loses their right to reimbursement (in whole or in part) if they: (a) failed to heed a specific warning from their PSP about the payment; (b) ignored a warning from a national fraud awareness campaign that was specifically relevant to the scam type; (c) did not report the fraud to the PSP promptly after becoming aware of it; or (d) acted with gross negligence.

Exceptions: First-party fraud (where the "victim" is complicit), claims where the consumer acted with gross negligence, claims older than 13 months from the date of the final transaction, and claims by PSPs themselves.

Vulnerable customers: A higher standard of care applies when assessing whether a vulnerable customer met the standard of caution. The PSR expects PSPs to give vulnerable customers the benefit of the doubt in borderline cases.

Resolution timescales: Sending PSPs must resolve claims within 5 business days in most cases, or up to 35 business days for complex cases requiring investigation with the receiving PSP.`,
    confidence_tier: 'verified', status: 'active', token_count: 290,
  },

  // ── FCA Consumer Credit: irresponsible lending and FOS outcomes ──────────────

  {
    namespace: 'regulatory', jurisdiction: 'UK',
    document_type: 'guidance',
    source_document: 'FOS — Irresponsible Lending Assessment Framework',
    title: 'FOS assessment approach for irresponsible lending complaints',
    chunk_text: `The Financial Ombudsman Service (FOS) receives a high volume of complaints about irresponsible or unaffordable lending. The FOS applies the following framework when assessing whether a lender breached its creditworthiness obligations under CONC 5.

Key questions the FOS asks:
1. Did the firm obtain sufficient information about the customer's income, expenditure, and existing credit commitments to carry out a reasonable creditworthiness assessment?
2. Would a reasonable lender, with that information and using appropriate checks (credit file, open banking, stated income verification), have concluded the credit was affordable?
3. Did the firm ignore obvious red flags such as: multiple recent credit applications, existing arrears on other accounts, declared income insufficient to cover the credit payments, or previous loans to the same customer that were never fully repaid?

Remediation expectations where upholding:
- Refund of all interest and charges on the loan.
- Write-off of any outstanding balance (if the principal has been repaid, only interest and charges are refunded).
- Removal of any adverse credit reporting related to the loan.
- In cases of significant distress, an additional compensatory payment typically in the range of £50 to £300 (higher in exceptional cases).

High-cost short-term credit (HCSTC) — payday and short-term loans:
- FOS applies heightened scrutiny to repeat lending (rolling over or relending shortly after repayment of previous loans to the same customer). Repeat lending may constitute irresponsible lending even where the initial loan was affordable, if the pattern suggests dependency.`,
    confidence_tier: 'verified', status: 'active', token_count: 260,
  },

  {
    namespace: 'regulatory', jurisdiction: 'UK',
    document_type: 'guidance',
    source_document: 'FCA Dear CEO — Motor Finance Discretionary Commission',
    title: 'FCA motor finance and discretionary commission arrangements — complaint handling guidance',
    chunk_text: `In January 2024, the FCA announced a review into historical discretionary commission arrangements (DCA) in motor finance, following the Court of Appeal's findings in Hopcraft v Close Brothers and related cases. The FCA suspended the 8-week response deadline for motor finance DCA complaints.

Key points for complaint handling:
- Firms must pause all final responses on complaints about motor finance DCAs pending the FCA's outcome (expected H1 2025 as of Q1 2024, now under ongoing review).
- Firms must still acknowledge receipt within 3 days and write to complainants every 40 working days updating them on progress.
- Firms should not pay out redress unilaterally while the review is ongoing, unless the firm is required to by a court order.
- Customers must be clearly notified that they are not timed out of FOS referral — the 6-month clock does not run while the FCA's pause is in place.
- The FCA has indicated it will consult on a redress scheme if the review finds widespread consumer harm.

Scope of DCA complaints: A complaint qualifies if the customer had a motor finance agreement sold via a broker who received a discretionary commission from the lender — i.e. commission where the broker could set the interest rate and earn more commission by charging a higher rate.`,
    confidence_tier: 'verified', status: 'active', token_count: 225,
  },

  {
    namespace: 'regulatory', jurisdiction: 'UK',
    document_type: 'regulation',
    source_document: 'CONC 8',
    title: 'CONC 8 — Debt counselling, adjusting and collection',
    chunk_text: `CONC 8.2: A firm that carries on debt counselling or debt adjusting activities must ensure its representatives have sufficient knowledge and competence to provide the service.

CONC 8.3: A firm must not advise a customer to take out a debt management plan (DMP) or individual voluntary arrangement (IVA) unless it has assessed that this is in the customer's interest. The assessment must consider whether simpler options (such as a reduced payment plan with the existing creditor) would serve the customer better at lower cost.

Debt collection conduct (CONC 7 and CONC 8 combined effect):
- A firm must not use misleading or oppressive collection methods.
- A firm must not misrepresent the amount of debt owed, the legal consequences of non-payment, or the identity or authority of the collecting entity.
- A firm must not contact family members, friends, or employers to discuss a customer's debt unless the customer has explicitly consented.
- A firm must provide a copy of the credit agreement and a full account statement within 12 working days of a section 77/78 Consumer Credit Act request. During the period where the firm has not complied with such a request, it may not enforce the agreement.
- Statute-barred debts (typically 6 years in England and Wales under the Limitation Act 1980): a firm must not issue legal proceedings for a statute-barred debt. The firm may still make contact to request voluntary repayment but must not threaten or imply legal action.`,
    confidence_tier: 'verified', status: 'active', token_count: 230,
  },

  {
    namespace: 'regulatory', jurisdiction: 'UK',
    document_type: 'regulation',
    source_document: 'FCA DISP — FOS Jurisdiction and Eligible Complainants',
    title: 'DISP 2 — Who can complain to FOS and what is covered',
    chunk_text: `DISP 2.7 — Eligible complainants: The FOS can only consider complaints from "eligible complainants." For most regulated activities, eligible complainants are:
(a) Consumers (private individuals acting outside their trade or profession);
(b) Microenterprises (fewer than 10 employees and annual turnover or balance sheet below €2 million);
(c) Charities with annual income below £6.5 million;
(d) Trustees of trusts with net assets below £5 million;
(e) Small businesses with annual turnover up to £6.5 million (for complaints about payment services and e-money only, from April 2019).

DISP 2.8 — Jurisdiction — activity coverage: The FOS has jurisdiction over regulated activities, consumer credit activities, payment services, and electronic money activities carried on from UK establishments.

DISP 2.3 — Referral time limits: A complainant must refer a complaint to FOS within 6 months of the date of the firm's final response letter, or within 6 years of the event complained about (whichever is later). The FOS may exercise discretion to accept a complaint outside these time limits where it considers it just and equitable to do so.

DISP 2.6 — Concurrent court proceedings: The FOS cannot normally consider a complaint where court proceedings have commenced on the same matter. Where a court claim has been issued, the matter falls outside FOS jurisdiction unless the court proceedings are withdrawn or stayed.`,
    confidence_tier: 'verified', status: 'active', token_count: 225,
  },
];

async function seedFCARegulations() {
  const client = await pool.connect();
  try {
    let inserted = 0;
    let skipped = 0;

    for (const chunk of chunks) {
      const { rowCount } = await client.query(
        `INSERT INTO knowledge_chunks
           (namespace, jurisdiction, document_type, source_document, title,
            chunk_text, confidence_tier, status, token_count)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (source_document, title) DO NOTHING`,
        [
          chunk.namespace, chunk.jurisdiction, chunk.document_type,
          chunk.source_document, chunk.title, chunk.chunk_text,
          chunk.confidence_tier, chunk.status, chunk.token_count,
        ]
      );
      if (rowCount > 0) inserted++; else skipped++;
    }

    console.log(`FCA regulations seed complete: ${inserted} inserted, ${skipped} skipped.`);
  } finally {
    client.release();
    await pool.end();
  }
}

seedFCARegulations().catch((err) => { console.error(err); process.exit(1); });
