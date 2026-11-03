# Tax pot: money to set aside for tax

LedgerJack does not calculate anyone's tax. AGENTS.md rule 4: the app never
states a tax rate, allowance or threshold.

## What the person sees
- **Set aside for tax** (More, Tax pot; UK only): their profit so far this tax
  year, times a percentage **they choose** (their accountant may suggest one).
  The app does the arithmetic and nothing else.
- For an actual tax figure, the MTD screens ask **HMRC's own calculation**
  (Provisional figures), with HMRC's caveats shown.

## Files
- `src/lib/tax/taxPot.ts`: the person's percentage, the tax-year window, the
  arithmetic.
- `src/components/TaxPotCard.tsx`, `src/views/TaxPot.tsx`: the screen.

## History
An earlier estimator kept 2026/27 Income Tax and National Insurance rates in
the code (`ukTaxRates.ts`, `taxEstimator.ts`). No screen used it any more, and
it broke rule 4, so it was removed in November 2026. Don't bring it back: a
built-in rate goes out of date and states a wrong number with the app's
authority behind it.
