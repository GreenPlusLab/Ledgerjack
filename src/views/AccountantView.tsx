/**
 * AccountantView — the bridge to a human accountant. Flag transactions to
 * discuss, then export/share an accountant pack (a plain note + a provisional
 * transactions CSV). A live read-only share link needs a backend (signposted).
 */

import { useEffect, useState } from "react";
import { ArrowLeft, Users, Flag, Download, Send, MessageCircle, Search } from "lucide-react";
import { useApp, useRegionConfig } from "../contexts/AppContext";
import { formatCurrency } from "../lib/currency";
import { getApprovedTransactions } from "../lib/ledger";
import { setAccountantFlag, getFlaggedTransactions, buildAccountantNote, type FlaggedItem } from "../lib/accountant/accountant";
import { exportTransactionsCSV, exportStatementsCSV } from "../lib/statements/exporters";
import { computeStatements } from "../lib/statements/statements";
import { computeSA103 } from "../lib/statements/sa103";
import { loadProfile } from "../lib/invoices/invoices";
import { shareViaWhatsApp, shareViaTelegram, shareViaEmail } from "../lib/share/share";

interface Row { id: string; date: string; description: string; amount: number; flagged: boolean }

export default function AccountantView({ onBack }: { onBack: () => void }) {
  const { region } = useApp();
  const cfg = useRegionConfig();
  const m = (c: number) => formatCurrency(c, region);

  // Current tax year from the region's fiscal-year start.
  const fy = (() => {
    const now = new Date();
    const sm = cfg.fiscalYearStart.month, sd = cfg.fiscalYearStart.day;
    const startThisYear = Date.UTC(now.getUTCFullYear(), sm - 1, sd);
    const startYear = now.getTime() >= startThisYear ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
    const from = new Date(Date.UTC(startYear, sm - 1, sd));
    const to = new Date(Date.UTC(startYear + 1, sm - 1, sd));
    to.setUTCDate(to.getUTCDate() - 1);
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
  })();

  const [flagged, setFlagged] = useState<FlaggedItem[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [packMsg, setPackMsg] = useState("");

  async function refresh() {
    setFlagged(await getFlaggedTransactions());
    const txns = await getApprovedTransactions();
    setRows(
      (txns as any[])
        .map((t) => ({
          id: t.id, date: t.date, description: t.description,
          amount: t.splits.reduce((mx: number, s: any) => Math.max(mx, Math.abs(s.amount)), 0),
          flagged: !!t.flag_accountant,
        }))
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 200),
    );
  }
  useEffect(() => { refresh(); loadProfile().then((p) => setBusinessName(p.name || "")); }, []);

  async function toggle(id: string, next: boolean) {
    await setAccountantFlag(id, next);
    await refresh();
  }

  async function shareNote(kind: "email" | "whatsapp" | "telegram") {
    const note = await buildAccountantNote(region, businessName, fy);
    if (kind === "email") shareViaEmail("Items to discuss — from LedgerJack", note);
    else if (kind === "whatsapp") shareViaWhatsApp(note);
    else shareViaTelegram(note);
  }

  async function downloadPack() {
    setPackMsg("Preparing…");
    try {
      const st = await computeStatements(fy.from, fy.to);
      const sa = region === "uk" ? await computeSA103(fy.from, fy.to) : null;
      exportStatementsCSV(st, sa);              // provisional statements + SA103 boxes
      await exportTransactionsCSV(fy.from, fy.to); // full transactions for the year
      setPackMsg(`Pack downloaded for ${fy.from} to ${fy.to}: SA103 + statements, and transactions.`);
    } catch (e) {
      setPackMsg(e instanceof Error ? e.message : "Couldn't prepare the pack.");
    }
  }

  const filtered = q.trim()
    ? rows.filter((r) => r.description.toLowerCase().includes(q.toLowerCase()))
    : rows.slice(0, 30);

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="p-1 -ml-1 text-slate-500"><ArrowLeft className="w-5 h-5" /></button>
        <Users className="w-5 h-5 text-brand-600" />
        <h2 className="text-lg font-bold text-slate-900">Your accountant</h2>
      </div>

      <p className="text-sm text-slate-500">
        Flag anything you want to raise with your accountant, then send them a pack. Keeping a professional
        in the loop is standard practice.
      </p>

      {/* Flagged items + share */}
      <div className="bg-white rounded-xl border border-line p-4 space-y-2">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Flagged to discuss ({flagged.length})</p>
        {flagged.length === 0 ? (
          <p className="text-xs text-ink-soft">Nothing flagged yet. Use the list below.</p>
        ) : (
          <div className="space-y-1">
            {flagged.map((it) => (
              <div key={it.id} className="flex items-center justify-between text-sm">
                <span className="text-slate-600 truncate">{it.date} · {it.description}</span>
                <span className="font-semibold text-slate-800 shrink-0">{m(it.amount)}</span>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          <button onClick={() => shareNote("email")} className="flex items-center gap-1 text-xs font-semibold text-brand-600"><Send className="w-3.5 h-3.5" /> Email note</button>
          <button onClick={() => shareNote("whatsapp")} className="flex items-center gap-1 text-xs font-semibold text-income"><MessageCircle className="w-3.5 h-3.5" /> WhatsApp</button>
          <button onClick={() => shareNote("telegram")} className="flex items-center gap-1 text-xs font-semibold text-sky-600"><Send className="w-3.5 h-3.5" /> Telegram</button>
        </div>
        <button onClick={downloadPack} className="w-full mt-1 flex items-center justify-center gap-1.5 bg-brand-600 text-white py-2 rounded-lg text-sm font-bold">
          <Download className="w-4 h-4" /> Download accountant pack
        </button>
        <p className="text-[10px] text-ink-soft">Tax year {fy.from} to {fy.to} · SA103 boxes + provisional statements + full transactions (CSV). Provisional — for your accountant to review.</p>
        {packMsg && <p className="text-[11px] text-slate-500">{packMsg}</p>}
      </div>

      {/* Browse to flag */}
      <div className="bg-white rounded-xl border border-line p-3 space-y-2">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Flag a transaction</p>
        <div className="flex items-center gap-2 border-2 border-slate-300 rounded-lg px-2">
          <Search className="w-4 h-4 text-ink-soft" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search descriptions" className="flex-1 py-2 text-sm outline-none" />
        </div>
        <div className="space-y-1 max-h-80 overflow-auto">
          {filtered.map((r) => (
            <button key={r.id} onClick={() => toggle(r.id, !r.flagged)} className="w-full flex items-center gap-2 text-left py-1.5 border-b border-slate-50">
              <Flag className={`w-4 h-4 shrink-0 ${r.flagged ? "text-amber-500 fill-amber-400" : "text-slate-300"}`} />
              <span className="flex-1 min-w-0 text-sm text-slate-700 truncate">{r.date} · {r.description}</span>
              <span className="text-sm font-semibold text-slate-800 shrink-0">{m(r.amount)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
