# LedgerJack — Pre-Launch Checklist

Everything on the build roadmap is done and self-tested. This is the single list
of what stands between "built" and "safe to give real users." Grouped by who does
it and how blocking it is.

## A. Blocking — must do before a public launch

- [ ] **HMRC recognition.** Not yet on GOV.UK's recognised MTD-software list.
      Do NOT describe the app as HMRC-recognised until it is. (Owner pursues.)
- [ ] **Independent security review.** No external audit yet. Get one before
      handling real users' tax data at scale — focus on the crypto vault, backups,
      biometric, and the HMRC relay.
- [ ] **Browser smoke-test the whole app** (`npm install && npm run dev`).
      All verification so far is static analysis + logic self-tests; nothing has
      been run in a real browser from this build environment.
- [ ] **Deploy the HMRC relay** (`supabase/functions/hmrc-relay`) to your own
      Supabase project and set ALLOWED_ORIGINS. Do the same for `ai-proxy` if used.

## B. Verify external facts (may be stale — flagged in code/docs)

- [ ] HMRC **MTD Income Tax** endpoint paths + `Accept` version headers.
- [ ] HMRC **VAT (MTD)** endpoint version (9-box field names cross-checked vs
      github.com/hmrc/vat-api, but confirm the current API version).
- [ ] **OpenRouter** model slugs and prices (Opus 4.8, Fable 5, GPT-4o family) —
      verify on openrouter.ai/models.
- [ ] **CIS** deduction rates (20% / 30% / 0%).
- [ ] **2026/27 tax-rate tables** (personal allowance + taper, band widths,
      Class 2/4 NI) in `src/lib/tax/`.
- [ ] Sandbox-test MTD and VAT submissions end-to-end before enabling production.
- [ ] **Rule 4 conflict:** `src/lib/tax/ukTaxRates.ts` holds built-in rates and
      allowances (personal allowance, basic rate, Class 4 NI), which AGENTS.md
      rule 4 says the app never asserts. Decide: remove the estimator, or have
      the user enter the figures, or change rule 4 with sources and yearly checks.
- [ ] **Autumn Budget 2026** (28 October 2026; check each on GOV.UK):
      trading allowance and the Self Assessment reporting threshold rise from
      £1,000 to £3,000 from 6 April 2027; savings and property income rates
      change from 6 April 2027; payments on account become smaller, more
      regular payments from April 2029; reported easing of late-filing
      penalties for the first four quarterly updates for people joining MTD in
      April 2027. Update help text and the planning calendar where affected.
- [ ] **HMRC software provider registration and standards** announced in the
      Budget: respond to the consultation (intermediation roadmap, spring 2027)
      as a free, open-source provider.

## C. Real-device / manual testing (couldn't be done in the build env)

- [ ] **Biometric unlock** (WebAuthn PRF) on real iOS (Face/Touch ID), Android
      (fingerprint), and Windows Hello. Confirm enrol + unlock + passphrase
      fallback.
- [ ] **QR rendering** (new `qrcode` dependency) in a browser.
- [ ] **WebDAV backup** against a real Nextcloud/WebDAV server (CORS behaviour).
- [ ] **PDF/print** (invoices, statements) and the popup-blocker path.
- [ ] **Voice entry** (Web Speech API) on target browsers.
- [ ] **GPS mileage** foreground tracking on a phone.
- [ ] **Backup + restore** a real dataset across two devices using the recovery key.

## D. Owner decisions / fill-ins

- [x] **Licence**: AGPL-3.0-or-later chosen and full text in `LICENSE`
      (see LICENSE-DECISION.md).
- [ ] **Copyright notice**: decide the name to show as copyright holder.
- [x] **Contacts**: security reports go through GitHub private reporting
      (SECURITY.md); conduct and support use the project contact address.
- [ ] **Web address**: replace `ledgerjack.app` (HMRC redirect, AI referer,
      server allow-lists) with the project's real domain.
- [ ] **Supporter tier**: paste your own payment links in `src/lib/supportConfig.ts`.
- [ ] **Business/brand**: confirm the motto and app name usage.
- [ ] **Privacy policy and website**: explain, for each choice in
      docs/PRIVACY-CHOICES.md, where data goes, including AI companies and any
      data going abroad, with the date each company's terms were checked.
- [ ] **Insurance**: professional indemnity (technology errors and omissions)
      from launch. Check it covers free, open-source and tax-related software,
      and whether it covers an individual or needs a company/CIC.
- [ ] **Competitor comparisons**: check and date any claim about other apps
      before it goes on the website or in marketing.
- [ ] **"Coming soon" labels**: keep only features with a real plan (see
      docs/PRIVACY-CHOICES.md section 7).

## E. Known limitations to communicate to users (already surfaced in-app)

- Lost recovery key / backup passphrase = unrecoverable data (inherent to E2E).
- Transactions aren't individually encrypted at rest in IndexedDB (attachments,
  some settings, and exports are). Device access is the trust boundary.
- Figures are PROVISIONAL — take them to a qualified accountant.
- AI runs on the user's OpenRouter key; figures pass to the chosen model per the
  user's OpenRouter data settings.

## F. Parked / backend-dependent (NOT blocking — future, supporter-funded)

- Live Open Banking bank feeds (regulated aggregator + backend).
- One-tap Google Drive / Dropbox / iCloud backup (OAuth needs a backend).
- Live read-only accountant share link (needs a backend).
- E2E-encrypted multi-device sync (fixes the single-device weakness).
- Full VAT transaction-level tracking (auto-calculates the 9 boxes).
- Full payroll; online payment gateways on invoices; conversational chat bot
  (the last also conflicts with the privacy model).

## G. Quality status at hand-off

- Whole-app syntax sweep: clean (200+ files).
- Library typecheck: clean (incl. crypto/backup/biometric).
- Logic self-tests passing: statements balance, VAT boxes, CIS, invoices,
  budgets, recurring, reconcile, quick-entry parser, rule-learning, smarter
  import, encrypted-backup round-trip (no plaintext leak, tamper-rejecting).
- Two QC passes done; all defects found were fixed and re-verified.
