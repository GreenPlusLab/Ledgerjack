/**
 * Saving the recovery key: a file to download, and a printable sheet.
 */

import { formatKey } from "./health";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function recoveryFileBody(key: string, today = new Date()): string {
  return [
    "LedgerJack recovery key",
    `Made on ${today.toISOString().slice(0, 10)}`,
    "",
    "KEEP THIS SAFE AND PRIVATE. Anyone with this key can open your LedgerJack data WITHOUT your password.",
    "Do NOT keep it in the same place as your data backup.",
    "",
    "Recovery key (type it without the spaces):",
    formatKey(key),
    "",
    "Exact key:",
    key,
    "",
  ].join("\n");
}

export function recoverySheetHtml(key: string, today = new Date()): string {
  const groups = formatKey(key).split(" ");
  const cells = groups.map((g, i) => `<div class="g"><span>${i + 1}</span><b>${esc(g)}</b></div>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>LedgerJack recovery key</title>
<style>
body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#1B2420;margin:32px;max-width:640px}
h1{font-size:22px;margin:0 0 4px} p{font-size:13px;line-height:1.5}
.warn{border:2px solid #B9812A;border-radius:8px;padding:10px 12px;background:#FFF8E8}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:18px 0}
.g{border:1px solid #E7E2D6;border-radius:6px;padding:8px;text-align:center}
.g span{display:block;font-size:10px;color:#5A655F} .g b{font-family:ui-monospace,Menlo,monospace;font-size:18px;letter-spacing:1px}
.exact{font-family:ui-monospace,Menlo,monospace;font-size:12px;word-break:break-all;border-top:1px solid #E7E2D6;padding-top:10px}
</style></head><body>
<h1>LedgerJack recovery key</h1>
<p>Made on ${today.toISOString().slice(0, 10)}. The only way back into your books if you forget your password.</p>
<p class="warn"><strong>Keep this sheet private.</strong> Anyone with this key can open your LedgerJack data without your password. Keep it somewhere safe, and not in the same place as your backup.</p>
<div class="grid">${cells}</div>
<p>When you need it, type the groups in order, without the spaces.</p>
<p class="exact">Exact key: ${esc(key)}</p>
</body></html>`;
}

/** Open the printable sheet. Returns false if the browser blocked the window. */
export function printRecoverySheet(key: string): boolean {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.open();
  w.document.write(recoverySheetHtml(key));
  w.document.close();
  setTimeout(() => { try { w.print(); } catch { /* the person can print from the menu */ } }, 300);
  return true;
}
