/**
 * Seed: regulatory knowledge base
 *
 * Inserts pre-curated knowledge_chunks for UK, India, and EU jurisdictions
 * plus a global namespace. All entries are confidence_tier=verified and
 * bypass the document ingestion pipeline — they are authoritative baseline
 * entries maintained by the compliance team.
 *
 * Idempotent: uses ON CONFLICT (source_document, title) DO NOTHING.
 */

import { pool } from '../pool.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function approxTokens(text) {
  return Math.ceil(text.length / 4);
}

// ─── Chunk definitions ────────────────────────────────────────────────────────

const CHUNKS = [

  // ══════════════════════════════════════════════════════════════════════════
  // UK — FCA regulatory framework
  // ══════════════════════════════════════════════════════════════════════════

  {
    namespace:       'regulatory',
    jurisdiction:    'UK',
    document_type:   'guidance',
    source_document: 'DISP 1.3',
    title:           'Complaint Definition and Identification of Implicit Complaints',
    chunk_text: `\
DISP 1.3 — Complaint definition and implicit complaints (FCA Dispute Resolution sourcebook)

A complaint is defined as any oral or written expression of dissatisfaction, whether justified or not, from or on behalf of a person about the provision of, or failure to provide, a financial service or a redress determination, which alleges that the complainant has suffered (or may suffer) financial loss, material distress or material inconvenience.

Firms must not impose technical or formal requirements as a condition for treating a communication as a complaint. A communication does not need to use the word "complaint" to be treated as one.

Implicit complaints (DISP 1.3.3): Firms are required to recognise implicit complaints — expressions of dissatisfaction that do not use the word "complaint" but indicate customer dissatisfaction that may amount to a complaint. Staff must be trained to identify implicit complaints and route them through the firm's complaints handling process. A failure to identify and handle an implicit complaint is itself a breach of DISP.

Key indicators of implicit complaint status:
- Customer frustration about a product, service, or decision outcome
- Language suggesting the firm has acted unfairly or failed in its obligations
- Any request that the firm review or reconsider a decision
- Expressions of intent to escalate (mentioning FOS, regulators, or legal action)
- Emotional distress or references to personal hardship caused by the firm's action or inaction

Complaints may be received through any channel — telephone, email, letter, webchat, social media, or in branch. The channel of receipt does not affect the obligation to handle the communication as a complaint.`,
  },

  {
    namespace:       'regulatory',
    jurisdiction:    'UK',
    document_type:   'guidance',
    source_document: 'DISP 1.6',
    title:           'Complaint Handling Timescales — Acknowledgement and Final Response',
    chunk_text: `\
DISP 1.6 — Complaint handling timescales (FCA Dispute Resolution sourcebook)

Mandatory timescales for all consumer credit and general financial services complaints (excluding payment services):

1. Acknowledgement (DISP 1.6.1): Firms must acknowledge a complaint promptly. FCA guidance treats receipt within 3 business days as good practice, with 5 business days as the outer limit for written acknowledgement. The acknowledgement must confirm receipt and provide the name or job title of the individual handling the complaint.

2. Final response deadline (DISP 1.6.2): A final response must be issued within 8 weeks of the date the complaint was received. The 8-week clock starts on the day the complaint is received, regardless of whether the firm treats the communication as a complaint from that date.

3. Holding response: Where the firm cannot issue a final response within 8 weeks, it must issue a written holding response explaining: (a) why it is not yet in a position to respond; (b) when it expects to be in a position to do so; and (c) that the complainant may refer the complaint to the Financial Ombudsman Service (FOS) if dissatisfied with the delay.

4. FOS referral trigger: Once 8 weeks have elapsed without a final response, the complainant has the unconditional right to refer to FOS. This right must be notified to the complainant in the holding response and in any subsequent correspondence.

5. Payment services and e-money (DISP 1.6.2A): Shortened timescale — final response within 15 business days; extendable to 35 business days in exceptional circumstances with written notification to the complainant.

Failure to meet DISP 1.6 timescales is a reportable breach and constitutes a basis for FOS to investigate the complaint on its merits regardless of outcome.`,
  },

  {
    namespace:       'regulatory',
    jurisdiction:    'UK',
    document_type:   'guidance',
    source_document: 'DISP 2.8',
    title:           'FOS Referral Rights and Obligation to Inform Customers',
    chunk_text: `\
DISP 2.8 — FOS referral rights and the obligation to inform customers (FCA Dispute Resolution sourcebook)

Trigger events for FOS notification: Firms are required to inform eligible complainants of their right to refer to the Financial Ombudsman Service (FOS) when: (a) the firm issues its final response; or (b) 8 weeks have elapsed since receipt of the complaint without a final response.

Mandatory content of FOS notification (DISP 2.8.7): The written notice must include:
- The FOS name, website address, and postal address
- A statement that the firm is covered by FOS
- Confirmation that the FOS service is free to the complainant
- A statement that the complainant has 6 months from receipt of the final response to refer to FOS
- Where applicable, confirmation that the complaint can be referred immediately (where 8 weeks have elapsed)

Eligible complainants include: consumers; micro-enterprises (fewer than 10 employees, turnover or balance sheet not exceeding €2 million); small charities (annual income below £6.5 million); small trusts (net assets below £5 million); and small businesses meeting prescribed thresholds.

FOS jurisdiction: FOS has jurisdiction over complaints referred within 6 years of the act or omission (or 3 years from when the complainant knew or could reasonably have known of the cause, if later).

Prohibited conduct: Firms must not take any steps to dissuade eligible complainants from referring their complaint to FOS. Firms must cooperate fully with FOS investigations, providing all requested documents and information within prescribed timeframes. Non-cooperation with FOS is itself a regulatory breach.

FOS awards: FOS can award compensation for financial loss, distress, and inconvenience. Awards are binding on the firm (not the complainant) unless the firm successfully challenges the determination in court within 28 days.`,
  },

  {
    namespace:       'regulatory',
    jurisdiction:    'UK',
    document_type:   'guidance',
    source_document: 'CONC 7',
    title:           'Fair Treatment of Customers in Arrears — Forbearance Obligations',
    chunk_text: `\
CONC 7 — Fair treatment of customers in arrears (FCA Consumer Credit sourcebook, Chapter 7)

CONC 7 governs the treatment of customers who are in arrears or experiencing payment difficulties.

Proactive engagement (CONC 7.3.2): Firms must contact customers as soon as practicable after an arrear is identified and must not delay in a way that allows arrears to escalate unnecessarily.

Forbearance obligation (CONC 7.3.4–7.3.5): Firms must consider the customer's circumstances and must grant appropriate forbearance. Forbearance options include: payment deferral; reduced or token payment plans; temporary suspension of interest and charges; capitalisation of arrears into a longer-term arrangement; partial or full debt write-off in appropriate cases. Forbearance must be genuinely affordable — an arrangement that the customer cannot maintain does not constitute adequate forbearance.

Debt advice referral (CONC 7.3.7): Firms must, where appropriate, advise customers to seek free debt advice and must provide details of free debt advice services (StepChange, Citizens Advice, National Debtline, MoneyHelper).

Breathing Space (Debt Respite Scheme): Firms must recognise Breathing Space notifications and must suspend most enforcement action and charge-escalation for up to 60 days for eligible customers. A separate 60-day mental health crisis moratorium also applies.

Prohibited conduct (CONC 7.9): Firms must not:
- Contact customers at unreasonable hours (outside 0800–2100 on weekdays; 0900–1300 on Saturdays; no contact on Sundays or bank holidays without prior agreement)
- Use aggressive, threatening, or misleading language about consequences of non-payment
- Imply that legal action will be taken where no such decision has been made
- Visit a customer's home without prior agreement
- Contact third parties (employers, family members) to obtain payment, except where the third party is the customer's authorised representative

Vulnerability in arrears (CONC 7 + Consumer Duty): Customers in financial difficulty frequently exhibit characteristics of vulnerability. Firms must apply additional care, adapt communication approaches, and consider the customer's personal circumstances when determining the appropriate forbearance response.`,
  },

  {
    namespace:       'regulatory',
    jurisdiction:    'UK',
    document_type:   'guidance',
    source_document: 'FCA PS22/9 Consumer Duty',
    title:           'Consumer Duty — The Four Outcome Rules',
    chunk_text: `\
Consumer Duty — The four outcome rules (FCA PS22/9, effective 31 July 2023)

The Consumer Duty requires firms to deliver good outcomes for retail customers across four defined outcome areas. The duty applies throughout the customer lifecycle, including at the point of complaint handling.

1. Products and Services Outcome: Products and services must be designed to meet the needs, characteristics, and objectives of the identified target market. Firms must not include features that are likely to harm customers. Ongoing product reviews must assess whether the product continues to perform as expected and whether the target market definition remains appropriate.

2. Price and Value Outcome: The price charged must represent fair value relative to the benefits provided to the customer. Firms must conduct value assessments from the customer's perspective, considering the total cost (including ancillary charges), the quality of the product or service, and the reasonable expectations of the target market. Cross-subsidisation models that result in poor value for identifiable customer groups are not compliant with this outcome.

3. Consumer Understanding Outcome: Firms must communicate in a way that enables retail customers to make informed decisions. Communications must be clear, fair, and not misleading. Timing, format, and channel must be appropriate to the customer's characteristics and the nature of the product. Firms should test and monitor customer comprehension where possible, particularly for complex products or customer groups with lower financial capability.

4. Consumer Support Outcome: Firms must provide a level of support that meets retail customers' needs throughout the product lifecycle. This includes: accessible and effective complaints processes; the ability to reach a human where needed; processes that do not create unnecessary barriers or friction; and adequate support for customers facing payment difficulties or other challenges.

Cross-cutting rules: In addition to the four outcomes, firms must act to deliver good outcomes (not merely avoid bad ones), act in good faith toward retail customers, and avoid causing foreseeable harm.`,
  },

  {
    namespace:       'regulatory',
    jurisdiction:    'UK',
    document_type:   'guidance',
    source_document: 'FCA PS22/9 Consumer Duty',
    title:           'Consumer Duty — Vulnerability Guidance and Obligations',
    chunk_text: `\
Consumer Duty — Vulnerability guidance (FCA PS22/9 and FCA FG21/1)

The FCA defines a vulnerable customer as "someone who, due to their personal circumstances, is especially susceptible to harm — particularly when a firm is not acting with appropriate levels of care."

Four drivers of vulnerability (FCA FG21/1):
1. Health: Physical or mental health conditions affecting ability to engage with financial services
2. Life events: Bereavement, job loss, relationship breakdown, caring responsibilities
3. Resilience: Low financial resilience; inability to absorb financial or emotional shocks
4. Capability: Low knowledge of financial matters, low confidence, low digital skills, literacy challenges

Firm obligations:

Understanding: Firms must understand the nature and scale of vulnerability in their customer base and take this into account in product design, communications, and customer support processes.

Skilled staff: Customer-facing staff must be trained to recognise vulnerability indicators — in voice tone, written language, payment behaviour, and account history — and to respond with appropriate adjustments.

Flexible processes: Processes must accommodate vulnerability. This includes: accessible communication formats (large print, audio, BSL); flexible payment arrangements; the ability for an authorised third party (carer, representative) to act on the customer's behalf; and extended deadlines where the customer's circumstances require.

Monitoring outcomes: Firms must monitor outcomes for vulnerable customers separately and compare with outcomes for non-vulnerable customers to identify disparities. Where disparities are identified, firms must take corrective action.

Complaints handling: A complaint itself is a vulnerability signal. Indicators include: emotional language; references to health difficulties or personal hardship; communications from third parties acting on the customer's behalf; or requests for accessible format responses. Vulnerability identified during complaint handling must be recorded and used to inform the response approach and any redress assessment.`,
  },

  {
    namespace:       'regulatory',
    jurisdiction:    'UK',
    document_type:   'guidance',
    source_document: 'FCA Dear CEO Letter — Consumer Credit Arrears 2024',
    title:           'FCA Supervisory Expectations on Consumer Credit Arrears Handling',
    chunk_text: `\
FCA Dear CEO letter on consumer credit arrears handling (2024) — key supervisory expectations

The FCA's 2024 Dear CEO letter to consumer credit firms set out the following priority areas following supervisory review of arrears handling practices:

1. Proactive identification of financial difficulty: Firms must not wait for default before engaging customers. Data from payment behaviour (missed payments, minimum-only payments, frequent overdraft use), open banking signals, and customer-initiated contact should be used to identify emerging financial difficulty before accounts formally enter arrears.

2. Quality and sustainability of forbearance: Forbearance arrangements must be genuinely affordable and sustainable. The FCA found instances of firms putting customers into arrangements that they could not maintain, effectively deferring rather than resolving the problem. Income and expenditure assessments must be conducted and documented. Arrangements that last less than 3 months before breaking are a red flag for inadequate assessment.

3. Long-term arrears management: Customers who have been in continuous arrears for 12 months or more require a specific account review. The review must consider whether continued debt collection is appropriate, whether the account should be referred for debt advice intervention, or whether a write-off or settlement would produce a better customer outcome.

4. Quality of arrears communications: Arrears letters and automated messages must be empathetic, clear about the options available, and must include signposting to free debt advice services (StepChange, Citizens Advice, National Debtline, MoneyHelper). The FCA found that many firms used legalistic or threatening language that was inconsistent with Consumer Duty.

5. Collections practices: Firms must review contact frequency policies, automated messaging systems, and collections scripting for compliance with CONC 7 and Consumer Duty. Excessive contact, pressure tactics, and failure to escalate to a specialist vulnerability team when signals are present are priority concerns.

6. Board-level accountability: Firms must produce MI at board level covering arrears handling quality, forbearance rates, long-term arrears volumes, and complaint outcomes in this area. Good outcomes must be evidenced, not assumed.`,
  },

  {
    namespace:       'regulatory',
    jurisdiction:    'UK',
    document_type:   'guidance',
    source_document: 'FOS Technical Guidance — Irresponsible Lending',
    title:           'FOS Assessment Framework for Irresponsible Lending Complaints',
    chunk_text: `\
FOS approach to irresponsible lending complaints — standard assessment factors

The Financial Ombudsman Service applies the following framework when assessing irresponsible lending complaints:

1. Affordability at origination: FOS examines whether the firm conducted an adequate affordability assessment at the point of sale. This requires evidence of income verification, expenditure assessment (including existing debt commitments), and assessment of the customer's overall financial position. FOS applies the standards of the time — it considers what a reasonable lender in the same position ought to have done with the information available or that should have been obtained.

2. Credit limit and repeat lending: For revolving credit, FOS scrutinises whether credit limit increases were assessed appropriately, particularly for customers showing signs of financial difficulty. For personal loans, FOS applies heightened scrutiny to repeat lending — particularly where the repayment of each loan reduced the customer's effective disposable income and where the pattern suggests the loans were unaffordable in aggregate.

3. Signs of financial distress visible to the lender: FOS considers whether the firm missed or ignored signs of distress visible in account history — including: minimum payment behaviour over extended periods; frequent overlimit use; returned direct debits; parallel overdraft charges on the same bank account. Firms are expected to have and use processes to identify these signals.

4. Standard remediation for upheld complaints: Where FOS upholds an irresponsible lending complaint, standard remediation is: refund of all interest and charges paid on the unaffordable element; removal of any outstanding balance; correction of adverse credit file entries; and, where distress and inconvenience is established, additional compensation of typically £100–£250 (higher in cases of significant harm).

5. Burden of proof: The burden lies on the firm to demonstrate it conducted an adequate affordability assessment. Where the firm cannot produce documentation of its assessment process or the assessment performed for a specific customer, FOS is likely to find against the firm.

6. Consistent remediation: FOS expects firms to apply consistent remediation to similar complaints. Firms that apply inconsistent approaches — offering more to customers who escalate — risk having FOS take a firmer line on all complaints in the same portfolio.`,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // India — RBI regulatory framework
  // ══════════════════════════════════════════════════════════════════════════

  {
    namespace:       'regulatory',
    jurisdiction:    'IN',
    document_type:   'circular',
    source_document: 'RBI Integrated Ombudsman Scheme 2021 (RBI/2021/117)',
    title:           'RBI Integrated Ombudsman Scheme — Scope, Timelines, and Escalation',
    chunk_text: `\
RBI Integrated Ombudsman Scheme 2021 (RBI/2021/117) — scope, timelines, and escalation

The RBI Integrated Ombudsman Scheme 2021 consolidates the Banking Ombudsman Scheme, the Ombudsman Scheme for NBFCs, and the Ombudsman Scheme for Digital Transactions into a single, jurisdiction-neutral framework.

Scope: Covers all complaints against RBI-regulated entities (scheduled commercial banks, RRBs, cooperative banks, NBFCs, payment system participants, and credit information companies) relating to deficiency in service. Specific complaint grounds include: failure to adhere to fair practice codes; mis-selling of financial products; unauthorised debits; failure to implement ombudsman awards; non-adherence to RBI instructions on interest rates, processing fees, and recovery practices.

Internal escalation prerequisite: Complaints are admissible to the Ombudsman only if the customer has first filed a complaint with the regulated entity AND either: (a) received no response within 30 days; or (b) received a response that is unsatisfactory. Complaints filed within 30 days of the entity's response are not admissible.

Filing: Complaints can be filed via: the RBI CMS portal (cms.rbi.org.in); the CMS app; the toll-free number 14448; or by post. The complainant must provide their name, address, regulated entity name, account details, and a description of the deficiency.

Timelines: The Ombudsman aims to resolve complaints within 30 days of receipt of complete information. Complex cases or systemic issues may extend to 90 days. The Ombudsman may call for information from both parties and issue interim orders.

Awards: The Ombudsman may award: compensation up to INR 20 lakh for actual loss; up to INR 1 lakh for mental agony and harassment. Awards are binding on the regulated entity unless challenged in a court of competent jurisdiction within 30 days of receipt.

Exclusions: Complaints relating to internal HR matters, criminal proceedings, sub judice matters, or complaints beyond 1 year from the entity's final response are excluded.`,
  },

  {
    namespace:       'regulatory',
    jurisdiction:    'IN',
    document_type:   'circular',
    source_document: 'RBI Master Direction — Grievance Redress Mechanism in Regulated Entities 2023',
    title:           'NBFC Internal Grievance Redressal Requirements',
    chunk_text: `\
RBI Master Direction on Grievance Redressal for NBFCs (2023) — internal resolution requirements

The Master Direction establishes minimum standards for internal grievance redressal that all NBFCs must implement:

Grievance Redressal Officer (GRO): Every NBFC must designate a GRO at Senior Management level. The GRO's full name, contact number, and email address must be displayed prominently at all customer service touchpoints: branch premises, website homepage, mobile app, loan documentation, and welcome kits.

Complaint receipt timelines:
- Acknowledgement: Within 3 working days of receipt through any channel
- Resolution: Within 30 calendar days of receipt
- Delay notification: Where resolution is not possible within 30 days, the customer must receive written notification with a revised timeline and the reason for the delay

Tracking and documentation: NBFCs must maintain a complaint register (or CRM system) capturing: date received; channel; nature of the complaint; date of acknowledgement; escalation history; date of resolution; and customer satisfaction status. The register must be available for RBI inspection.

Internal escalation structure: A two-tier escalation is required. First-level: branch or relationship team resolution within 15 days. Second-level: escalation to GRO if unresolved within 15 days or on customer request. The GRO's decision must be communicated in writing within the 30-day deadline.

Board oversight: The Board's Customer Service Committee must review complaint data quarterly, including complaint volumes by category, root cause analysis, and systemic issues. The Annual Report must disclose complaint statistics in the prescribed format.

Ombudsman referral notification: Where the complaint is not resolved within 30 days, the NBFC must proactively inform the customer — in writing — of their right to approach the RBI Integrated Ombudsman and provide the filing details (cms.rbi.org.in, 14448).`,
  },

  {
    namespace:       'regulatory',
    jurisdiction:    'IN',
    document_type:   'regulation',
    source_document: 'Digital Personal Data Protection Act 2023',
    title:           'DPDP Act 2023 — Key Obligations for Financial Services Firms',
    chunk_text: `\
Digital Personal Data Protection Act 2023 (DPDPA) — key obligations for financial services firms

The DPDPA governs the processing of digital personal data of individuals in India.

Lawful basis for processing: Personal data may only be processed on the basis of: (a) free, specific, informed, unconditional, and unambiguous consent; or (b) certain legitimate uses enumerated in the Act (including compliance with legal obligations, state functions, medical emergencies, and employment-related processing). For financial services, processing for loan origination, credit assessment, and servicing typically relies on consent plus compliance with RBI and other regulatory obligations.

Consent requirements: Consent must be granular — firms cannot bundle consent for core service delivery with consent for marketing, profiling, or data sharing. Consent dashboards or consent management systems are expected for firms processing data at scale.

Data Principal rights: Customers (Data Principals) have the right to:
- Access: Obtain a summary of personal data being processed and the purposes of processing
- Correction and erasure: Request correction of inaccurate data and erasure of data no longer needed
- Grievance redress: File a complaint with the firm and, if unresolved, with the Data Protection Board of India
- Nomination: Nominate a representative to exercise data rights in case of incapacity or death

Data Fiduciary obligations for financial firms:
- Implement appropriate technical and organisational measures (encryption, access controls, audit trails) to protect personal data
- Respond to Data Principal requests within a reasonable period (urgent correction/erasure: 72 hours; others: as prescribed)
- Appoint a Data Protection Officer (required for Significant Data Fiduciaries)
- Conduct Data Protection Impact Assessments for high-risk processing activities

Breach notification: Significant Data Fiduciaries must notify the Data Protection Board and affected Data Principals of personal data breaches without undue delay.

Retention limitation: Personal data must not be retained beyond what is necessary. Complaint records must be retained for the minimum period required by RBI and other applicable regulations, after which they must be deleted.`,
  },

  {
    namespace:       'regulatory',
    jurisdiction:    'IN',
    document_type:   'circular',
    source_document: 'RBI Master Circular — Fair Practices Code for NBFCs',
    title:           'RBI Fair Practice Code — Communication Standards and Prohibited Practices',
    chunk_text: `\
RBI Fair Practices Code for NBFCs (Master Circular, updated annually) — communication standards and prohibited practices

The Fair Practices Code establishes minimum standards for NBFC conduct toward customers across the loan lifecycle.

Loan application and disclosure: All-in cost of credit — including processing fees, documentation charges, insurance premiums, and any other ancillary charges — must be disclosed in a standardised format before loan disbursement. Sanction letters must be provided in the vernacular language or English as preferred by the borrower.

Post-disbursement conduct: Any change to loan terms (interest rate, fees, repayment schedule) post-disbursement requires prior written consent from the borrower. Disbursement must not be conditional on the borrower purchasing insurance or other add-on products from the NBFC or its associates unless the borrower explicitly opts in.

Recovery communication standards:
- Recovery agents may only contact borrowers between 0700 and 1900 hours local time
- Contact must be through channels disclosed at onboarding (phone, email, registered address)
- Agents must identify themselves and the NBFC they represent at the start of every interaction
- All contacts must be logged in the NBFC's collections management system

Prohibited practices: NBFCs and their agents must not:
- Use threats, intimidation, harassment, or abusive language
- Seize collateral without following prescribed legal process
- Publish photographs or other personal information of borrowers in relation to loan default
- Contact borrowers' family members, employers, colleagues, or references in a threatening or intrusive manner
- Make false statements about legal action or credit bureau consequences
- Call borrowers' mobile phones outside permitted hours or with excessive frequency (more than 3 attempts per day is considered excessive under RBI guidance)

Interest rate transparency: Interest rates must be communicated as an annualised percentage rate. Risk-based pricing differentials must be published on the NBFC's website. Hidden charges are prohibited.`,
  },

  {
    namespace:       'regulatory',
    jurisdiction:    'IN',
    document_type:   'circular',
    source_document: 'RBI Guidelines on Digital Lending (RBI/2022/103)',
    title:           'Digital Lending Guidelines 2022 — Key Consumer Protection Obligations',
    chunk_text: `\
RBI Digital Lending Guidelines (RBI/2022/103, effective September 2022) — consumer protection obligations

Lender of record responsibility: Where NBFCs partner with Lending Service Providers (LSPs) — digital lending apps, fintech platforms, digital marketplaces — the regulated NBFC remains fully responsible for compliance with all RBI guidelines. The NBFC must maintain oversight of LSP conduct and ensure LSP contracts contain binding consumer protection provisions.

Key Fact Statement (KFS): A KFS in RBI-prescribed standardised format must be provided to the borrower before loan execution. The KFS must disclose: Annual Percentage Rate (APR, covering all costs); total amount payable; repayment schedule; all applicable fees and charges; the cooling-off period; and the grievance redressal contact.

Data collection restrictions: LSPs and NBFCs may only collect data that is strictly necessary for the loan transaction. The following are prohibited without explicit, separate consent: access to the borrower's contact list; access to media files, call logs, or messages; collection of biometric data beyond what is needed for KYC; real-time device location tracking.

Repayment flows: All loan repayments must be processed through a regulated payment system directly to the NBFC's designated account. Repayments to LSP accounts are prohibited.

Cooling-off period: Borrowers must be given a cooling-off period during which they may cancel the loan and repay the principal without penalty:
- Loans with tenure > 3 years: minimum 3 days
- All other loans: minimum 1 day
The cooling-off period must be prominently disclosed in the KFS.

Pre-payment: Pre-payment terms and any applicable charges must be disclosed upfront. Pre-payment charges are prohibited in certain circumstances (e.g., floating-rate loans to individual borrowers).

Recovery practices: Recovery must comply with the NBFC Fair Practices Code. Automated recovery messages must identify the NBFC, not the LSP. Threatening or misleading language in automated communications is prohibited.`,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // EU — EBA and GDPR framework
  // ══════════════════════════════════════════════════════════════════════════

  {
    namespace:       'regulatory',
    jurisdiction:    'EU',
    document_type:   'guidance',
    source_document: 'EBA/GL/2012/01',
    title:           'EBA Complaint Handling Guidelines — Scope, Timelines, and Reporting',
    chunk_text: `\
EBA Guidelines on the Handling of Complaints by Credit Institutions (EBA/GL/2012/01)

Scope: Applies to all credit institutions operating within the European Union. National competent authorities (NCAs) are expected to incorporate these guidelines into national supervisory frameworks. The guidelines govern the internal handling of complaints — not the operation of external ADR schemes, which are covered by the ADR Directive 2013/11/EU.

Complaint definition: A complaint is any expression of dissatisfaction addressed to a credit institution by a person relating to the provision of a financial service or product. Institutions must not impose formal requirements (use of specific wording, prescribed forms) as a condition for treating a communication as a complaint.

Acknowledgement: Institutions must acknowledge receipt of a complaint without undue delay. Most national implementations require acknowledgement within 5 business days.

Final response timeline: A final response must be provided within a reasonable timeframe proportionate to the complexity of the complaint. The majority of EU member state implementations align with the 8-week standard (consistent with UK FCA DISP 1.6). Where the complaint cannot be resolved within 8 weeks, the customer must be informed and given an updated timeline.

Complaint handling function: Institutions must designate a complaints management function with: sufficient resources and authority; independence from the business lines being complained about; access to all relevant information; and a clear escalation path to senior management.

Internal reporting requirements: At minimum annually, institutions must report to their management body: total complaint volumes received; breakdown by complaint category and product; average resolution times; proportion resolved at first contact; and the number of complaints referred to external ADR schemes.

Record retention: Complaint records — including all correspondence, decisions, and remediation actions — must be retained for at least 5 years, or longer if required by applicable national law.

Cross-border complaints: Where a complaint involves activities in multiple member states, institutions must have processes for coordinating responses across jurisdictions.`,
  },

  {
    namespace:       'regulatory',
    jurisdiction:    'EU',
    document_type:   'directive',
    source_document: 'ADR Directive 2013/11/EU',
    title:           'Consumer Right to Alternative Dispute Resolution',
    chunk_text: `\
EU ADR Directive 2013/11/EU — consumer right to access alternative dispute resolution

Purpose: The ADR Directive requires member states to ensure that all consumer disputes with traders (including financial institutions) can be submitted to a certified ADR entity before judicial proceedings.

Coverage: Applies to contractual disputes between consumers (individuals acting outside their trade or profession) and traders established in the EU. Financial services, including consumer credit, mortgage lending, and payment services, are fully within scope.

Firm obligations:

1. ADR affiliation: Financial institutions must be affiliated with at least one certified ADR entity and must ensure this entity has jurisdiction over disputes with their customers.

2. Consumer information at point of sale: Firms must include in their general terms and conditions: the name and website address of the relevant ADR entity; a statement that the firm is obliged to participate in ADR proceedings.

3. Consumer information post-complaint: Where a complaint is not resolved within the firm's internal complaints process, the firm must inform the consumer in writing of: the name and website address of a certified ADR entity; whether the firm will participate in ADR proceedings (note: participation is generally mandatory for financial services).

4. Online Dispute Resolution (ODR): For online transactions, the EU ODR platform (ec.europa.eu/odr) provides a central access point. Firms engaged in online commerce must include a link to the ODR platform on their website.

ADR entity standards: Certified ADR entities must be: independent and impartial; free of charge or at a nominal cost to consumers; able to resolve disputes within 90 calendar days; and able to issue reasoned decisions.

Binding vs non-binding: ADR outcomes may be binding or advisory depending on the scheme. For financial services ADR in most member states, outcomes are binding on the firm but the consumer may reject the outcome and pursue court proceedings.

Limitation periods: Member states must ensure that limitation periods are suspended during ADR proceedings.`,
  },

  {
    namespace:       'regulatory',
    jurisdiction:    'EU',
    document_type:   'regulation',
    source_document: 'GDPR (EU) 2016/679 Article 17',
    title:           'Right to Erasure as Applied to Complaint Records',
    chunk_text: `\
GDPR Article 17 — right to erasure ("right to be forgotten") as applied to complaint records

Article 17 gives data subjects the right to request erasure of their personal data in defined circumstances. The following analysis applies specifically to complaint records held by financial services firms.

Grounds for erasure: A data subject may request erasure where:
- The data is no longer necessary for the purpose for which it was collected
- Consent has been withdrawn and there is no other legal basis for processing
- The data has been processed unlawfully (without a valid legal basis)
- Erasure is required to comply with a legal obligation under Union or member state law

Retention obligation override (Article 17(3)(b)): The right to erasure does not apply where retention is necessary for compliance with a legal obligation. Financial services firms are typically subject to mandatory complaint record retention requirements imposed by their national competent authority (e.g., FCA DISP 1.9: records of complaints and responses retained for at least 3 years from receipt; for mortgage complaints, 5 years). An erasure request made during the mandatory retention period can be refused on this ground.

Response procedure: Firms must respond to erasure requests within one month (extendable by a further two months for complex requests, with notification). Where the firm refuses the request, the response must:
- Identify the specific legal obligation justifying retention
- State the applicable retention period
- Inform the data subject of their right to lodge a complaint with the supervisory authority (national DPA) and their right to a judicial remedy

Partial erasure: Where a complaint record contains personal data not subject to the retention obligation (e.g., sensitive health data collected incidentally during the complaint, biometric data), that data must be erased even if the core complaint record is retained. Data minimisation applies continuously.

Third-party notification (Article 17(2)): Where personal data has been disclosed to third parties (debt collection agencies, credit reference agencies), firms must inform those third parties of any erasure request to the extent reasonably practicable.`,
  },

  {
    namespace:       'regulatory',
    jurisdiction:    'EU',
    document_type:   'guidance',
    source_document: 'EBA/GL/2021/05 — Internal Governance Guidelines',
    title:           'Complaint Handling as a Governance Obligation',
    chunk_text: `\
EBA Guidelines on Internal Governance (EBA/GL/2021/05) — complaint handling as a governance obligation

The EBA Internal Governance Guidelines treat complaint handling as an integral part of the institution's governance and control framework, not merely an operational function.

Management body responsibility: The management body (board of directors or supervisory board) must take ultimate responsibility for the institution's compliance with consumer protection requirements, including complaint handling standards. Complaint performance metrics — volumes, resolution rates, root cause analysis, and unresolved escalations — must form part of regular management information presented to the board.

Compliance function: The compliance function must incorporate complaint handling within its monitoring and oversight programme. This includes: periodic assessments of whether complaint procedures comply with applicable regulations; review of complaint outcomes to identify potential mis-selling or conduct risks; and reporting to senior management and the management body on compliance findings.

Internal audit: The internal audit function must independently assess the effectiveness of the complaint handling framework at appropriate intervals (at least annually for material institutions). Audit scope must include: adequacy of complaint identification and routing; compliance with response timescales; quality of final responses; and effectiveness of root cause analysis processes. Audit findings must be reported directly to the management body.

Staff training: All customer-facing staff must receive training on how to identify complaints (including implicit complaints) and how to initiate the internal routing process. Specialist complaint handlers must receive additional training on regulatory requirements, resolution techniques, and escalation authority. Training records must be maintained.

Conflicts of interest: Complaint handling procedures must contain structural safeguards to ensure that staff who handled the original transaction are not solely responsible for resolving the resulting complaint. The complaint handling function must have adequate independence from revenue-generating business lines.

Root cause analysis: Institutions must maintain a systematic root cause analysis programme for complaint data, with findings feeding into: product governance reviews; process improvement initiatives; and training updates. Root cause findings must be documented and tracked to resolution.`,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // Global — cross-jurisdiction reference
  // ══════════════════════════════════════════════════════════════════════════

  {
    namespace:       'global',
    jurisdiction:    null,
    document_type:   'decision',
    source_document: 'FOS Published Decisions 2023–2024',
    title:           'FOS Decision Trends on Irresponsible Lending 2023–2024',
    chunk_text: `\
FOS published decision trends on irresponsible lending (2023–2024 analysis)

The following trends are drawn from analysis of FOS published decisions and annual complaint data for the period 2023–2024:

1. BNPL and unregulated credit equivalents: FOS has begun receiving and upholding complaints about Buy Now Pay Later providers applying standards analogous to regulated consumer credit affordability requirements, signalling that FOS will scrutinise lending practices regardless of formal regulatory status where harm is evident.

2. Repeat and sequential lending: FOS applies heightened scrutiny where a firm made multiple loans to the same customer within short periods. Even where individual loan assessments appeared procedurally compliant, FOS has found irresponsible lending established where the cumulative debt burden was unaffordable and the firm had sufficient information to identify this pattern.

3. Income verification standards: FOS has upheld complaints where firms accepted customer-declared income without reasonable verification, particularly for higher-value loans or where declared income was inconsistent with credit bureau data or banking history visible through open banking. "We relied on the customer's declaration" is not, by itself, a sufficient defence.

4. Vulnerable customers in credit decisions: FOS has found against firms that failed to identify vulnerability indicators present in loan applications — including receipt of disability or welfare benefits as primary income, prior county court judgments or insolvency history, and communications suggesting financial distress — without applying additional affordability scrutiny.

5. Rate escalation transparency: FOS has upheld complaints about promotional rate products where customers were not adequately informed of post-promotional rate escalation. The test is not just whether the rate was in the contract, but whether a reasonable customer in the target market would have understood the implications.

6. Remediation consistency: FOS expects firms to apply consistent remediation approaches across similar complaints. Firms that offer improved settlement only to customers who threaten escalation are penalised in FOS assessments and risk adverse provisional decisions across entire portfolios.

7. Cooperation with FOS investigations: FOS has noted — and factored into outcomes — cases where firms delayed providing records or information during investigations. Unexplained delays in providing loan files, affordability documentation, or complaint history are treated adversely.`,
  },

  {
    namespace:       'global',
    jurisdiction:    null,
    document_type:   'industry_guidance',
    source_document: 'Consumer Credit Complaint Handling — Industry Reference',
    title:           'Common Complaint Categories in Consumer Credit and Standard Resolution Approaches',
    chunk_text: `\
Common complaint categories in consumer credit and standard resolution approaches

The following categories represent the most frequently encountered complaint types in consumer credit portfolios, with standard assessment and resolution frameworks:

1. Irresponsible/unaffordable lending: Customer alleges the firm failed to conduct an adequate affordability assessment. Assessment focuses on: adequacy of income verification; whether expenditure and existing debt commitments were considered; and whether signs of financial distress were visible and acted on. Standard remediation for upheld complaints: refund of all interest and charges; balance write-off; credit file correction; compensation for distress (£100–£250 typical range).

2. Arrears handling conduct: Customer alleges pressure tactics, failure to offer forbearance, excessive contact, failure to refer to debt advice, or discriminatory treatment. Assessment focuses on CONC 7 compliance (UK) or applicable national fair practice code. Standard remediation: refund of charges applied during the arrears period; written apology; compensation for harassment or distress (£150–£500 range depending on severity).

3. Payment allocation disputes: Customer alleges incorrect allocation of payments, resulting in additional charges. Governed by Consumer Credit Act 1974 s.81 (UK). Standard remediation: reversal of incorrectly applied charges; correction of account balance; interest on overpayments.

4. Fee and charge disputes: Customer challenges the level, application, or disclosure of a fee. Assessment: was the fee disclosed pre-contract? Was it applied in accordance with contractual terms and regulatory standards? Standard remediation: refund of incorrectly charged fees; correction of default if charge caused the default.

5. Credit file inaccuracy: Customer alleges incorrect adverse data reported to credit reference agencies. Assessment: was the reported data accurate at the time of reporting? Was a correction made promptly on identification of the error? Standard remediation: correction of credit file; letter of explanation to credit reference agencies; compensation for demonstrable consequential loss (e.g., rejected mortgage application).

6. Mis-selling: Customer alleges product was sold based on misleading information or without explanation of key risks or costs. Assessment: what was communicated at point of sale? Was the product suitable for the customer's stated circumstances? Standard remediation: full unwind of the product; refund of all costs; credit file correction.

7. Closure, settlement, and early repayment charges: Customer disputes charges applied on early repayment or account closure. Assessment: were charges disclosed? Are they consistent with the Consumer Credit Act and applicable secondary legislation? Standard remediation: refund of excessive charges; statutory compensation for statutory breach.`,
  },

  {
    namespace:       'global',
    jurisdiction:    null,
    document_type:   'industry_guidance',
    source_document: 'FCA FG21/1 — Guidance for Firms on the Fair Treatment of Vulnerable Customers',
    title:           'Industry Good Practice on Vulnerability Identification and Response',
    chunk_text: `\
Industry good practice on vulnerability identification and response (synthesised from FCA FG21/1, FOS guidance, and leading firm practice)

Signal identification across all touchpoints: Effective vulnerability identification does not rely solely on designated "vulnerable customer" pathways. It requires all customer-facing staff to be trained to recognise signals in every interaction — phone calls, written communications, web chats, payment behaviour, and account history. Key signals include: references to health conditions, bereavement, or job loss; requests for third-party handling; unusual payment patterns (missed payments, partial payments, erratic behaviour); difficulty understanding communications; emotional distress expressed in writing or voice.

Conversation design: Scripted empathy is insufficient. Staff need genuine training to adapt conversation style, pace, and content to accommodate vulnerability. Effective approaches include: asking open questions to understand the customer's circumstances; not requiring customers to use specific terminology to disclose vulnerability; offering to pause and continue later; providing information in accessible formats on request.

Record and act: When vulnerability is identified it must be: recorded on the customer's account (with appropriate data governance — note that health data is sensitive data under GDPR/DPDPA requiring specific legal basis); flagged to the relevant team for each subsequent interaction; and reviewed periodically, as vulnerability is often temporary (e.g., bereavement, short-term illness) rather than permanent.

Adjusted outcomes for vulnerable customers: Firms must ensure that vulnerable customers do not receive worse outcomes as a result of their vulnerability. Specific adjustments include: waiver of charges that arose because of a vulnerability-related failure to engage; provision of documents in accessible formats (large print, audio, easy-read); extended deadlines for responding to correspondence; facilitation of third-party representation with appropriate consent; referral to specialist internal teams or external support services.

Complaints as a vulnerability signal: A complaint itself is frequently a signal of vulnerability, particularly where it: contains highly emotional language; references personal or financial hardship caused by the firm; comes from a third party acting on the customer's behalf; or includes references to health or mental health difficulties. The complaints team must apply vulnerability protocols from the point of first contact and must not require customers to make a separate disclosure.

Governance and monitoring: Outcomes for vulnerable customers must be monitored separately from the general population. Management information must distinguish outcomes for vulnerable customers by product line, complaint category, and business unit. Where disparities are identified — vulnerable customers receiving worse outcomes than comparable non-vulnerable customers — root cause analysis must be conducted and corrective action taken with board visibility.`,
  },

];

// ─── Seed function ────────────────────────────────────────────────────────────

async function seed() {
  console.log(`Seeding ${CHUNKS.length} knowledge chunks…`);
  const client = await pool.connect();
  let inserted = 0;
  let skipped  = 0;

  try {
    await client.query('BEGIN');

    for (const chunk of CHUNKS) {
      const tokenCount = approxTokens(chunk.chunk_text);
      const result = await client.query(
        `INSERT INTO knowledge_chunks
           (namespace, jurisdiction, document_type, source_document, title,
            chunk_text, confidence_tier, status, token_count, effective_from)
         VALUES ($1, $2, $3, $4, $5, $6, 'verified', 'active', $7, '2024-01-01')
         ON CONFLICT (source_document, title) DO NOTHING`,
        [
          chunk.namespace,
          chunk.jurisdiction ?? null,
          chunk.document_type,
          chunk.source_document,
          chunk.title,
          chunk.chunk_text,
          tokenCount,
        ]
      );
      if (result.rowCount > 0) {
        inserted++;
        console.log(`  ✓ [${chunk.jurisdiction ?? 'global'}] ${chunk.title}`);
      } else {
        skipped++;
        console.log(`  – [${chunk.jurisdiction ?? 'global'}] ${chunk.title} (already present, skipped)`);
      }
    }

    // Backfill effective_from for any previously seeded rows that lack it
    await client.query(
      `UPDATE knowledge_chunks
       SET effective_from = '2024-01-01'
       WHERE effective_from IS NULL
         AND confidence_tier = 'verified'`
    );

    await client.query('COMMIT');
    console.log(`\nDone. ${inserted} inserted, ${skipped} skipped.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
