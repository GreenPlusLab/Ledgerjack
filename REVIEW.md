# Review guide

For anyone (human or AI) reviewing a change to LedgerJack. Keep findings short,
give a file and line as evidence, and say plainly when there is nothing to fix.

## What failure looks like here

Flag these as **Important**. Each one blocks the merge until fixed or answered.

1. **The money is wrong.** Floating-point arithmetic on amounts, rounding drift,
   an unbalanced transaction, a sign error, or anything that bypasses integer pence.
2. **Data leaks off the device.** Ledger contents sent to any network endpoint,
   written to logs, included in diagnostics, or placed in a URL.
3. **The app states a tax figure.** A hardcoded tax rate, allowance, threshold or
   deadline amount presented as fact. Users enter these; the app does not assert them.
4. **The crypto is weakened.** Lower PBKDF2 iterations, a fixed or reused IV,
   `Math.random` for keys or salts, extractable keys kept after unlock, or a new
   crypto library.
5. **The choke-points are bypassed.** Direct writes to `transactions` or `splits`
   instead of `src/lib/ledger.ts`, or reads that skip `loadWithSplits`.
6. **A backup cannot be restored.** Any change to backup or at-rest formats without
   a version field and a test proving older files still open.
7. **It claims something untrue.** UI text or docs that overstate what the app does
   (for example "files to HMRC" before that is live, or "fully encrypted" when some
   fields are not).

## What needs a person, not just a bot

Changes touching any high-risk path listed in `AGENTS.md` need the maintainer's
explicit approval, whoever or whatever wrote them. An automated approval never
replaces this.

## Evidence required in the pull request

- How it was tested (commands run and their result).
- The risk level (low, medium, high) and why.
- How to undo it.

## Keep noise down

- At most three style nits per review. Do not flag formatting that lint already covers.
- Do not repeat a finding already raised on the same pull request.
- If the same kind of bug appears in several places, name the pattern once and list
  the locations, so all of them are fixed together.
- Mark problems the change did not introduce as **Pre-existing**, not as the author's fault.

## Skip

- `package-lock.json`, `dist/`, generated files.
