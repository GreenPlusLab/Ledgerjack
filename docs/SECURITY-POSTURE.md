# LedgerJack — Security Posture & Self-Review

*Prepared as pre-audit self-review (OSTIF / OpenSSF Best Practices) and as supporting evidence for funding applications.*
*Date: August 2026. Codebase: ~129 source files, single-page PWA. Licence: AGPL-3.0-or-later. OpenSSF Best Practices badge: passing (#13674).*

---

## 1. Purpose and honest framing

LedgerJack is a free, open-source, offline-first bookkeeping Progressive Web App for UK self-employed people. This document is a candid internal review of its security posture. It is written to be **accurate rather than flattering** — it states what is genuinely strong, and it states the open gaps plainly, so that an external auditor (and any funder) sees an honest picture. Where the product's marketing and the code diverge, that is called out explicitly (see §7).

This review was produced by examining the source directly and by running targeted runtime tests of the security- and money-critical logic (see §4).

---

## 2. Architecture and trust boundaries

- **Client-only today.** The app runs entirely in the browser. Data is stored locally in IndexedDB (via Dexie). There is currently no LedgerJack server; nothing is transmitted to any LedgerJack-operated backend.
- **Data leaves the device in only three situations, all user-initiated:**
  1. **AI parsing (optional):** when the user chooses AI receipt/text parsing, the transaction text and, for receipts, the image are sent to OpenRouter using the user's *own* API key. This is a third-party data flow the user opts into.
  2. **Share/export (user-initiated):** WhatsApp/Telegram/email share links and file exports are triggered explicitly by the user.
  3. **Planned HMRC filing (not yet built):** MTD integration code exists as scaffolding but is inert — there is no live server relay, so no data currently reaches HMRC.
- **Trust boundary:** the user's device and browser sandbox. Because there is no server, the classic "server can read your data" risk does not apply. The corresponding trade-off is that on-device at-rest protection is only partial (see §7).

---

## 3. Cryptography (strengths)

The cryptographic core is well-engineered and uses standard, current primitives via the Web Crypto API:

- **Encryption:** AES-256-GCM (authenticated encryption).
- **Key derivation:** PBKDF2-HMAC-SHA-256 at **600,000 iterations** (meets the OWASP 2023 minimum; the code notes this was deliberately hardened).
- **Randomness:** all salts (16 bytes) and IVs (12 bytes) come from `crypto.getRandomValues` (CSPRNG). The 256-bit master key is generated the same way.
- **Key handling:** the operational master key is imported as **non-extractable**, so no script in the origin can export it after unlock. An extractable copy exists *only* momentarily during vault creation for recovery-key generation and is purged immediately afterwards.
- **Envelope model:** the master key is sealed under a password-derived KEK; changing the password re-seals the same master key, preserving data without re-encrypting everything.
- **Encrypted backup option:** a passphrase-encrypted export format (AES-GCM + PBKDF2) is available with a versioned magic header.
- **Encrypted attachments:** receipt images are compressed then encrypted (AES-GCM) before storage.

---

## 4. What has been runtime-tested

These were executed, not assumed:

- **Crypto lifecycle — 7/7 passed:** correct password unlocks; wrong password is rejected; the recovery key re-derives the master key; a password change preserves data; the old password stops working after a change.
- **Money & fiscal logic — 15/15 passed:** integer-pence arithmetic (avoids floating-point money bugs); correct UK fiscal-year boundary handling (including the 5/6 April cutover); double-entry balance enforced (imbalanced entries rejected).
- **Ledger field encryption at rest — 14/14 passed:** round-trip encrypt/decrypt, idempotency, legacy-plaintext passthrough, unicode handling, random-IV uniqueness. Basic transaction entry has also been exercised in a real browser; full end-to-end browser verification of the vault lifecycle (creation, lock/unlock, password change, recovery) against a live database is still outstanding (see §7.1).

### Continuous integration and automated testing

The project runs an automated test and quality pipeline on **every push and pull request** via GitHub Actions (`.github/workflows/ci.yml`):

- **Type-checking** (TypeScript strict mode) — blocks merge on error.
- **Automated unit tests** (Vitest) exercising the real cryptographic, money, tax, date and backup logic — blocks merge on failure.
- **Linting** (ESLint) — reported and tightened incrementally.
- **Production build** (Vite) — blocks merge on failure.

A separate weekly workflow (`.github/workflows/audit.yml`) runs `npm audit` for known-vulnerable dependencies, and **GitHub Dependabot** is enabled for automated dependency-vulnerability alerts. This closes the "no dependency scan has been run" gap noted in earlier drafts of this document.

---

## 5. Application-security review by category

- **Secrets:** no hardcoded API keys, passwords, or private keys found in source. The Supabase anon placeholder is empty.
- **Dependencies:** lean runtime surface — 9 direct dependencies (React, Dexie, papaparse, qrcode, uuid, lucide-react, supabase-js, vite-plugin-pwa). Small, well-known, auditable. Dependency vulnerability scanning is now active: a weekly `npm audit` workflow plus GitHub Dependabot alerts. At the time of writing, all outstanding advisories are in development-only tooling (test runner and bundler), not in the runtime dependencies that ship to users (see §4 and SECURITY.md).
- **Input validation:** backup import performs typed schema validation before touching the database (each transaction, split, and account is checked; the crypto-envelope import is constrained to a single expected record). This closes a previously-noted unsafe-cast import path.
- **Cross-site scripting:** no `dangerouslySetInnerHTML`, `eval`, or `new Function` in application code. The invoice/statement print path builds HTML but **escapes all user-supplied fields** (`&`, `<`, `>`), including multi-line address fields (escaped before newline conversion). The only `innerHTML` use is a static fallback template with no user data.
- **Transport:** all external endpoints are HTTPS. HMRC endpoints are TLS-only by requirement.
- **Vulnerability disclosure:** a `SECURITY.md` exists with a private reporting process through GitHub's private vulnerability reporting, so no email address is needed.

---

## 6. Threat model (summary)

- **Primary asset:** the user's financial records and receipts.
- **Primary adversaries considered:** (a) a remote attacker with no device access — currently well-mitigated, as there is no server and no data in transit except user-initiated flows; (b) a third party receiving a backup file — mitigated *if* the user chooses the encrypted backup; (c) someone with access to the unlocked device or the browser's local storage — **partially mitigated only** (see §7).
- **Out of scope today:** server-side threats (no server yet) — but these become central once the HMRC backend is built, and should be the focus of any audit scoped to that phase.

---

## 7. Open findings and honest gaps

These are stated plainly. None make the app "insecure" for its current local-first use, but they matter for the claims made and for a production filing service.

1. **Ledger field encryption at rest — NOW IMPLEMENTED (partial browser verification).** Transaction **descriptions** and split **amounts** are now encrypted at rest under the vault master key, using a backward-compatible marker scheme: newly-written and edited records are encrypted automatically; existing plaintext records remain readable and can be encrypted via a one-tap "Encrypt older records" migration (idempotent, backup-first). This closes the main gap between the E2E claim and the data model for the most sensitive fields (who/what was paid, and how much). The encryption logic is runtime-tested (14/14: round-trip, idempotency, legacy passthrough, unicode, random-IV) and these tests run in CI on every push. **Caveat:** basic transaction entry has been exercised in a real browser, but the full vault lifecycle end-to-end (vault creation, lock/unlock, password change, recovery-key re-derivation against a live database) has **not yet** been verified on-device; it should be, with a backup taken first, before users rely on it. **Still plaintext at rest** (candidates for a follow-up pass): account/category identifiers, split memos, mileage-log descriptions, and client/invoice records. The "encrypted at rest" claim should therefore be stated as "your descriptions and amounts are encrypted on your device; some structural fields remain in the clear" until the follow-up lands.

2. **The default plain backup is unencrypted JSON.** An encrypted backup option exists but must be chosen. Consider making encryption the default, or presenting a clear warning when a plain export is selected.

3. **Fraud-prevention headers are unvalidated.** The browser-side `Gov-Client-*` headers are implemented but have not been validated against HMRC's Test Fraud Prevention Headers API. The `Gov-Client-Local-IPs` value is deliberately opt-in for privacy, which conflicts with HMRC's expectations for the web-app-via-server method — a tension to resolve before filing.

4. **Third-party AI data flow.** When AI parsing is used, transaction text and receipt images are sent to OpenRouter under the user's own key. This is legitimate but must be disclosed clearly in a privacy policy, since it is an exception to "your data stays on your device."

5. **No server yet — and the server is the future risk centre.** The HMRC/OAuth/relay code is scaffolding. Once a real backend exists (holding OAuth client secrets and handling tokens), it becomes the primary attack surface and must be in audit scope.

6. **Recovery key is a plaintext skeleton key by design.** It unlocks the vault without a password. This is an intentional recoverability trade-off, gated behind password re-entry to export, with user warnings — but it should be documented as a known property.

7. **Password KDF choice.** PBKDF2 at 600k iterations is OWASP-compliant and acceptable. Argon2id is the modern preference for memory-hardness; migrating is optional future hardening, not a defect.

8. **Housekeeping before publication:** placeholder security/conduct contact emails replaced *(done: security reports use GitHub private reporting; conduct and support use the project contact address)*. Dependency vulnerability scanning is now in place (weekly `npm audit` + Dependabot — done). The OpenSSF Best Practices badge has been earned at the passing level (#13674 — done) and is displayed on the project README.

---

## 8. What an audit should focus on

In priority order: (1) the cryptographic envelope, key lifecycle, and the at-rest data model (item 7.1); (2) backup/restore integrity and the encrypted-backup format; (3) the recovery-key model; (4) — once built — the HMRC backend: OAuth secret handling, token storage, fraud-header correctness, and the server's data-handling as data controller under UK GDPR.

## 9. What we are seeking

Facilitation of an independent, publishable security audit, and help sourcing funding to cover it. The codebase is small and the cryptography is contained, which should make the engagement tractable and cost-effective relative to large-infrastructure projects. The published report would serve as verifiable assurance for users of a privacy-first financial application, and directly supports the project's public-interest mission: helping the many non-technical, low-income self-employed people now being brought into mandatory digital tax reporting to do so affordably, simply, and privately.
