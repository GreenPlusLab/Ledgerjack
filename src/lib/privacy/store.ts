/**
 * Saving and loading privacy choices, the "What left my phone" log, the AI
 * monthly limit and the recovery-key check, in db.settings. None of these are
 * secrets: they hold settings and plain counts, never receipts or figures.
 */

import { db } from "../db";
import { parseChoice, type PrivacyChoice } from "./choices";
import { addEntry, parseLog, type LeftEntry, type LeftKind } from "./leftPhone";

const CHOICE_KEY = "privacy_choice";
const LOG_KEY = "left_phone_log";
const LIMIT_KEY = "ai_monthly_limit_usd";
const RECOVERY_CHECKED_KEY = "recovery_key_checked";
export const CHOICE_CHANGED_EVENT = "ledgerjack:privacy-choice";

export async function loadChoice(): Promise<PrivacyChoice | null> {
  const row = await db.settings.get(CHOICE_KEY);
  return parseChoice(row?.value);
}

export async function saveChoice(choice: PrivacyChoice): Promise<void> {
  await db.settings.put({ key: CHOICE_KEY, value: JSON.stringify(choice) });
  try { window.dispatchEvent(new CustomEvent(CHOICE_CHANGED_EVENT)); } catch { /* not in a browser */ }
}

export async function loadLeftLog(): Promise<LeftEntry[]> {
  const row = await db.settings.get(LOG_KEY);
  return parseLog(row?.value);
}

/** Record that something left the phone. Best-effort: never blocks the action itself. */
export async function recordLeft(kind: LeftKind, to: string, locked: boolean, now = new Date()): Promise<void> {
  try {
    const log = await loadLeftLog();
    const next = addEntry(log, { at: now.toISOString(), kind, to, locked }, now);
    await db.settings.put({ key: LOG_KEY, value: JSON.stringify(next) });
  } catch { /* the record is a convenience; the action already happened */ }
}

/** Monthly AI limit in US dollars (OpenRouter bills in dollars), or null for no limit. */
export async function loadAiLimit(): Promise<number | null> {
  const row = await db.settings.get(LIMIT_KEY);
  const n = row ? Number(row.value) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export async function saveAiLimit(usd: number | null): Promise<void> {
  if (usd === null) await db.settings.delete(LIMIT_KEY);
  else await db.settings.put({ key: LIMIT_KEY, value: String(usd) });
}

export async function isRecoveryKeyChecked(): Promise<boolean> {
  return (await db.settings.get(RECOVERY_CHECKED_KEY))?.value === "true";
}

export async function markRecoveryKeyChecked(): Promise<void> {
  await db.settings.put({ key: RECOVERY_CHECKED_KEY, value: "true" });
}
