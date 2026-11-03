/**
 * openrouterClient — one place that calls OpenRouter's OpenAI-compatible
 * endpoint. Every AI feature (scanning, support, insights) goes through this so
 * the key, headers and error handling are consistent.
 *
 * OpenRouter returns the real cost per call in usage.cost, which we surface so
 * the cost tracker shows actual spend, not just an estimate.
 */

import { OPENROUTER_BASE } from "./aiModels";

export interface ORMessage {
  role: "system" | "user" | "assistant";
  content: unknown; // string, or the OpenAI content-parts array (for images)
}

export interface ORResult {
  content: string;
  promptTokens: number;
  completionTokens: number;
  costUSD: number | null; // real cost from OpenRouter when provided
}

export async function callOpenRouter(
  model: string,
  messages: ORMessage[],
  apiKey: string,
  opts: { maxTokens?: number; temperature?: number } = {},
): Promise<ORResult> {
  if (!apiKey || apiKey.trim() === "") {
    throw new Error("Add your OpenRouter API key in Settings.");
  }

  const response = await fetch(OPENROUTER_BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      // Optional attribution headers (safe to send).
      "HTTP-Referer": "https://ledgerjack.com",
      "X-Title": "LedgerJack",
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: opts.maxTokens ?? 800,
      temperature: opts.temperature ?? 0,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`AI request failed (status ${response.status})${detail ? `: ${detail.slice(0, 160)}` : ""}`);
  }

  const data = await response.json();
  const usage = data.usage ?? {};
  return {
    content: data.choices?.[0]?.message?.content ?? "",
    promptTokens: usage.prompt_tokens ?? 0,
    completionTokens: usage.completion_tokens ?? 0,
    costUSD: typeof usage.cost === "number" ? usage.cost : null,
  };
}
