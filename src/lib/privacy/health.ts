/**
 * Backup health and the recovery key check — pure functions, tested.
 */

import type { Colour } from "./choices";

export const AMBER_AFTER_DAYS = 14;
export const RED_AFTER_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface BackupHealth {
  colour: Colour;
  /** Whole days since the last backup, or null if never. */
  daysSince: number | null;
  headline: string;
  detail: string;
}

/**
 * Green when backed up in the last two weeks, amber after that, red after a
 * month or if never backed up. A backup kept only on this phone never counts
 * as green, because it is lost with the phone.
 */
export function backupHealth(lastBackupMs: number | null, now: number, keptOnPhoneOnly = false): BackupHealth {
  if (!lastBackupMs || lastBackupMs > now + DAY_MS) {
    return {
      colour: "red",
      daysSince: null,
      headline: "No backup yet",
      detail: "Your books live only on this phone. If you lose it, they're gone. One tap makes a locked backup.",
    };
  }
  const days = Math.max(0, Math.floor((now - lastBackupMs) / DAY_MS));
  const ago = days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
  if (days >= RED_AFTER_DAYS) {
    return { colour: "red", daysSince: days, headline: `Last backup ${ago}`, detail: "Anything added since then would be lost with your phone. Back up now." };
  }
  if (days >= AMBER_AFTER_DAYS || keptOnPhoneOnly) {
    return {
      colour: "amber",
      daysSince: days,
      headline: `Last backup ${ago}`,
      detail: keptOnPhoneOnly
        ? "This backup is only on this phone. Save a copy to your cloud, computer or USB stick."
        : "Worth backing up again soon.",
    };
  }
  return { colour: "green", daysSince: days, headline: `Backed up ${ago}`, detail: "Your books are safe if you lose your phone." };
}

// ── Recovery key ────────────────────────────────────────────────────────────

const GROUP = 4;

/** Split the recovery key into groups of 4 characters for reading and checking. */
export function keyGroups(key: string): string[] {
  const clean = key.replace(/\s+/g, "");
  const out: string[] = [];
  for (let i = 0; i < clean.length; i += GROUP) out.push(clean.slice(i, i + GROUP));
  return out;
}

/** The key as shown to people: groups separated by spaces. */
export function formatKey(key: string): string {
  return keyGroups(key).join(" ");
}

/**
 * Two different group positions (1-based) to ask for, from two random numbers.
 * The caller supplies the randomness so this stays testable.
 */
export function pickCheckPositions(groupCount: number, r1: number, r2: number): [number, number] {
  if (groupCount < 2) throw new Error("Recovery key is too short to check.");
  const a = Math.floor(Math.abs(r1) % groupCount);
  let b = Math.floor(Math.abs(r2) % (groupCount - 1));
  if (b >= a) b += 1;
  const [x, y] = a < b ? [a, b] : [b, a];
  return [x + 1, y + 1];
}

/** True when both typed groups match exactly (spaces ignored; letters are case-sensitive). */
export function checkKeyGroups(key: string, positions: [number, number], typed: [string, string]): boolean {
  const groups = keyGroups(key);
  return positions.every((p, i) => {
    const want = groups[p - 1];
    const got = (typed[i] ?? "").replace(/\s+/g, "");
    return !!want && got === want;
  });
}
