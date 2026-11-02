/**
 * AI policy — the rules every AI request must pass, as pure functions.
 *
 * - Receipts are only sent to AI if the person chose an AI option, or asked for
 *   "just this one" (a per-receipt choice).
 * - Questions (help, insights) are only sent when the person asks, and need an
 *   AI account; the label shows where they go.
 * - Paid AI stops when this month's spending reaches the person's limit.
 * - Free models are used for the "Free online AI" choice; paid models otherwise.
 */

import type { Colour, PrivacyChoice, ReadingOption } from "../privacy/choices";

export type AIPurpose = "receipt" | "question";

export interface PolicyInput {
  choice: PrivacyChoice | null;
  purpose: AIPurpose;
  /** The person tapped "Read just this one with AI". */
  justThisOne: boolean;
  hasKey: boolean;
  /** This month's AI spending so far, in US dollars. */
  spentUSD: number;
  /** Monthly limit in US dollars, or null for none. */
  limitUSD: number | null;
}

export type PolicyResult =
  | { ok: true; route: "free" | "paid"; colour: Colour }
  | { ok: false; code: "ai-off" | "no-key" | "limit"; message: string };

/**
 * People who set up an AI key before privacy choices existed keep working as
 * "AI with your own account" until they choose; everyone else starts private.
 */
export function effectiveReading(choice: PrivacyChoice | null, hasKey: boolean): ReadingOption {
  if (choice) return choice.reading;
  return hasKey ? "ownKey" : "manual";
}

export function checkPolicy(p: PolicyInput): PolicyResult {
  const reading = effectiveReading(p.choice, p.hasKey);
  const aiChosen = reading === "ownKey" || reading === "freeAI";

  if (p.purpose === "receipt" && !aiChosen && !p.justThisOne) {
    return {
      ok: false,
      code: "ai-off",
      message: "Reading receipts with AI is off in your privacy choices, so nothing was sent. You can read just this one with AI, or change your choices in Settings.",
    };
  }
  if (!p.hasKey) {
    return {
      ok: false,
      code: "no-key",
      message: reading === "freeAI"
        ? "Add your free OpenRouter account key in Settings to use free online AI."
        : "Add your AI account key in Settings to use AI.",
    };
  }

  const route: "free" | "paid" = reading === "freeAI" ? "free" : "paid";
  if (route === "paid" && p.limitUSD !== null && p.spentUSD >= p.limitUSD) {
    return {
      ok: false,
      code: "limit",
      message: p.limitUSD === 0
        ? "Paid AI is paused: your monthly AI limit is $0. Change it in Settings, Your privacy choices."
        : `This month's AI spending has reached your limit of $${p.limitUSD.toFixed(2)}, so paid AI is paused until next month. Change it in Settings, Your privacy choices.`,
    };
  }
  return { ok: true, route, colour: route === "free" ? "orange" : "amber" };
}

// ── Free models ─────────────────────────────────────────────────────────────

export interface ORModelInfo {
  id: string;
  name?: string;
  pricing?: { prompt?: string | number; completion?: string | number };
  architecture?: { input_modalities?: string[] };
}

/** Preferred free models for reading receipts, best first. Checked 2026-11-02. */
export const FREE_RECEIPT_PREFERENCE = [
  "google/gemma-4-31b-it:free",
  "nvidia/nemotron-3.5-super-vl:free",
  "google/gemma-4-26b-a4b-it:free",
];
/** OpenRouter's own router that picks any available free model. */
export const FREE_ROUTER = "openrouter/free";

export function isFreeModel(m: ORModelInfo): boolean {
  return Number(m.pricing?.prompt) === 0 && Number(m.pricing?.completion) === 0;
}

export function readsImages(m: ORModelInfo): boolean {
  return (m.architecture?.input_modalities ?? []).includes("image");
}

/**
 * Pick a free model: a preferred one that is still free (and reads images, if
 * needed), else any free model that fits, else OpenRouter's free router.
 */
export function pickFreeModel(models: ORModelInfo[], needsImages: boolean): string {
  const ok = (m: ORModelInfo) => isFreeModel(m) && (!needsImages || readsImages(m)) && !/content-safety|lyria/i.test(m.id);
  const byId = new Map(models.map((m) => [m.id, m]));
  for (const id of FREE_RECEIPT_PREFERENCE) {
    const m = byId.get(id);
    if (m && ok(m)) return id;
  }
  const any = models.find((m) => ok(m) && m.id !== FREE_ROUTER);
  return any?.id ?? FREE_ROUTER;
}

/** Plain name of where a request goes, for labels and "What left my phone". */
export function destinationLabel(modelId: string, modelName?: string): string {
  return `OpenRouter (${modelName ?? modelId})`;
}
