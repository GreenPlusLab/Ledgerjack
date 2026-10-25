/**
 * diagnostics — builds a plain-text problem report the user can read in full
 * before deciding to share it.
 *
 * DESIGN PRINCIPLE (borrowed from how resilient payment rails are described):
 * separate a "technical" failure — something wrong in the machinery that the
 * user can't see or explain — from a "business" one they caused and understand.
 * The technical signal is the useful one, and it's exactly what a solo
 * maintainer with no analytics and no server is otherwise blind to.
 *
 * HARD RULE: this report contains diagnostics ONLY. It never reads transaction
 * contents, descriptions, amounts, client names, memos or any ledger data. It
 * counts and categorises; it does not quote. And nothing leaves the device
 * until the user has seen the whole thing and chosen to share it themselves —
 * the same idea as checking the payee's name before the money moves.
 */

import { runSelfCheck } from "./selfCheck";
import { getRuntimeDecryptFailures, canEncryptAtRest } from "./atRest";
import { APP_VERSION } from "./brand";
import { db } from "./db";

export interface Diagnostics {
  version: string;
  when: string;
  environment: {
    userAgent: string;
    language: string;
    online: boolean;
    storagePersisted: boolean | "unknown";
  };
  health: {
    overall: string;
    checks: Array<{ label: string; status: string; count?: number }>;
  };
  counts: {
    transactions: number;
    accounts: number;
    mileageLogs: number;
    attachments: number;
  };
  signals: {
    vaultReady: boolean;
    runtimeDecryptFailures: number;
  };
}

async function storagePersisted(): Promise<boolean | "unknown"> {
  try {
    if (navigator.storage && navigator.storage.persisted) {
      return await navigator.storage.persisted();
    }
  } catch {
    /* ignore */
  }
  return "unknown";
}

/** Gather diagnostics. Reads counts and health only — never ledger contents. */
export async function collectDiagnostics(): Promise<Diagnostics> {
  const health = await runSelfCheck();

  // Counts only — how many rows, never what's in them.
  const [transactions, accounts, mileageLogs, attachments] = await Promise.all([
    db.transactions.count().catch(() => -1),
    db.accounts.count().catch(() => -1),
    db.mileage_logs.count().catch(() => -1),
    db.attachments.count().catch(() => -1),
  ]);

  return {
    version: APP_VERSION,
    when: new Date().toISOString(),
    environment: {
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
      language: typeof navigator !== "undefined" ? navigator.language : "unknown",
      online: typeof navigator !== "undefined" ? navigator.onLine : false,
      storagePersisted: await storagePersisted(),
    },
    health: {
      overall: health.overall,
      checks: health.checks.map((c) => ({ label: c.label, status: c.status, count: c.count })),
    },
    counts: { transactions, accounts, mileageLogs, attachments },
    signals: {
      vaultReady: canEncryptAtRest(),
      runtimeDecryptFailures: getRuntimeDecryptFailures(),
    },
  };
}

/**
 * Render diagnostics as plain text. This is EXACTLY what the user will see and
 * exactly what gets copied — there is no hidden field. What you read is what
 * you send.
 */
export function formatDiagnostics(d: Diagnostics, userNote?: string): string {
  const lines: string[] = [
    "LedgerJack problem report",
    "==========================",
    "",
    "This report was reviewed and shared by the user. It contains no",
    "transaction data — only app version, environment and health signals.",
    "",
  ];

  if (userNote && userNote.trim()) {
    lines.push("WHAT HAPPENED (in the user's words):", userNote.trim(), "");
  }

  lines.push(
    `App version:      ${d.version}`,
    `When:             ${d.when}`,
    "",
    "Environment",
    `  Browser:        ${d.environment.userAgent}`,
    `  Language:       ${d.environment.language}`,
    `  Online:         ${d.environment.online ? "yes" : "no"}`,
    `  Storage saved:  ${d.environment.storagePersisted}`,
    "",
    `Health check:     ${d.health.overall.toUpperCase()}`,
  );

  for (const c of d.health.checks) {
    const count = typeof c.count === "number" ? ` (${c.count})` : "";
    lines.push(`  ${c.status.toUpperCase().padEnd(7)} ${c.label}${count}`);
  }

  lines.push(
    "",
    "Data present (counts only — no contents)",
    `  Transactions:   ${d.counts.transactions}`,
    `  Accounts:       ${d.counts.accounts}`,
    `  Mileage logs:   ${d.counts.mileageLogs}`,
    `  Attachments:    ${d.counts.attachments}`,
    "",
    "Signals",
    `  Vault ready:    ${d.signals.vaultReady ? "yes" : "no"}`,
    `  Decrypt fails:  ${d.signals.runtimeDecryptFailures}`,
    "",
    "— end of report —",
  );

  return lines.join("\n");
}

/** The public repo where issues are filed. */
export const ISSUES_URL = "https://github.com/GreenPlusLab/Ledgerjack/issues/new";
