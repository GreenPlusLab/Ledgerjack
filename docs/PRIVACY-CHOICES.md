# Privacy choices: reading receipts and backups

Status: agreed design, not built yet. English only for now.

LedgerJack is free and private. People on tight budgets should still get quick
receipt reading and safe backups, and everyone should see, in plain words, what
each choice costs in money and in privacy. Nobody is pushed; the most private
choice is the default.

## 1. The options

### Reading receipts

| Option | Where the receipt goes | Cost | Colour |
| --- | --- | --- | --- |
| Type it in | Nowhere | Free | Green |
| Text recognition (OCR) on the phone | Nowhere, read on the phone | Free | Green |
| AI with your own account (API key) | To the AI company, which does not train on it | A few pence per receipt | Amber |
| Free online AI | To the AI company, which may use it to train its AI | Free, with daily limits | Orange |

- "Free online AI" is only offered for services whose terms say what they do
  with the data, checked for the person's country (for example, Google's free
  tier trains on prompts outside the UK, EU and EEA). Each label shows the date
  the terms were checked.
- Services that require agreeing to training on the data are not offered.
- Whatever reads the receipt, the app checks every field with its own rules,
  does every sum itself, and the person confirms before anything is saved.

### Backup

Every backup is locked (AES-256-GCM, rule 5 in AGENTS.md) on the phone before it
leaves, so only the person can open it. Cloud companies see only that a locked
file exists, its size and when it changed.

| Option | If the phone is lost | Effort | Colour |
| --- | --- | --- | --- |
| No backup | Everything is lost | None | Red |
| Locked file kept on the phone | Lost with the phone | Easy | Red after a while (see 5.3) |
| Locked file on your own computer or USB stick | Safe | By hand | Green |
| Locked file in your own Google Drive, OneDrive, iCloud or Dropbox (via the phone's Share / Save to menu) | Safe | Easy | Green |
| Locked file to your own WebDAV / Nextcloud server | Safe | Set up once | Green |

LedgerJack does not connect to people's cloud accounts (see the design decision
in `src/lib/cloudbackup/destinations.ts`): that would mean storing account
tokens in the browser, approval processes with each provider, and links that
break when a provider changes its rules. The phone's own Share / Save to menu
already reaches every cloud, email and USB. The backup health light (5.3) does
the reminding.

Exports for an accountant (PDF, spreadsheet) are not locked. They carry the
label "This copy isn't locked. Anyone with the file can read it."

## 2. Ready-made choices

| Choice | Receipts | Backup |
| --- | --- | --- |
| 1. Fully private | Type it in + text recognition | Locked file to own computer or USB |
| 2. Private and safe (default suggestion) | Text recognition | Locked file in own cloud |
| 3. Easy and free | Free online AI | Locked file in own cloud |
| 4. Most accurate | AI with your own account | Locked file in own cloud |
| Make my own | Any | Any (no backup shows a clear warning) |

Rules:
- Overall privacy is set by the weakest part, not an average.
- "No backup" never appears in a ready-made choice.
- Every choice states its cost plainly. Everything can be changed in one tap.
- All four ready-made choices ship at launch. People get clear, accurate
  information about each one and decide for themselves; LedgerJack never
  hides an option or makes the choice for them.

## 3. The waiter (first-run questions)

A short, friendly set of questions that recommends a choice, like a waiter
helping a hungry customer. It is fixed text written by us, not AI: it works
offline, costs nothing and always gives the same answer for the same answers.

1. How private do you want your receipts? (Never leave my phone / A trusted
   company may read them to save me time / I'm not fussed)
2. Would you pay a little for the most accurate reading? (Yes, a few pence a
   receipt / No, it has to be free)
3. Where would you like your backup kept? (My Google Drive, OneDrive or iCloud /
   My own computer or a USB stick / My own server / Help me choose)

Then one recommendation in plain words, with its colours, its cost, a "Good to
know" line, and buttons: Choose this / Show me the other options / Change
later in Settings.

Waiter rules: recommend, never push; always mention the price in money and
privacy; no jargon ("your own AI account", not "API key"; "locked", not
"encrypted"); "Make my own" is always available; the waiter can be asked again
from Settings.

## 4. Colours

| Colour | Meaning |
| --- | --- |
| Green 🔒 | Stays with you; nobody else can read it |
| Amber | A trusted company reads it but does not train on it |
| Orange ⚠ | A company reads it and may use it to train its AI |
| Red | Risk of losing your books |

- Never colour alone: every colour also has an icon and a word.
- Same meaning everywhere: the waiter, Settings and the label on each receipt.
- Red is only for real risk of loss, never for a fair choice like free AI.
- Check contrast in dark mode and on low-cost phone screens.

## 5. Extras

1. **"What left my phone" page.** A plain history, e.g. "This month: 3
   receipts sent to Google for reading. 1 locked backup saved to your Google
   Drive. Nothing else."
2. **Choose per receipt.** "Read just this one with AI", with its colour, for a
   receipt the phone can't read, without changing the main setting.
3. **Backup health light.** Green when backed up recently, amber after a couple
   of weeks, red after a month; one tap to back up.
4. **Practise restoring.** "Check my backup opens", to prove the backup works.
5. **Protect the recovery key.** Offer to print a recovery sheet or save it to a
   password manager, then ask the person to type back two of its words.
6. **AI spending cap.** Show the running cost ("£0.42 this month") and let the
   person set a monthly limit at which AI pauses. Builds on the existing AI
   cost tracker.
7. **Data-saver mode.** Text recognition works offline; backups can wait for
   Wi-Fi. Offered in the waiter.
8. **Re-ask when terms change.** If a service changes how it uses data, the app
   says so and asks again rather than silently changing what it promised.

Launch priorities: the backup health light (3), "What left my phone" (1) and
protecting the recovery key (5), then the waiter and the colours.

## 6. Later (agreed, not for the first build)

- **Better reading on the phone:** a small AI model that runs in the browser
  on the phone, offered only to phones that can handle it, after asking, and
  downloaded over Wi-Fi only. Colour green. Candidate models (e.g. Florence-2,
  SmolVLM, Moondream) are tested on real receipts for accuracy, speed and
  battery before any is offered, and their licences checked. A good student
  research task, after text recognition is built.
- **LedgerJack's own AI server, when funded:** open models on a server we
  control, nothing stored, nothing used for training. Colour green-amber. Only
  with funding, a data protection assessment and someone to run it. A UK/EU
  host with no-storage, no-training terms could be a cheaper first step.

## 7. What is built (November 2026)

All of sections 1 to 5 is built and tested, except where noted. Start here.

| Feature | Where |
| --- | --- |
| Options, ready-made choices, colours, the waiter's rules | `src/lib/privacy/choices.ts` (pure, tested in `tests/privacy.test.ts`) |
| The waiter | `src/components/privacy/Waiter.tsx`; in first run (`src/views/Onboarding.tsx`) and Settings, Your privacy choices (`src/views/PrivacySettings.tsx`) |
| Colour labels | `src/components/privacy/PrivacyBadge.tsx` (always icon + words) |
| Backup health light | `src/lib/privacy/health.ts`, `src/components/privacy/HomePrivacyCards.tsx`; the last backup time is now loaded at start-up (it wasn't before, so the old reminder always said "never backed up" after a restart) |
| Protect the recovery key | `src/components/privacy/RecoveryKeyCheck.tsx` (download, print, password app, then type back two groups with the key hidden); in first run and `src/views/RecoveryCheckView.tsx`; home-screen reminder until checked |
| What left my phone | `src/lib/privacy/leftPhone.ts`, `src/views/LeftMyPhone.tsx`; recorded for AI requests, backups, unlocked exports and shares, and HMRC submissions |
| Every AI request through one door | `src/lib/ai/gateway.ts` + `src/lib/ai/policy.ts` (tested in `tests/aiPolicy.test.ts`): privacy choice, "Read just this one with AI", free models, monthly limit, usage and the left-phone record |
| Free online AI | Free models with a free OpenRouter account, picked from OpenRouter's public list (`pickFreeModel`). Google's Gemini free tier is deliberately not offered: its terms say not to send personal information to the free tier (see `src/lib/privacy/terms.ts`) |
| AI spending cap | Settings, Your privacy choices, Monthly AI limit (US dollars, as AI companies bill) |
| Service terms and re-ask | `src/lib/privacy/terms.ts` (dated, with sources); bump `version` when a service changes and people who chose it are asked again |
| Text recognition on the phone | Tesseract (`tesseract.js`, Apache-2.0), files served from LedgerJack under `/ocr/` (see `vite.config.ts`), about 7 MB downloaded once after asking, cached for offline use. `src/lib/ocr/ocr.ts`; receipt text to suggested fields in `src/lib/ocr/receiptText.ts` (tested in `tests/receiptText.test.ts`). On the entry screen ("Read on this phone") and in Bulk receipts |
| Data saver | In the waiter and Settings; text recognition works offline; Wi-Fi hints for backups and the one-time download |
| "Coming soon" labels | Removed where there is no plan: LedgerJack server backup and auto-sync, the live accountant link, and the live bank feed |

Still to do (good student tasks):
- Test text recognition with many real receipt photos on low-cost phones;
  improve `receiptText.ts` with what fails (crumpled, faded, long receipts).
- Test AI reading with a real free OpenRouter account and a paid one.
- Accessibility check of the new screens (screen readers, contrast in dark mode).
- **Read bank statement PDFs on the phone.** Many people only get PDF
  statements, not CSV files. Reading them on the device (text recognition plus
  table layout, as Fastagger does for mobile money statements in Kenya: IEEE
  Spectrum, 3 November 2026) would close most of the gap with bank apps'
  automatic feeds without connecting to anyone's bank. Every line goes to
  Review, like receipts.
- **Watch real users before launch.** Spend time with five to ten sole traders
  (for example a plumber, a cleaner, a hairdresser) while they record a week of
  receipts. Busy people skim, so look for where checking is slow and simplify
  that, rather than adding more warnings.
- **A small AI model on the phone** to sort receipt text into fields, so the
  "read on this phone" option gets closer to online AI without anything leaving
  the device. Check each model's licence and test it on low-cost phones.
