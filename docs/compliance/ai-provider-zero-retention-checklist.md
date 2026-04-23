# AI Provider Zero-Data-Retention Checklist

Required before processing real client data via external AI APIs (Gap 28).

Zero-data-retention (ZDR) means the provider does not log, store, or use API request/response
data for model training or any other purpose after the request completes.

---

## Anthropic (Claude)

| Check | Status | Notes |
|---|---|---|
| ZDR available | Yes — via API Trust & Safety programme | |
| Agreement type | Enterprise — requires direct contact with Anthropic | |
| How to request | sales@anthropic.com — reference "zero data retention" | |
| DPA available | Yes — at anthropic.com/legal | |
| Model used by Nuqe | claude-sonnet-4-6 | |
| Action required | Contact Anthropic sales to activate ZDR on the account used by Nuqe | [ ] Done |

## OpenAI (GPT)

| Check | Status | Notes |
|---|---|---|
| ZDR available | Yes — Zero Data Retention is available via API (not-for-training is opt-in) | |
| Agreement type | Enterprise or API settings | |
| How to activate | platform.openai.com → Settings → Data Controls → turn off training | |
| DPA available | Yes — at openai.com/policies/data-processing-addendum | |
| Model used by Nuqe | Configurable per org via Settings screen | |
| Action required | (1) Disable training toggle in OpenAI account settings; (2) download and sign DPA | [ ] Done |

## Google (Gemini)

| Check | Status | Notes |
|---|---|---|
| ZDR available | Yes — via Google Cloud Vertex AI (Gemini) with default API data handling |  |
| Agreement type | Google Cloud DPA included in GCP terms | |
| Action required | If using Gemini API (not Vertex), review data handling at ai.google.dev/terms | [ ] Not yet in use |

---

## Before Going Live — Confirmation Checklist

- [ ] Anthropic ZDR agreement signed and active
- [ ] OpenAI data training disabled AND DPA downloaded
- [ ] API keys for each provider stored encrypted (AES-256-GCM via ENCRYPTION_SECRET)
- [ ] Clients notified in DPA of which AI providers are used as sub-processors
- [ ] Annual review of provider terms scheduled in compliance calendar

---

*Last updated: 23 April 2026*
