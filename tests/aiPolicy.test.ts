import { describe, it, expect } from "vitest";
import { checkPolicy, effectiveReading, pickFreeModel, FREE_ROUTER, type PolicyInput } from "../src/lib/ai/policy";
import { makeChoice, type ReadingOption } from "../src/lib/privacy/choices";

const input = (reading: ReadingOption | null, o: Partial<PolicyInput> = {}): PolicyInput => ({
  choice: reading ? makeChoice(reading, "cloudShare", false, "v") : null,
  purpose: "receipt", justThisOne: false, hasKey: true, spentUSD: 0, limitUSD: null, ...o,
});

describe("AI policy: receipts follow the privacy choice", () => {
  it("never sends a receipt when the choice keeps receipts on the phone", () => {
    for (const r of ["manual", "ocr"] as const) {
      const d = checkPolicy(input(r));
      expect(d.ok).toBe(false);
      if (!d.ok) expect(d.code).toBe("ai-off");
    }
  });
  it("sends just this one when the person asks, as paid (amber)", () => {
    expect(checkPolicy(input("ocr", { justThisOne: true }))).toEqual({ ok: true, route: "paid", colour: "amber" });
  });
  it("uses free models for Free online AI (orange) and paid for your own account (amber)", () => {
    expect(checkPolicy(input("freeAI"))).toEqual({ ok: true, route: "free", colour: "orange" });
    expect(checkPolicy(input("ownKey"))).toEqual({ ok: true, route: "paid", colour: "amber" });
  });
  it("lets questions through when there is a key, whatever the receipt choice", () => {
    expect(checkPolicy(input("manual", { purpose: "question" })).ok).toBe(true);
  });
  it("asks for a key when there isn't one, after the privacy check", () => {
    const d = checkPolicy(input("freeAI", { hasKey: false }));
    expect(d.ok).toBe(false);
    if (!d.ok) { expect(d.code).toBe("no-key"); expect(d.message).toMatch(/free OpenRouter/); }
    const off = checkPolicy(input("ocr", { hasKey: false }));
    if (!off.ok) expect(off.code).toBe("ai-off");
  });
  it("keeps people who set up a key before privacy choices existed working", () => {
    expect(effectiveReading(null, true)).toBe("ownKey");
    expect(effectiveReading(null, false)).toBe("manual");
  });
});

describe("AI policy: monthly limit", () => {
  it("pauses paid AI once the limit is reached", () => {
    const d = checkPolicy(input("ownKey", { spentUSD: 3, limitUSD: 3 }));
    expect(d.ok).toBe(false);
    if (!d.ok) { expect(d.code).toBe("limit"); expect(d.message).toMatch(/\$3\.00/); }
    expect(checkPolicy(input("ownKey", { spentUSD: 2.99, limitUSD: 3 })).ok).toBe(true);
  });
  it("treats a $0 limit as paused", () => {
    const d = checkPolicy(input("ownKey", { limitUSD: 0 }));
    if (!d.ok) expect(d.message).toMatch(/paused/);
    else throw new Error("should be paused");
  });
  it("never blocks free models, which cost nothing", () => {
    expect(checkPolicy(input("freeAI", { spentUSD: 10, limitUSD: 0 })).ok).toBe(true);
  });
});

describe("picking a free model", () => {
  const free = (id: string, image = true) => ({ id, pricing: { prompt: "0", completion: "0" }, architecture: { input_modalities: image ? ["text", "image"] : ["text"] } });
  const paid = (id: string) => ({ id, pricing: { prompt: "0.000001", completion: "0.000002" }, architecture: { input_modalities: ["text", "image"] } });
  it("prefers the agreed models while they're still free", () => {
    expect(pickFreeModel([free("x/any:free"), free("google/gemma-4-31b-it:free")], true)).toBe("google/gemma-4-31b-it:free");
  });
  it("skips a preferred model that's no longer free, or can't read images", () => {
    expect(pickFreeModel([paid("google/gemma-4-31b-it:free"), free("x/any:free")], true)).toBe("x/any:free");
    expect(pickFreeModel([free("google/gemma-4-31b-it:free", false), free("x/vision:free")], true)).toBe("x/vision:free");
  });
  it("never picks a content-safety model, and falls back to OpenRouter's free router", () => {
    expect(pickFreeModel([free("nvidia/nemotron-3.5-content-safety:free")], true)).toBe(FREE_ROUTER);
    expect(pickFreeModel([], true)).toBe(FREE_ROUTER);
  });
});
