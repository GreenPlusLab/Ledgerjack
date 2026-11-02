/**
 * What each outside service does with what you send it — plain words, with the
 * date we last checked, so labels never silently go out of date.
 *
 * When any entry changes, bump its `version`. People who chose an option that
 * uses that service are then told what changed and asked again (re-ask), rather
 * than the app quietly changing what it promised.
 *
 * Sources are listed with each entry. Check them every few months and after any
 * provider announcement.
 */

import type { ReadingOption } from "./choices";

export interface ServiceTerms {
  /** Bump when the wording below changes in substance. */
  version: string;
  /** When the source was last checked (YYYY-MM-DD). */
  checked: string;
  name: string;
  /** What happens to what you send, in plain words. */
  summary: string[];
  sources: { title: string; url: string }[];
}

export const TERMS: Record<"openrouterPaid" | "openrouterFree", ServiceTerms> = {
  openrouterPaid: {
    version: "2026-11-02",
    checked: "2026-11-02",
    name: "OpenRouter with your own account",
    summary: [
      "Your receipt or question goes through OpenRouter to the AI model you picked.",
      "In your OpenRouter privacy settings you can turn off any model provider that may train on what you send.",
      "You pay the AI company a few pence per receipt. LedgerJack never sees your key or your receipts.",
    ],
    sources: [{ title: "OpenRouter privacy and logging", url: "https://openrouter.ai/docs/guides/privacy/provider-logging" }],
  },
  openrouterFree: {
    version: "2026-11-02",
    checked: "2026-11-02",
    name: "Free models with a free OpenRouter account",
    summary: [
      "Your receipt or question goes through OpenRouter to a free AI model.",
      "Some free models are run by companies that may use what you send to train their AI; others don't.",
      "In your OpenRouter privacy settings you can turn off free models that may train on what you send. Fewer free models will then work.",
      "Free accounts have daily limits (around 50 requests a day at the time we checked).",
    ],
    sources: [
      { title: "OpenRouter privacy and logging", url: "https://openrouter.ai/docs/guides/privacy/provider-logging" },
      { title: "TrueFoundry: OpenRouter free models, what's actually free (October 2026)", url: "https://www.truefoundry.com/blog/openrouter-free-models-whats-actually-free-and-what-it-costs-you" },
    ],
  },
};

/**
 * Not offered, and why — kept here so nobody adds it back without reading this.
 *
 * Google Gemini free tier: Google's Gemini API Additional Terms (last updated
 * 2026-04-28) say "Do not submit sensitive, confidential, or personal
 * information to the Unpaid Services", and outside the EEA, Switzerland and the
 * UK free-tier content is used to improve Google's products, with human review.
 * Receipts are personal financial information, so LedgerJack does not offer it.
 * Source: https://ai.google.dev/terms
 */
export const NOT_OFFERED = ["Google Gemini free tier"] as const;

/** Which terms apply to a reading option (none for options that stay on the phone). */
export function termsFor(reading: ReadingOption): ServiceTerms | null {
  if (reading === "ownKey") return TERMS.openrouterPaid;
  if (reading === "freeAI") return TERMS.openrouterFree;
  return null;
}

/** The version string to store with a choice. */
export function termsVersionFor(reading: ReadingOption): string {
  return termsFor(reading)?.version ?? "";
}

/** True when the terms behind the person's choice changed since they chose it. */
export function needsReask(reading: ReadingOption, storedVersion: string): boolean {
  const t = termsFor(reading);
  return !!t && t.version !== storedVersion;
}
