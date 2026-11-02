/**
 * supportService — the AI help assistant, via OpenRouter (cheap model).
 * Grounded in the help guide, app-usage only, never sees the ledger.
 */

import { HELP_GUIDE } from "./helpGuide";
import { SCANNING_DEFAULT } from "./aiModels";
import { callAI } from "./gateway";

export interface SupportTurn {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT = `You are LedgerJack's in-app help assistant. LedgerJack is a free, offline-first, privacy-focused bookkeeping app for self-employed people.

Rules you must follow:
- Answer ONLY using the HELP GUIDE below. If the answer is not in the guide, say you're not sure and suggest the "Report a problem" button to reach a human. Do not invent features, buttons or steps.
- You help with USING THE APP only. You must NOT give tax, accounting, bookkeeping or financial advice, and must not tell the user what they owe, can claim, or should do with their money. If asked, briefly say you can't advise on that, point them to the app's educational insights (which are labelled provisional) and to their accountant.
- Be concise, friendly and in plain English. No jargon.
- You do NOT have access to the user's financial data and must never ask for it.

HELP GUIDE:
${HELP_GUIDE}`;

export async function askSupport(
  question: string,
  apiKey: string,
  history: SupportTurn[] = [],
): Promise<string> {
  if (!apiKey || apiKey.trim() === "") {
    throw new Error("Add your OpenRouter key in Settings to use help.");
  }

  const model = SCANNING_DEFAULT; // cheap model is plenty for support
  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    ...history.map((t) => ({ role: t.role, content: t.content })),
    { role: "user" as const, content: question },
  ];

  const or = await callAI({ purpose: "question", model, messages, apiKey, maxTokens: 500, temperature: 0.2 });

  return or.content.trim() || "Sorry, I didn't catch that — try rephrasing.";
}
