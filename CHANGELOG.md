# Changelog

All notable changes to LedgerJack are recorded here. Security-relevant changes
are marked **[security]**. This project follows Semantic Versioning.

## [Unreleased]

### Security
- Git now ignores AI coding tools' local settings (`.claude/settings.local.json`)
  and all `.env` files, and AGENTS.md rule 12 forbids real secrets in commands
  or "don't ask again" approvals. A check of the full history (all branches and
  pull request copies, gitleaks rules plus Apiiro's checks for passwords inside
  commands) found no secrets.

### Changed
- Friendlier wording on receipt checks ("Full attention needed", "Worth a
  second look") so people check without being put off. Nothing is approved
  automatically; each entry still takes one tap from the person.
- Checking is quicker: the receipt photo sits beside the figures on the
  confirm card and in Review, and only the part that needs a look (date,
  amount, name or category) is outlined, with the words "Worth a look".
- The project's web address is now `ledgerjack.com` (HMRC return address, AI
  referer and the server helpers' allow-lists). The HMRC set-up guides now
  match how the app works: HMRC returns to the home page, with no separate
  callback route.
- New dev dependency `fast-check` (MIT), reason: random-input ("property")
  tests for the money maths in `tests/moneyProperties.test.ts`.
- Settings, Data Management: **Make a locked backup** is now the main button.
  The plain backup file moved under "Other: a partly locked copy for this
  device", says exactly what anyone could read in it, and no longer turns the
  backup light green (it stays on the same device and isn't fully locked).
- Wording that promised more than the app does: the disclaimer no longer says
  all data is encrypted (encryption can be skipped, and dates and categories
  aren't encrypted); Settings no longer says no data leaves the device; the AI
  questions note no longer says the AI won't invent numbers; backups are
  described as locked with the recovery key (not the password); and the
  recovery key tip no longer suggests emailing it to yourself.

### Removed
- The unused built-in UK tax-rate tables and estimator (`ukTaxRates.ts`,
  `taxEstimator.ts`). No screen used them, and they broke the rule that the app
  never states a tax rate. The tax pot uses the person's own percentage.

### Added
- **Full attention required** notice wherever a receipt is read (AI or on the
  phone): every field must be checked against the receipt, and what goes into
  the books is the person's responsibility.
- **Specific checks on every reading** (`src/lib/ai/readingChecks.ts`), shown
  in plain words: missing, future or very old dates, missing total or shop,
  items or suggested parts that don't add up to the total, and the AI's own
  doubts. Stored with pending entries as codes (no amounts) and shown in
  Review.
- Bulk receipts now keep each photo (encrypted) with its entry, so it can be
  checked in Review.

### Fixed
- A typed amount too large to hold exactly in pence is now treated as invalid
  instead of being saved inexactly.
- A receipt with no readable date was quietly given today's date (AI and text
  recognition). The date now stays empty, is flagged, and must be filled in
  before the entry can be approved.
- The AI's own confidence and its notes on what it struggled with were being
  thrown away, so every AI reading showed the same general warning.
- Restoring a plain backup dropped each entry's trade and "flag for
  accountant" marks.
- **Privacy choices** (docs/PRIVACY-CHOICES.md): a short first-run "waiter"
  that asks four plain questions and recommends one of four ready-made
  choices (Private and safe, Fully private, Most accurate, Easy and free) or
  "Make my own"; colour labels with icons and words everywhere; Settings,
  Your privacy choices to change them, with each outside service's terms,
  dated and sourced.
- **Text recognition on the phone** for receipts ("Read on this phone", also
  in Bulk receipts). New runtime dependency `tesseract.js` (Apache-2.0),
  reason: reading receipts privately and for free without AI. Its files are
  served from LedgerJack under `/ocr/`, never from another website.
- **Free online AI** with a free OpenRouter account (free models only), and
  **Read just this one with AI** for a single receipt when AI is off.
- **One door for AI**: every AI request goes through `callAI`, which applies
  the privacy choice and a **monthly AI spending limit**.
- **What left my phone**: a plain monthly record of AI requests, backups,
  unlocked exports and shares, and HMRC submissions (never their contents).
- **Backup health light** on the home screen (green, amber, red) and a
  **recovery key check** (download, print or password app, then type back two
  groups) in first run and Settings.

### Changed
- Build and test tooling upgraded (Vite 8, Vitest 5); production dependency
  audit clean. **[security]**
- Removed "Coming soon" promises with no plan: LedgerJack server backup and
  auto-sync, the live accountant link, the live bank feed.

### Fixed
- The last backup time is now loaded at start-up, so the home screen no longer
  says "no backup" after every restart.
- **Check my books** screen (Dashboard): looks through this tax year's entries
  for possible duplicates (including a scanned receipt and the same bank line),
  unusual amounts (a misplaced decimal point or an extra zero), dates in the
  future, entries waiting for review, expenses without a receipt and months
  with nothing recorded. Runs on the device with no AI, never changes an entry
  on its own, and lets the user send an entry back to the review queue to
  correct or delete it. The results are added to the accountant note.
- Insights: **What changed**, a plain comparison of the last two complete
  months by category, and **Ask your books**, a no-AI question builder
  ("how much did I spend on Travel this tax year?"). Both are worked out on the
  device. `parseBooksQuery()` is the gate any future AI layer must go through:
  the AI may only propose a query, never see entries or do arithmetic.
- Unit test suite (Vitest) in `tests/`, run with `npm test`, covering the
  money/tax/date logic, the problem-report privacy guarantee, AI review-gating,
  and backup KDF backward compatibility.
- GitHub Actions CI (`.github/workflows/ci.yml`): type-check, lint, test and
  build on every push and pull request.
- Weekly dependency vulnerability audit workflow (`.github/workflows/audit.yml`).
- **Report a problem** screen: gathers technical, non-personal diagnostics the
  user reviews in full before choosing to share them (copy or GitHub issue). The
  report never contains transaction contents.
- Deadline calendar: downloadable `.ics` of MTD and Self Assessment dates that
  the user's own calendar app reminds them about — no server, works offline.
- AI confidence scores: receipt scans below a confidence threshold are flagged
  for human review rather than presented as fact.
- Demo/example data loader (refuses to run on a non-empty ledger; only removes
  its own tagged rows).
- "Is LedgerJack right for you?" card that honestly points people to other tools
  when a better fit exists.
- Provisional figures page: shows the user's own tax-year totals and links to
  HMRC's own tax calculator (we do not calculate tax).
- `GOVERNANCE.md` and an OpenSSF badge answer sheet in `docs/`.

### Changed
- **[security]** Encrypted-backup key derivation raised from 210,000 to 600,000
  PBKDF2 iterations, matching the local vault. Versioned via the blob's `v`
  field so existing 210k backups still open. This is the artefact users copy to
  cloud storage, where offline brute-force is the threat — it should have the
  strongest derivation, not the weakest.
- Removed Google Drive / Dropbox / iCloud "coming soon" backup destinations in
  favour of a reminder to keep a weekly copy off-device via the OS share sheet.
  The app connects to no cloud account, so it can leak none.
- Backup export button relabelled and explained honestly: it was labelled
  "encrypted" but produced partly-plaintext JSON. Users are now directed to the
  passphrase-encrypted export for anything leaving the device.
- **The app no longer holds any tax rates.** CIS deduction rate, VAT rate and the
  tax-pot set-aside percentage are all user-entered, with a "check with your
  accountant / GOV.UK" warning. Removed hardcoded UK tax bands, the CIS rate
  table, and 28 stale foreign mileage rates. Rationale: a stale rate asserted
  with the app's authority is worse than no rate at all.

### Fixed
- **[security]** At-rest encryption no longer awaits WebCrypto inside a Dexie
  transaction (which silently aborted saves); encryption now happens before the
  transaction opens.
- Approved-transactions query used an IndexedDB boolean index, which cannot exist
  — it silently returned nothing, breaking monthly totals and eight other
  features. Replaced with a JS filter.
- At-rest amounts fall back to plaintext (not `£0`) when the vault is locked, so a
  locked vault never silently shows zeroes.
- Missing `ReportProblem` import in `App.tsx` that broke the production build.

### Security
- Self-check / health panel surfaces silent failures (unbalanced books,
  unreadable records, stale backups) rather than letting them pass unnoticed.
