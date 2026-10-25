# Security Policy

## Reporting a vulnerability

Please report security issues **privately**, not via public GitHub issues.

The preferred route is GitHub's private vulnerability reporting:
**https://github.com/GreenPlusLab/Ledgerjack/security/advisories/new**
(or the **Security** tab of the repository, then **"Report a vulnerability"**).
This opens a private advisory visible only to the maintainers. No email address
or separate account with us is needed.

What to expect:

- We acknowledge a report within **7 days**.
- We confirm whether it is a vulnerability, and how serious, within **14 days**.
- We aim to release a fix within **90 days** of the report, sooner for serious
  issues, and will keep you updated along the way.
- We credit responsible disclosure in the advisory and the changelog, unless you
  ask us not to.

Please give us that time to fix an issue before disclosing it publicly.

## Security model

- **On-device, end-to-end encrypted.** The ledger lives in the browser's
  IndexedDB. Sensitive fields, attachments, and backups are encrypted with keys
  derived (PBKDF2) from the user's password. The master key is held in memory as
  a non-extractable WebCrypto key while unlocked.
- **No server that can read your data.** The optional HMRC relay
  (`supabase/functions/hmrc-relay`) is zero-knowledge: it forwards signed requests
  and never sees decrypted financial data. There is no analytics or data sale.
- **Backups are encrypted before leaving the device.** Cloud/off-device backups
  are wrapped in AES-GCM (PBKDF2, 600k iterations for backups written by the
  current version; older 210k backups remain readable) so a provider only ever sees
  ciphertext. By default the backup is protected by the user's recovery key (no
  new secret to lose).
- **Biometric unlock** uses the WebAuthn PRF extension to wrap the recovery key
  with an authenticator-bound secret — the stored blob is useless on another
  device, and no key is stored in the clear.
- **AI** runs on the user's own OpenRouter key; figures pass to the chosen model
  under the user's OpenRouter data settings. AI is opt-in and cost is shown.

## Known limitations (be honest with users)

- **Biometric (WebAuthn PRF)** could not be exercised in the build environment —
  it must be tested on real devices before being relied upon.
- **WebDAV backup** from a browser depends on the server allowing CORS; the
  encrypted-file option is the always-works fallback.
- **Lost recovery key / backup passphrase = unrecoverable data.** This is
  inherent to real end-to-end encryption; the UI states it clearly.
- **Not every field is encrypted at rest.** Transaction descriptions and
  amounts, attachments, certain settings and exports are encrypted in IndexedDB;
  dates, categories and account names are not. Entries saved while no vault key
  is loaded stay plaintext until "Encrypt older records" is run (the Health
  check reports this). Treat device access as the trust boundary; use
  device-level encryption too.
- **Not independently audited yet.** An external review is recommended before
  handling real users' tax data at scale.
- **External facts to verify** before production: HMRC MTD/VAT endpoint versions,
  OpenRouter model slugs/prices, CIS rates, tax-rate tables.

## Scope

In scope: the client app, crypto/backup, the HMRC relay. Out of scope: the user's
own device security, their OpenRouter/HMRC accounts, and third-party providers
(OpenRouter, Supabase hosting, any cloud they choose for backups).

## Dependency security

We separate shipped dependencies (the code that runs in a user's browser) from
development dependencies (test runner, bundler, linters, which are build-machine
only). Automated dependency auditing runs weekly and is split accordingly:

- Production advisories are treated as real and fixed promptly. LedgerJack ships
  a deliberately small set of runtime dependencies to keep this surface minimal.
- Development-only advisories are reviewed but do not ship to users, so they are
  not user-facing security issues. We still update dev tooling to patched
  versions where practical.

The audit workflow is informational (it reports without failing the build), so a
dev-tool advisory does not block development while genuine issues are handled.
