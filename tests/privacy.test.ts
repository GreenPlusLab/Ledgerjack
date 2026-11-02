import { describe, it, expect } from "vitest";
import {
  BACKUP_OPTIONS, PRESETS, PRESET_ORDER, READING_OPTIONS, WAITER_QUESTIONS,
  choiceWarnings, makeChoice, parseChoice, presetFor, privacyColour, recommend, safetyColour, weakest,
  type WaiterAnswers,
} from "../src/lib/privacy/choices";
import { backupHealth, checkKeyGroups, formatKey, keyGroups, pickCheckPositions, AMBER_AFTER_DAYS, RED_AFTER_DAYS } from "../src/lib/privacy/health";
import { addEntry, monthsToShow, parseLog, summariseMonth, type LeftEntry } from "../src/lib/privacy/leftPhone";
import { needsReask, termsFor, termsVersionFor, TERMS } from "../src/lib/privacy/terms";

const answers = (o: Partial<WaiterAnswers> = {}): WaiterAnswers => ({ privacy: "never", pay: "no", backup: "cloud", data: "fine", ...o });

describe("ready-made choices", () => {
  it("are the four agreed ones, with the private one first", () => {
    expect(PRESET_ORDER).toEqual(["privateSafe", "fullyPrivate", "mostAccurate", "easyFree"]);
    expect(PRESETS.privateSafe).toMatchObject({ reading: "ocr", backup: "cloudShare" });
    expect(PRESETS.fullyPrivate).toMatchObject({ reading: "ocr", backup: "computer" });
    expect(PRESETS.mostAccurate).toMatchObject({ reading: "ownKey", backup: "cloudShare" });
    expect(PRESETS.easyFree).toMatchObject({ reading: "freeAI", backup: "cloudShare" });
  });
  it("never include 'no backup'", () => {
    for (const id of PRESET_ORDER) expect(PRESETS[id].backup).not.toBe("none");
  });
  it("are recognised from their settings, and anything else is custom", () => {
    expect(presetFor("ocr", "cloudShare")).toBe("privateSafe");
    expect(presetFor("manual", "webdav")).toBe("custom");
  });
});

describe("colours", () => {
  it("follow the agreed meanings", () => {
    expect(READING_OPTIONS.manual.colour).toBe("green");
    expect(READING_OPTIONS.ocr.colour).toBe("green");
    expect(READING_OPTIONS.ownKey.colour).toBe("amber");
    expect(READING_OPTIONS.freeAI.colour).toBe("orange");
    expect(BACKUP_OPTIONS.none.colour).toBe("red");
    expect(BACKUP_OPTIONS.cloudShare.colour).toBe("green");
  });
  it("keep red only for risk of loss, never for a privacy choice", () => {
    for (const o of Object.values(READING_OPTIONS)) expect(o.colour).not.toBe("red");
  });
  it("always come with a word, so colour is never the only signal", () => {
    for (const o of [...Object.values(READING_OPTIONS), ...Object.values(BACKUP_OPTIONS)]) expect(o.word.length).toBeGreaterThan(5);
  });
  it("take the weakest part overall, not an average", () => {
    expect(weakest("green", "orange", "green")).toBe("orange");
    expect(weakest("amber", "red")).toBe("red");
    expect(weakest()).toBe("green");
    expect(privacyColour({ reading: "freeAI" })).toBe("orange");
    expect(safetyColour({ backup: "none" })).toBe("red");
  });
});

describe("the waiter", () => {
  it("asks four plain questions", () => {
    expect(WAITER_QUESTIONS.map((q) => q.key)).toEqual(["privacy", "pay", "backup", "data"]);
  });
  it("suggests Private and safe for someone who wants privacy and has a cloud", () => {
    const r = recommend(answers());
    expect(r.preset).toBe("privateSafe");
    expect(r.summary).toBe(PRESETS.privateSafe.summary);
  });
  it("keeps receipts on the phone whenever privacy comes first, even if they'd pay", () => {
    expect(recommend(answers({ pay: "yes" })).reading).toBe("ocr");
  });
  it("suggests the most accurate option to someone who trusts a company and will pay", () => {
    expect(recommend(answers({ privacy: "trusted", pay: "yes" })).preset).toBe("mostAccurate");
  });
  it("only suggests free AI to someone who isn't fussed about privacy", () => {
    expect(recommend(answers({ privacy: "notFussed" })).preset).toBe("easyFree");
    const trustedFree = recommend(answers({ privacy: "trusted" }));
    expect(trustedFree.reading).toBe("ocr");
    expect(trustedFree.goodToKnow.join(" ")).toMatch(/free online AI is also available/);
  });
  it("maps backup answers, and helps people who aren't sure", () => {
    expect(recommend(answers({ backup: "computer" })).preset).toBe("fullyPrivate");
    expect(recommend(answers({ backup: "server" })).backup).toBe("webdav");
    expect(recommend(answers({ backup: "help" })).goodToKnow.join(" ")).toMatch(/Google Drive, OneDrive or iCloud/);
  });
  it("turns on data saver for limited mobile data", () => {
    expect(recommend(answers({ data: "limited" })).dataSaver).toBe(true);
    expect(recommend(answers()).dataSaver).toBe(false);
  });
  it("always says the price, in a Good to know line", () => {
    for (const privacy of ["never", "trusted", "notFussed"] as const)
      for (const pay of ["yes", "no"] as const)
        for (const backup of ["cloud", "computer", "server", "help"] as const) {
          const r = recommend(answers({ privacy, pay, backup }));
          expect(r.goodToKnow.length).toBeGreaterThan(0);
          expect(r.summary.length).toBeGreaterThan(10);
        }
  });
  it("gives the same answer every time", () => {
    expect(recommend(answers({ privacy: "trusted", pay: "yes" }))).toEqual(recommend(answers({ privacy: "trusted", pay: "yes" })));
  });
});

describe("saving a choice", () => {
  it("records the preset, data saver, terms version and date", () => {
    const c = makeChoice("ownKey", "cloudShare", true, "v1", new Date("2026-11-02T10:00:00Z"));
    expect(c).toEqual({ reading: "ownKey", backup: "cloudShare", dataSaver: true, preset: "mostAccurate", termsVersion: "v1", chosenAt: "2026-11-02" });
    expect(parseChoice(JSON.stringify(c))).toEqual(c);
  });
  it("refuses unknown or broken stored values", () => {
    expect(parseChoice(null)).toBeNull();
    expect(parseChoice("{oops")).toBeNull();
    expect(parseChoice(JSON.stringify({ reading: "telepathy", backup: "cloudShare" }))).toBeNull();
  });
  it("warns before a risky hand-made choice", () => {
    expect(choiceWarnings({ reading: "manual", backup: "none" })[0]).toMatch(/books are gone/);
    expect(choiceWarnings({ reading: "freeAI", backup: "cloudShare" })[0]).toMatch(/train/);
    expect(choiceWarnings({ reading: "ocr", backup: "cloudShare" })).toEqual([]);
  });
});

describe("backup health light", () => {
  const day = 86_400_000;
  const now = Date.parse("2026-11-02T12:00:00Z");
  it("is red with no backup", () => expect(backupHealth(null, now).colour).toBe("red"));
  it("is green when recent", () => expect(backupHealth(now - 2 * day, now)).toMatchObject({ colour: "green", daysSince: 2, headline: "Backed up 2 days ago" }));
  it("turns amber after two weeks and red after a month", () => {
    expect(backupHealth(now - AMBER_AFTER_DAYS * day, now).colour).toBe("amber");
    expect(backupHealth(now - RED_AFTER_DAYS * day, now).colour).toBe("red");
  });
  it("never shows green for a backup kept only on this phone", () => {
    expect(backupHealth(now - day, now, true).colour).toBe("amber");
  });
  it("treats a date in the future as no backup rather than trusting it", () => {
    expect(backupHealth(now + 5 * day, now).colour).toBe("red");
  });
  it("says today and yesterday in plain words", () => {
    expect(backupHealth(now, now).headline).toBe("Backed up today");
    expect(backupHealth(now - day, now).headline).toBe("Backed up yesterday");
  });
});

describe("recovery key check", () => {
  const key = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789+/AbCd=";
  it("shows the key in groups of four", () => {
    expect(keyGroups(key)[0]).toBe("AbCd");
    expect(formatKey(key).split(" ").length).toBe(Math.ceil(key.length / 4));
  });
  it("picks two different positions", () => {
    for (let i = 0; i < 50; i++) {
      const [a, b] = pickCheckPositions(11, i * 7, i * 13);
      expect(a).toBeLessThan(b);
      expect(a).toBeGreaterThanOrEqual(1);
      expect(b).toBeLessThanOrEqual(11);
    }
  });
  it("accepts the right groups, ignoring spaces, and refuses anything else", () => {
    expect(checkKeyGroups(key, [1, 3], ["AbCd", " IjKl "])).toBe(true);
    expect(checkKeyGroups(key, [1, 3], ["abcd", "IjKl"])).toBe(false);
    expect(checkKeyGroups(key, [1, 3], ["AbCd", ""])).toBe(false);
    expect(checkKeyGroups(key, [1, 99], ["AbCd", "x"])).toBe(false);
  });
});

describe("What left my phone", () => {
  const e = (at: string, kind: LeftEntry["kind"], to: string, locked = false): LeftEntry => ({ at, kind, to, locked });
  it("summarises a month in plain sentences, never the content", () => {
    const log = [
      e("2026-11-01T09:00:00Z", "receipt-ai", "OpenRouter (GPT-4o mini)"),
      e("2026-11-02T09:00:00Z", "receipt-ai", "OpenRouter (GPT-4o mini)"),
      e("2026-11-02T10:00:00Z", "backup", "your Share menu", true),
      e("2026-10-30T10:00:00Z", "backup", "your Share menu", true),
    ];
    const s = summariseMonth(log, "2026-11");
    expect(s.lines).toEqual(["2 receipts sent for AI reading to OpenRouter (GPT-4o mini).", "1 locked backup saved to your Share menu."]);
    expect(summariseMonth([], "2026-11").nothing).toBe(true);
  });
  it("keeps 13 months and drops older entries", () => {
    const now = new Date("2026-11-02T00:00:00Z");
    const next = addEntry([e("2025-01-01T00:00:00Z", "backup", "x", true)], e("2026-11-02T00:00:00Z", "backup", "x", true), now);
    expect(next.length).toBe(1);
  });
  it("ignores corrupt stored entries", () => {
    expect(parseLog(JSON.stringify([{ at: "2026-11-01", kind: "nonsense", to: "x", locked: true }, e("2026-11-01T00:00:00Z", "hmrc", "HMRC", false)]))).toHaveLength(1);
    expect(parseLog("not json")).toEqual([]);
  });
  it("always shows the current month, newest first", () => {
    expect(monthsToShow([e("2026-09-01T00:00:00Z", "hmrc", "HMRC")], new Date("2026-11-02T00:00:00Z"))).toEqual(["2026-11", "2026-09"]);
  });
});

describe("service terms and re-asking", () => {
  it("only applies to options that send receipts away", () => {
    expect(termsFor("manual")).toBeNull();
    expect(termsFor("ocr")).toBeNull();
    expect(termsFor("ownKey")).toBe(TERMS.openrouterPaid);
    expect(termsFor("freeAI")).toBe(TERMS.openrouterFree);
  });
  it("asks again only when the terms behind the choice changed", () => {
    expect(needsReask("freeAI", termsVersionFor("freeAI"))).toBe(false);
    expect(needsReask("freeAI", "2020-01-01")).toBe(true);
    expect(needsReask("ocr", "")).toBe(false);
  });
  it("dates every entry and gives a source", () => {
    for (const t of Object.values(TERMS)) {
      expect(t.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(t.sources.length).toBeGreaterThan(0);
    }
  });
});
