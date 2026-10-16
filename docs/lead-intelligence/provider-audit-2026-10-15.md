# RADIX Lead Intelligence — provider audit (2026-10-15)

Scope: documentation only. No paid calls, purchases, personal-data transfers, deployment, or merges. Recheck tariffs and terms before purchase.

## Official API candidates

| Source | Verified offer or billing | Role / constraints |
|---|---|---|
| Wikidata | Public entity search and P856 website; 2026 rate limits, identifiable User-Agent and backoff | Existing first-pass domain suggestion, human review mandatory |
| Brave Search API | $5/1000 Search requests, $5 free monthly credit | Optional second source for *candidate* domains; API key and attribution terms to review |
| Hunter | Free 50 credits/mo; Starter $34/mo if billed annually. Email Finder: 1 credit per found email; All-in-One verifier: 0.5 credit if separate. API rate limits Finder 15/sec and 500/min | First candidate for business email finding; distinguish Data Platform vs All-in-One plans |
| Dropcontact | Pay on success; API POST batch up to 250 contacts and async GET. Current pricing selector displays Starter from €79/mo, quota needs selection | Candidate for combined email enrichment and verification; do not use historical €29/500 as guaranteed current price |
| Snov.io | Starter $39/mo, 1,000 credits; 1 credit for a matched company domain, email found or definitive email verification | Candidate for domain fallback and email validation |
| Prospeo | Free 100 credits/mo, limited API; 1 credit for matched email/company, 10 for phone. Free enrichment rate 1/sec, 20/min, 50/day | Trial candidate; no bulk CSV on free tier |
| Findymail | Starter $99/mo, 5,000 Finder plus 5,000 Verifier credits; 1 Finder credit per verified email found | Alternative verified-email finder; API included |
| Apollo | People enrichment 1–9 credits/person; optional waterfall can exceed 20 credits | Do not enable until exact account prices and maximum billable calls are known |
| People Data Labs | Self-serve person enrichment from $0.28 per matched person, $98 minimum/month | Enrichment match does not imply a verified email |

## Official sources

- Wikimedia: https://www.mediawiki.org/wiki/Wikimedia_APIs/Access_policy and https://www.mediawiki.org/wiki/Wikimedia_APIs/Rate_limits
- Brave: https://brave.com/search/api/
- Hunter: https://hunter.io/pricing and https://help.hunter.io/en/articles/1970956-hunter-api
- Dropcontact: https://www.dropcontact.com/fr/tarifs and https://developer.dropcontact.com/
- Snov.io: https://snov.io/pricing and https://snov.io/knowledgebase/how-to-enrich-your-data-via-snov-io-api/
- Prospeo: https://help.prospeo.io/en/article/how-to-create-an-account-on-prospeo-for-free-5inxir/ and https://help.prospeo.io/en/article/api-rate-limits-19vqf50/
- Findymail: https://www.findymail.com/pricing/
- Apollo: https://docs.apollo.io/docs/api-pricing
- People Data Labs: https://support.peopledatalabs.com/hc/en-us/articles/25794271805211-Pricing-credits

## Real cost per verified email

For monthly subscriptions, effective cost per verified result = **actual subscription fee / verified results actually received in the period**. Quoted per-credit prices are not equivalent to effective costs at low utilization. Example: Findymail $99 / 5,000 = $0.0198 at full utilization, but $99 / 100 actual valid emails = $0.99 each. Snov $39 / 1,000 = $0.039 per credit at full utilization, and separate find plus verify may require two credits. Brave 17 queries nominally $0.085 before free allowance; results still need review. Do not convert currencies without a dated FX rate.

## Engineering and legal safeguards

- Local import and deduplication, then free domain suggestions, human review, paid provider dry-run, explicit approval, CRM duplicate review and controlled handoff.
- Persist provenance, observed date and confidence for every proposed field; never silently overwrite populated values or invent an email.
- Provider-specific API adapters with server-side secrets only, idempotency, timeout, retry-after, per-job hard spend caps and explicit disabled-by-default execution. Variable-cost endpoints must be blocked until cost can be capped.
- Official LinkedIn Sales Navigator help states there is no general CSV/XLS export; its terms restrict unauthorized automation. User login alone is not proof of authorization. Use only authorized collection paths.
- Professional contact details may be personal data; assess GDPR/ePrivacy legal basis, notice, retention, objection, DPA and cross-border transfers before processing or outreach.

## Next steps

Implement pure offline multi-source proposal reconciliation; verify with tests. Evaluate optional Brave Search as a second source only after account and terms review. The existing 20-contact checkpoint is on the user's Mac, not accessible here; no real lookup of those contacts has been performed. No provider account, price quote, success rate or deliverability has been verified with a live API.
