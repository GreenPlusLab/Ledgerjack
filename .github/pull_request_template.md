## What this changes

<!-- One or two sentences. Link the issue if there is one. -->

## Risk level

<!-- Tick one. See AGENTS.md for the high-risk paths. -->
- [ ] Low: docs, wording, styling, tests only
- [ ] Medium: ordinary feature or bug fix
- [ ] High: touches crypto, ledger, backups, tax-authority (MTD/VAT) code, workflows or dependencies

## How it was tested

<!-- Paste the commands you ran and their result. -->
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes
- [ ] `npm run build` passes
- [ ] New or changed money, tax, date or crypto logic has a unit test

## How to undo it

<!-- Usually "revert this pull request". Say if anything else is needed, such as a data migration. -->

## Checklist

- [ ] Amounts stay in integer pence
- [ ] No hardcoded tax rates, allowances or thresholds
- [ ] No user data leaves the device in a new way
- [ ] If AI wrote some or all of this, I have read the result and I am responsible for it
