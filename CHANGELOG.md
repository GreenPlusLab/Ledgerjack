# Changelog

All notable changes to LedgerJack are recorded here. Security-relevant changes
are marked **[security]**. This project follows Semantic Versioning.

## [Unreleased]

### Added
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
