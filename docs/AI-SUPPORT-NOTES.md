# AI tech support (roadmap item, AI theme step 4)

An in-app "Help & support" assistant that answers how-to questions about using
the app, using the user's own AI key. Your "outsource customer service to AI"
idea, built with guardrails.

## How to reach it
Settings -> "Help & support ›".

## New files
- src/lib/ai/helpGuide.ts — the ONLY content the assistant may answer from
  (accurate description of the app's features). Update this when features change.
- src/lib/ai/supportService.ts — the guarded AI call.
- src/views/Support.tsx — the chat screen + "Report a problem" human fallback.

## Guardrails (baked in)
- Answers ONLY from the help guide; says "I'm not sure, use Report a problem" for
  anything not covered (so it can't invent buttons or steps).
- Helps with USING THE APP only. Refuses tax/accounting/financial advice and
  points the user to the (provisional) insights feature and their accountant.
- Never receives the user's ledger/financial data — only their typed question.
- Runs on the user's own key, on the cheap recommended model (GPT-4o mini), and
  logs token usage so it shows in the AI cost tracker.
- Human fallback: "Report a problem" opens an email to SUPPORT_EMAIL in
  Support.tsx (the project contact address).

## Notes
- Keeps only the last few turns of context to control cost.
- If no AI key is set, the chat is disabled but "Report a problem" still works.

## Next in the theme
5. AI accountant insights (educational; ratios + deadline calendar + what-if) —
   the big differentiator.
