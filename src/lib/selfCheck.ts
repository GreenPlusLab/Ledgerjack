/**
 * selfCheck — an "andon" for your books.
 *
 * Borrowed from Toyota's Jidoka idea: a machine that detects its own defects
 * and raises a flag, rather than quietly carrying on producing bad parts. Two
 * real bugs in this app were *silent* failures — a summary card that showed
 * £0.00 for weeks without complaining, and a save that failed behind a generic
 * message. A wrong number that looks confident is worse than a visible error.
 *
 * So this module actively inspects the stored data and reports what it finds.
 * It only reads; it never modifies anything.
 */

import { db } from "./db";
import { isEncrypted, tryDecField, getRuntimeDecryptFailures, canEncryptAtRest } from "./atRest";
import { getLastBackupTimestamp } from "./backup";

export type CheckStatus = "ok" | "warn" | "fail" | "unknown";

export interface CheckResult {
  id: string;
  /** Short label shown in the panel. */
  label: string;
  status: CheckStatus;
  /** Plain-English summary of what was found. */
  detail: string;
  /** Optional count of affected items. */
  count?: number;
  /** Optional view to navigate to in order to act on this. */
  action?: { label: string; view: string };
}

export interface SelfCheckReport {
  overall: CheckStatus;
  checks: CheckResult[];
  ranAt: number;
}

const DAY = 24 * 60 * 60 * 1000;

/** Worst status wins: fail > warn > unknown > ok. */
function worst(statuses: CheckStatus[]): CheckStatus {
  if (statuses.includes("fail")) return "fail";
  if (statuses.includes("warn")) return "warn";
  if (statuses.includes("unknown")) return "unknown";
  return "ok";
}

export async function runSelfCheck(): Promise<SelfCheckReport> {
  const checks: CheckResult[] = [];
  const vaultReady = canEncryptAtRest();

  const txns = await db.transactions.toArray();
  const splits = await db.splits.toArray();

  // ---- 1. Vault / encryption availability -------------------------------
  checks.push(
    vaultReady
      ? { id: "vault", label: "Vault", status: "ok", detail: "Unlocked — new entries are encrypted as they're saved." }
      : {
          id: "vault",
          label: "Vault",
          status: "warn",
          detail:
            "No encryption key is loaded right now, so entries saved in this session are stored unencrypted. Set up or unlock your vault, then run \"Encrypt older records\".",
          action: { label: "Open backup & security", view: "cloud-backup" },
        },
  );

  // ---- 2. Encryption coverage at rest -----------------------------------
  const plainDescriptions = txns.filter((t) => t.description && !isEncrypted(t.description)).length;
  const plainAmounts = splits.filter((s) => !s.amount_enc).length;
  const plainTotal = plainDescriptions + plainAmounts;
  const encryptableTotal = txns.length + splits.length;
  if (encryptableTotal === 0) {
    checks.push({ id: "coverage", label: "Encryption at rest", status: "ok", detail: "No records yet — nothing to encrypt." });
  } else if (plainTotal === 0) {
    checks.push({
      id: "coverage",
      label: "Encryption at rest",
      status: "ok",
      detail: "All descriptions and amounts are encrypted on this device.",
    });
  } else {
    checks.push({
      id: "coverage",
      label: "Encryption at rest",
      status: "warn",
      count: plainTotal,
      detail: `${plainTotal} older item${plainTotal === 1 ? " is" : "s are"} still stored unencrypted (${plainDescriptions} description${plainDescriptions === 1 ? "" : "s"}, ${plainAmounts} amount${plainAmounts === 1 ? "" : "s"}). They still work — they just aren't protected yet.`,
      action: { label: "Encrypt older records", view: "cloud-backup" },
    });
  }

  // ---- 3. Decryption integrity (the silent-failure check) ---------------
  if (!vaultReady) {
    checks.push({
      id: "decrypt",
      label: "Readable records",
      status: "unknown",
      detail: "Can't verify encrypted records while the vault is locked.",
    });
  } else {
    let unreadable = 0;
    for (const t of txns) {
      if (isEncrypted(t.description) && (await tryDecField(t.description)) === null) unreadable++;
    }
    for (const s of splits) {
      if (s.amount_enc) {
        const v = await tryDecField(s.amount_enc);
        if (v === null || !Number.isFinite(Number(v))) unreadable++;
      }
    }
    checks.push(
      unreadable === 0
        ? { id: "decrypt", label: "Readable records", status: "ok", detail: "Every encrypted record decrypts correctly." }
        : {
            id: "decrypt",
            label: "Readable records",
            status: "fail",
            count: unreadable,
            detail: `${unreadable} encrypted item${unreadable === 1 ? "" : "s"} could not be read back. Figures involving them may be wrong or show as zero. Restore from a backup, and don't rely on your totals until this is resolved.`,
            action: { label: "Restore from a backup", view: "cloud-backup" },
          },
    );
  }

  // ---- 4. Double-entry balance ------------------------------------------
  const byTxn = new Map<string, number[]>();
  const orphanSplits: string[] = [];
  const txnIds = new Set(txns.map((t) => t.id));
  for (const s of splits) {
    if (!txnIds.has(s.transaction_id)) {
      orphanSplits.push(s.id);
      continue;
    }
    const arr = byTxn.get(s.transaction_id) ?? [];
    // Use the decrypted amount when available, else the plaintext one.
    // NOTE: a failed decrypt must become NaN, NOT 0 — Number(null) is 0, which
    // would silently turn an unreadable amount into a real-looking zero and
    // then mis-report the entry as "unbalanced". Exactly the bug class this
    // module exists to catch.
    let value: number;
    if (s.amount_enc) {
      const plain = await tryDecField(s.amount_enc);
      value = plain === null ? NaN : Number(plain);
    } else {
      value = s.amount;
    }
    arr.push(value);
    byTxn.set(s.transaction_id, arr);
  }

  let unbalanced = 0;
  let tooFewSplits = 0;
  for (const t of txns) {
    const amounts = byTxn.get(t.id) ?? [];
    if (amounts.length < 2) {
      tooFewSplits++;
      continue;
    }
    if (amounts.some((n) => !Number.isFinite(n))) continue; // covered by the decrypt check
    const sum = amounts.reduce((a, b) => a + b, 0);
    if (sum !== 0) unbalanced++;
  }

  checks.push(
    unbalanced === 0
      ? { id: "balance", label: "Books balance", status: "ok", detail: "Every entry balances — money in equals money out." }
      : {
          id: "balance",
          label: "Books balance",
          status: "fail",
          count: unbalanced,
          detail: `${unbalanced} entr${unbalanced === 1 ? "y does" : "ies do"} not balance. Your totals may be wrong. Please review ${unbalanced === 1 ? "it" : "them"}.`,
          action: { label: "Review entries", view: "pending" },
        },
  );

  if (tooFewSplits > 0) {
    checks.push({
      id: "incomplete",
      label: "Complete entries",
      status: "fail",
      count: tooFewSplits,
      detail: `${tooFewSplits} entr${tooFewSplits === 1 ? "y is" : "ies are"} missing part of their record (an entry needs at least two sides). ${tooFewSplits === 1 ? "It" : "They"} may have been saved during an interrupted write.`,
      action: { label: "Review entries", view: "pending" },
    });
  }

  if (orphanSplits.length > 0) {
    checks.push({
      id: "orphans",
      label: "Stray records",
      status: "warn",
      count: orphanSplits.length,
      detail: `${orphanSplits.length} leftover record${orphanSplits.length === 1 ? "" : "s"} belong${orphanSplits.length === 1 ? "s" : ""} to an entry that no longer exists. Harmless, but untidy.`,
    });
  }

  // ---- 5. Failures seen during normal use this session -------------------
  const runtimeFailures = getRuntimeDecryptFailures();
  if (runtimeFailures > 0) {
    checks.push({
      id: "runtime",
      label: "Errors while reading",
      status: "warn",
      count: runtimeFailures,
      detail: `${runtimeFailures} record${runtimeFailures === 1 ? "" : "s"} failed to decrypt while you were using the app since it last started. If figures look wrong, this is why.`,
    });
  }

  // ---- 6. Backup freshness ----------------------------------------------
  const last = await getLastBackupTimestamp();
  if (last === null) {
    checks.push({
      id: "backup",
      label: "Backup",
      status: "warn",
      detail: "You've never taken a backup. Your data lives only on this device — if you lose it, it's gone.",
      action: { label: "Back up now", view: "cloud-backup" },
    });
  } else {
    const age = Date.now() - last;
    const days = Math.floor(age / DAY);
    // Weekly is the habit we ask for (and the backup light on the home screen turns amber after 14 days), so the
    // health check must agree — a stricter reminder and a laxer health check
    // would just teach people to ignore one of them.
    checks.push(
      age > 7 * DAY
        ? {
            id: "backup",
            label: "Backup",
            status: "warn",
            detail: `Your last backup was ${days} days ago. Aim for one a week, kept both here and in a cloud drive of your choice.`,
            action: { label: "Back up now", view: "cloud-backup" },
          }
        : { id: "backup", label: "Backup", status: "ok", detail: `Last backup ${days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"} ago`}. Remember to keep a copy off this device too.` },
    );
  }

  return { overall: worst(checks.map((c) => c.status)), checks, ranAt: Date.now() };
}
