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
| Locked file kept on the phone | Lost with the phone | Easy | Red after a while (see 4.3) |
| Locked file on your own computer or USB stick | Safe | By hand | Green |
| Locked file in your own Google Drive, OneDrive, iCloud or Dropbox (via the phone's Share / Save to menu) | Safe | Easy | Green |
| Automatic backup to your own cloud | Safe and up to date | Easiest once set up | Green |

Exports for an accountant (PDF, spreadsheet) are not locked. They carry the
label "This copy isn't locked. Anyone with the file can read it."

## 2. Ready-made choices

| Choice | Receipts | Backup |
| --- | --- | --- |
| 1. Fully private | Type it in + text recognition | Locked file to own computer or USB |
| 2. Private and safe (default suggestion) | Text recognition | Locked file in own cloud |
| 3. Easy and free | Free online AI | Automatic backup to own cloud |
| 4. Most accurate | AI with your own account | Automatic backup to own cloud |
| Make my own | Any | Any (no backup shows a clear warning) |

Rules:
- Overall privacy is set by the weakest part, not an average.
- "No backup" never appears in a ready-made choice.
- Every choice states its cost plainly. Everything can be changed in one tap.
- Suggested first release: choices 1, 2 and 4. Add 3 later.

## 3. The waiter (first-run questions)

A short, friendly set of questions that recommends a choice, like a waiter
helping a hungry customer. It is fixed text written by us, not AI: it works
offline, costs nothing and always gives the same answer for the same answers.

1. How private do you want your receipts? (Never leave my phone / A trusted
   company may read them to save me time / I'm not fussed)
2. Would you pay a little for the most accurate reading? (Yes, a few pence a
   receipt / No, it has to be free)
3. Where would you like your backup kept? (My Google Drive, OneDrive or iCloud /
   My own computer or a USB stick / Help me choose)

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
