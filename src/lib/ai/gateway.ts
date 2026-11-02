/**
 * gateway — the one door every AI request goes through. It applies the
 * person's privacy choice and monthly limit (policy.ts), picks a free model for
 * the "Free online AI" choice, records usage and cost, and notes the request in
 * "What left my phone". Nothing reaches an AI company any other way.
 */

import { callOpenRouter, type ORMessage, type ORResult } from "./openrouterClient";
import { recordUsage, getMonthUsage, estimateMonthCost } from "./aiUsage";
import { getModel } from "./aiModels";
import { checkPolicy, destinationLabel, pickFreeModel, type AIPurpose, type ORModelInfo } from "./policy";
import { loadAiLimit, loadChoice, recordLeft } from "../privacy/store";

export class AIBlockedError extends Error {
  constructor(public code: "ai-off" | "no-key" | "limit", message: string) {
    super(message);
    this.name = "AIBlockedError";
  }
}

const FREE_LIST_KEY = "or_free_models";
const FREE_LIST_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** OpenRouter's public model list (no key, no personal data), cached for a day. */
export async function loadFreeModelList(): Promise<ORModelInfo[]> {
  try {
    const cached = localStorage.getItem(FREE_LIST_KEY);
    if (cached) {
      const { at, models } = JSON.parse(cached) as { at: number; models: ORModelInfo[] };
      if (Date.now() - at < FREE_LIST_MAX_AGE_MS && Array.isArray(models)) return models;
    }
  } catch { /* ignore cache problems */ }
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models");
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: ORModelInfo[] };
    const models = (data.data ?? [])
      .filter((m) => Number(m.pricing?.prompt) === 0 && Number(m.pricing?.completion) === 0)
      .map((m) => ({ id: m.id, name: m.name, pricing: m.pricing, architecture: { input_modalities: m.architecture?.input_modalities ?? [] } }));
    try { localStorage.setItem(FREE_LIST_KEY, JSON.stringify({ at: Date.now(), models })); } catch { /* ignore */ }
    return models;
  } catch {
    return [];
  }
}

export interface AIRequest {
  purpose: AIPurpose;
  /** The paid model the feature would normally use. */
  model: string;
  messages: ORMessage[];
  apiKey: string;
  maxTokens?: number;
  temperature?: number;
  /** The person tapped "Read just this one with AI". */
  justThisOne?: boolean;
  /** The request includes an image (a receipt photo). */
  hasImage?: boolean;
}

export interface AIResponse extends ORResult {
  model: string;
  route: "free" | "paid";
}

async function monthSpendUSD(): Promise<number> {
  return estimateMonthCost(await getMonthUsage()).totalUSD;
}

export async function callAI(req: AIRequest): Promise<AIResponse> {
  const [choice, limit, spent] = await Promise.all([loadChoice(), loadAiLimit(), monthSpendUSD()]);
  const decision = checkPolicy({
    choice,
    purpose: req.purpose,
    justThisOne: !!req.justThisOne,
    hasKey: !!req.apiKey && req.apiKey.trim() !== "",
    spentUSD: spent,
    limitUSD: limit,
  });
  if (!decision.ok) throw new AIBlockedError(decision.code, decision.message);

  let model = req.model;
  let name = getModel(model)?.label;
  if (decision.route === "free") {
    const list = await loadFreeModelList();
    model = pickFreeModel(list, !!req.hasImage);
    name = list.find((m) => m.id === model)?.name ?? model;
  }

  const or = await callOpenRouter(model, req.messages, req.apiKey, { maxTokens: req.maxTokens, temperature: req.temperature });
  recordUsage(model, or.promptTokens, or.completionTokens, or.costUSD).catch(() => { /* best-effort */ });
  void recordLeft(req.purpose === "receipt" ? "receipt-ai" : "question-ai", destinationLabel(model, name), false);
  return { ...or, model, route: decision.route };
}
