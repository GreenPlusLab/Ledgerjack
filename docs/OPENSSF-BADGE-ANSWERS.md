# OpenSSF Best Practices Badge — answer sheet

This maps each **passing**-level criterion to LedgerJack's answer and the evidence
to link in the form at <https://www.bestpractices.dev>. Fill the web form from
this; the site auto-detects many answers from the GitHub repo.

Replace `REPO` with the canonical repo URL: `https://github.com/GreenPlusLab/Ledgerjack`.

Legend: **Met** / **N/A** / **Unmet (planned)**. Criterion IDs in brackets match
the badge form.

---

## Basics

- **[description_good] Met** — README describes what LedgerJack is: a free,
  offline-first, end-to-end-encrypted bookkeeping PWA for UK sole traders.
  Evidence: `REPO#readme`.
- **[interact] Met** — README + `CONTRIBUTING.md` explain how to obtain, give
  feedback, and contribute. In-app "Report a problem" also exists.
  Evidence: `REPO/blob/main/CONTRIBUTING.md`.
- **[contribution] Met** — `CONTRIBUTING.md`. Evidence: that file.
- **[contribution_requirements] Met** — `CONTRIBUTING.md` states coding standards
  (TypeScript, functional React, Tailwind), the "new code needs tests" rule, and
  security-area review. Evidence: `CONTRIBUTING.md`.
- **[floss_license] Met** — AGPL-3.0-or-later. Evidence: `LICENSE`, and
  `license` field in `package.json`.
- **[license_location] Met** — `LICENSE` in the repo root.
- **[english] Met** — all docs and code comments are in English.

## Change control

- **[repo_public] Met** — public GitHub repo. Evidence: `REPO`.
- **[repo_track] Met** — git. Evidence: `REPO`.
- **[repo_interim] Met** — interim commits are visible on `main`.
- **[repo_distributed] Met** — git (distributed).
- **[version_unique] Met** — `version` in `package.json`; releases tagged.
- **[version_semver] Met (SHOULD)** — Semantic Versioning; currently `0.1.0`.
- **[version_tags] Met (SUGGESTED)** — git tags for releases.
- **[release_notes] Met (SHOULD)** — `CHANGELOG.md` records notable changes and
  security fixes. (Create/maintain this — see note below.)

## Reporting

- **[report_process] Met** — `SECURITY.md` (private vuln reporting) +
  `CONTRIBUTING.md` (bugs/enhancements) + in-app "Report a problem".
- **[report_tracker] Met** — GitHub Issues. Evidence: `REPO/issues`.
- **[report_responses] Met (SHOULD)** — maintainer responds on the tracker.
- **[enhancement_responses] Met (SHOULD)** — same.
- **[report_archive] Met** — GitHub Issues are publicly archived.
- **[vulnerability_report_process] Met** — `SECURITY.md` describes GitHub private
  vulnerability reporting. Evidence: `SECURITY.md`.
- **[vulnerability_report_private] Met** — GitHub private advisories (Security tab).
- **[vulnerability_report_response] Met (SHOULD)** — target: acknowledge within a
  few days (stated in `SECURITY.md`).

## Quality

- **[build] Met** — `npm run build` (Vite). Evidence: `package.json` scripts.
- **[build_common_tools] Met** — npm + Vite, widely used.
- **[build_floss_tools] Met** — all build tooling is FLOSS.
- **[test] Met** — Vitest suite in `tests/`, run with `npm test`. Evidence:
  `REPO/tree/main/tests` + the `test` script in `package.json`.
- **[test_invocation] Met** — `npm test`. Documented in `CONTRIBUTING.md`.
- **[test_most] Met (SHOULD)** — tests cover the money/tax/date logic
  (`tests/cis.test.ts`, `tests/taxPot.test.ts`, `tests/deadlines.test.ts`), the
  privacy guarantee of the problem report (`tests/diagnostics.test.ts`), the AI
  review-gating (`tests/aiConfidence.test.ts`), and backup KDF backward
  compatibility (`tests/encryptedBackup.test.ts`). Coverage grows toward the UI
  over time.
- **[test_continuous_integration] Met (SUGGESTED)** — GitHub Actions runs the
  suite on every push/PR. Evidence: `.github/workflows/ci.yml`.
- **[test_policy] Met** — `CONTRIBUTING.md`: "New code requires new tests."
- **[tests_are_added] Met (SHOULD)** — enforced in review; CI runs tests on PRs.
- **[tests_documented_added] Met (SUGGESTED)** — the policy is in `CONTRIBUTING.md`.
- **[warnings] Met** — TypeScript strict-ish compile (`npm run typecheck`) +
  ESLint (`npm run lint`), both in CI.
- **[warnings_fixed] Met** — the build/typecheck/lint must be clean to merge.
- **[warnings_strict] Met (SUGGESTED)** — CI fails on type and lint errors.

## Security

- **[know_secure_design] Met** — `docs/SECURITY-POSTURE.md` documents the threat
  model and the E2E-encryption design.
- **[know_common_errors] Met** — the code avoids the classic web pitfalls; no
  server stores readable data; inputs to the ledger are validated at the write
  choke-point.
- **[crypto_published] Met** — uses the WebCrypto API (AES-256-GCM, PBKDF2); no
  home-grown crypto primitives. Evidence: `src/lib/crypto.ts`.
- **[crypto_call] Met** — WebCrypto only.
- **[crypto_floss] Met** — WebCrypto (browser-native, FLOSS implementations).
- **[crypto_keylength] Met** — AES-256, PBKDF2-SHA256 at 600k iterations (vault
  and current backups). Evidence: `src/lib/crypto.ts`,
  `src/lib/cloudbackup/encryptedBackup.ts`.
- **[crypto_working] Met** — no known-broken algorithms (no MD5/SHA-1/DES for
  security purposes).
- **[crypto_weaknesses] Met** — SHA-256/AES-GCM; no known-weak primitives.
- **[crypto_pfs] N/A** — no bespoke transport protocol; HTTPS/TLS handles transport.
- **[crypto_password_storage] Met** — passwords are never stored; keys are derived
  via PBKDF2 (salted, 600k). Evidence: `src/lib/crypto.ts`.
- **[crypto_random] Met** — `crypto.getRandomValues` / WebCrypto for salts and IVs.
- **[delivery_mitm] Met** — served over HTTPS; users obtain the app from a TLS
  origin.
- **[delivery_unsigned] Met** — no unsigned intermediary; static hosting over TLS.
- **[vulnerabilities_fixed_60_days] Met** — commit history shows prompt fixes.
- **[vulnerabilities_critical_fixed] Met** — none outstanding.
- **[no_leaked_credentials] Met** — no secrets in the repo; OAuth secrets live in
  the (separate) relay, never in the client.

## Analysis

- **[static_analysis] Met** — TypeScript compiler + ESLint in CI. Evidence:
  `.github/workflows/ci.yml`.
- **[static_analysis_common_vulnerabilities] Met (SUGGESTED)** — ESLint +
  type-checking catch common JS/TS defect classes; `npm audit` (weekly workflow)
  covers dependency CVEs. Evidence: `.github/workflows/audit.yml`.
- **[static_analysis_fixed] Met** — issues found must be fixed to merge.
- **[static_analysis_often] Met (SUGGESTED)** — runs on every push/PR.
- **[dynamic_analysis] Unmet (documented)** — no dynamic-analysis harness yet.
  This is a SHOULD/SUGGESTED, not a MUST; documented here as a known gap, planned
  after the OSTIF review scopes the crypto.

---

## To do before submitting

1. Ensure `CHANGELOG.md` exists and lists notable changes + security fixes
   (the build history and `docs/` notes are the raw material).
2. Enable **private vulnerability reporting** in the repo Security settings so the
   `SECURITY.md` route works.
3. Push `package-lock.json` so `npm ci` in CI is reproducible.
4. Create the project on bestpractices.dev, let it auto-detect from the repo, then
   fill the remaining fields from this sheet.
