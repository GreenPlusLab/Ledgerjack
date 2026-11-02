# LedgerJack: guide for AI assistants and contributors

Read this before changing any code. It is loaded automatically by AI coding tools and
is the short version of what every contributor must know.

## What this project is

LedgerJack is a free, open-source (AGPL-3.0-or-later), offline-first bookkeeping
Progressive Web App for self-employed people. Records are stored on the user's own
device (IndexedDB via Dexie) and encrypted with the browser's Web Crypto API.
The United Kingdom is the first jurisdiction implemented; users choose their
country and currency.

Stack: React 18, TypeScript, Vite, Tailwind, Dexie, Vitest.

## Non-negotiable rules

1. **Money is always integer pence.** Never use floating-point for amounts.
   Format with `formatCurrency` and parse with `parseCurrencyInput`
   (`src/lib/currency.ts`).
2. **All ledger writes go through the write choke-point:** `commitBalancedTransaction`
   or `createTransaction` in `src/lib/ledger.ts`. Never write to the
   `transactions` or `splits` tables directly. Every transaction must balance.
3. **All ledger reads that need splits go through `loadWithSplits`** in `src/lib/db.ts`,
   so decryption of protected fields happens in one place.
4. **The app never asserts a tax rate, allowance or threshold.** CIS rate, VAT rate,
   tax-pot percentage and similar figures are entered by the user. LedgerJack is an
   organiser, not a tax adviser. Do not add hardcoded rates, even "for convenience."
5. **No home-made cryptography.** Use Web Crypto only (AES-256-GCM, PBKDF2 at
   600,000 iterations, `crypto.getRandomValues`). Do not lower iteration counts,
   change algorithms, or add new crypto libraries without a recorded decision.
6. **User data does not leave the device** except through flows the user starts
   (optional AI parsing with their own key, share/export, and future HMRC filing).
   Diagnostics report counts only, never ledger contents.
7. **No new runtime dependencies** without a stated reason. The shipped dependency
   list is deliberately small.
8. **Deadlines come from HMRC, never from guesswork or AI.**
   - For a person connected to HMRC, their actual due dates come only from the
     obligations HMRC's API returns for them. If that answer isn't available,
     say so rather than showing a date.
   - The general planning calendar (`src/lib/deadlines.ts`,
     `src/lib/insights/deadlines.ts`) may list HMRC's published standard dates,
     each with a source link and a "check GOV.UK" note. Those dates have tests
     and are checked against GOV.UK every tax year and after every Budget.
   - AI never states, works out or reminds anyone of a deadline. Current AI
     models miss consequential tax deadlines (Surge AI, "DAYJOB: Tax", October
     2026: https://surgehq.ai/blog/dayjob-tax).
9. **Every AI request goes through `callAI` in `src/lib/ai/gateway.ts`.** It
   applies the person's privacy choice, "Read just this one", free models, the
   monthly limit, usage tracking and "What left my phone". Never call an AI
   service any other way. Anything else that sends data off the device records
   it with `recordLeft` (`src/lib/privacy/store.ts`).
10. **Privacy choices are in `docs/PRIVACY-CHOICES.md`.** Colours always come
   with an icon and words; red is only for risk of losing the books.

## How to verify your work

Run all four before saying a change is done, and show the output:

```
npm run typecheck   # must pass
npm test            # must pass
npm run build       # must pass
npm run lint        # report only, but do not add new problems
```

New or changed money, tax, date or crypto logic needs a unit test in `tests/`.

## High-risk areas (extra care, human approval required)

- `src/lib/crypto.ts`, `src/lib/atRest.ts`, `src/lib/migrateAtRest.ts`
- `src/lib/ledger.ts`, `src/lib/db.ts`
- `src/lib/backup.ts`, `src/lib/cloudbackup/`
- `src/lib/mtd/`, `src/lib/vat/`, `supabase/` (tax-authority integration)
- `.github/workflows/`, `package.json`

See `REVIEW.md` for what counts as a failure, and `docs/SECURITY-POSTURE.md`
for the current security picture.

## Non-goals

- Giving tax advice or calculating someone's tax bill on their behalf.
- Bank feeds, advertising, analytics, or any server that can read user data.
- Selling, sharing or monetising user data in any form.
