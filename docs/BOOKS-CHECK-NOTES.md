# Check my books, What changed, and Ask your books

Three features that help a self-employed person trust their own figures before
year end, all worked out on the device with no AI and no network.

## Check my books (Dashboard -> "Check my books")

The Health check asks "is the data intact?" (encryption, balance, backups).
Check my books asks a different question: "do the entries themselves look
right?" It looks at the current tax (or financial) year and reports:

| Finding | Severity | What it catches |
|---|---|---|
| Possible duplicates | check | Same kind and exact amount, close in date, and either the same day in the same category or similar descriptions within 3 days. Pending entries are included, because a scanned receipt plus the same bank line is the most common double count. |
| Unusual amounts | check | An entry at least 3x the category's usual (median) amount and at least 20.00 above it, once the category has 4+ other entries. Catches an extra zero or a misplaced decimal point. |
| Dates in the future | check | Dated more than a day after today (allows for time zones). Usually a year typo. |
| Waiting for your review | info | Entries in the review queue, which are not in totals yet. |
| Expenses without a receipt | info | Approved expenses with no receipt photo. Mileage is left out. |
| Months with nothing recorded | info | Complete months with no income or no expenses, counted only from the user's first entry, and only once there are entries in 2+ months. |

Principles:
- **Read-only.** It never deletes or edits anything itself. Each flagged entry
  has a "Review" button that sends it back to the review queue
  (`updateTransaction(id, { pending_review: true })`, through `ledger.ts`),
  where the user can correct or delete it and approve it again.
- **No tax statements.** Findings describe what looks unusual, never what the
  law requires. A test checks the wording for rates and allowances.
- **Prompts, not rulings.** An entry flagged here may be perfectly correct.

The accountant note (Your accountant -> Email / WhatsApp / Telegram) now ends
with an "Automatic checks" section listing likely mistakes (up to 10 per
finding) and counts for receipts and pending entries, so the accountant gets
books that have already been looked over.

## What changed (Insights)

Compares the last two **complete** months (never a half-finished month against
a full one), approved entries only. Shows income and expense totals, then up to
3 category movements of at least 10.00 and 15% of the earlier month, with the
largest entries behind any rise.

## Ask your books (Insights)

Pick spend/earn, a category (or everything) and a period (this month, last
month, last 3 complete months, this year so far, last year). The answer, the
largest entries and any matching entries still in review are shown.

### Rule for any future AI layer

The AI must never see entries or do arithmetic. Its only job would be to turn a
typed question into a `BooksQuery`, using only the question and the category
names. `parseBooksQuery()` validates what comes back; anything that isn't a
valid query is refused, so "should I claim this?" has nothing to become and
can't produce tax advice. The answer is then computed by `answerQuery()`.

## Files

- `src/lib/bookscheck/entries.ts`: flat entry view of the ledger + date helpers (pure)
- `src/lib/bookscheck/bookscheck.ts`: the checks and their wording (pure)
- `src/lib/bookscheck/load.ts`: reads the ledger via `loadWithSplits`
- `src/lib/insights/compare.ts`, `src/lib/insights/ask.ts`: comparisons and questions (pure)
- `src/views/BooksCheck.tsx`, `src/components/WhatChanged.tsx`, `src/components/AskYourBooks.tsx`
- Tests: `tests/booksCheck.test.ts`, `tests/compare.test.ts`, `tests/ask.test.ts`
- Wired into: `App.tsx`, `Navigation.tsx` (view `books-check`), `Dashboard.tsx`,
  `Insights.tsx`, `lib/accountant/accountant.ts`
