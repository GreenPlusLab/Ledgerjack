/**
 * BankReconcile — import a bank CSV and reconcile it against recorded
 * transactions, or read about connecting a live feed. Privacy-first: CSV keeps
 * everything on-device; a live feed needs a regulated provider (signposted).
 */

import { useState } from "react";
import { ArrowLeft, Upload, CheckCircle2, Plus, Info } from "lucide-react";
import { useApp } from "../contexts/AppContext";
import { formatCurrency } from "../lib/currency";
import { parseCSV, csvRowToPendingTransaction } from "../lib/csv";
import { getTransactionsByDateRange, createTransaction } from "../lib/ledger";
import { toBankLines, reconcile, type BankLine, type ReconcileResult } from "../lib/bank/reconcile";
import { loadRules } from "../lib/rules/rules";

export default function BankReconcile({ onBack }: { onBack: () => void }) {
  const { region } = useApp();
  const m = (c: number) => formatCurrency(c, region);
  const [result, setResult] = useState<ReconcileResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setError(null); setResult(null); setAdded(new Set());
    try {
      const rows = await parseCSV(file);
      const lines = toBankLines(rows);
      if (lines.length === 0) { setError("Couldn't read any dated, valued rows from that file."); return; }
      const dates = lines.map((l) => l.date).sort();
      const txns = await getTransactionsByDateRange(dates[0], dates[dates.length - 1]);
      setResult(reconcile(lines, txns));
    } catch {
      setError("Couldn't read that CSV. Check it has date, description and amount columns.");
    } finally { setBusy(false); }
  }

  async function addLine(line: BankLine, key: string) {
    const rules = await loadRules();
    const { txFields, splits } = csvRowToPendingTransaction(line.row, region, rules);
    await createTransaction(txFields, splits);
    setAdded((s) => new Set(s).add(key));
  }

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="p-1 -ml-1 text-slate-500"><ArrowLeft className="w-5 h-5" /></button>
        <h2 className="text-lg font-bold text-slate-900">Bank &amp; reconciliation</h2>
      </div>

      {/* Choice */}
      <div className="grid grid-cols-1 gap-3">
        <label className="bg-white rounded-xl border-2 border-brand-200 p-4 flex items-center gap-3 cursor-pointer">
          <Upload className="w-5 h-5 text-brand-600" />
          <div className="flex-1">
            <h3 className="font-bold text-slate-900 text-sm">Import a bank CSV</h3>
            <p className="text-xs text-slate-500">Everything stays on your device. Reconciles against your records.</p>
          </div>
          <input type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />
          <span className="text-brand-600 text-sm font-semibold">Choose file</span>
        </label>

      </div>

      {busy && <p className="text-sm text-ink-soft">Reading your file…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {result && (
        <>
          <div className="bg-white rounded-xl border border-line p-4">
            <p className="text-sm text-slate-700">
              <span className="font-bold text-income">{result.matchedCount}</span> of {result.totalCount} bank lines
              matched your records.
            </p>
            {result.unmatched.length > 0 && (
              <p className="text-xs text-slate-500 mt-1">{result.unmatched.length} not found — add the ones that belong below.</p>
            )}
          </div>

          {result.unmatched.map((line, i) => {
            const key = `${line.date}-${line.amountCents}-${i}`;
            const done = added.has(key);
            return (
              <div key={key} className="bg-white rounded-xl border border-line p-3 flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-800 truncate">{line.row.description || "—"}</p>
                  <p className="text-[11px] text-ink-soft">{line.date} · {m(line.amountCents)}</p>
                </div>
                {done ? (
                  <span className="text-income text-xs font-semibold flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Added</span>
                ) : (
                  <button onClick={() => addLine(line, key)} className="flex items-center gap-1 text-brand-600 text-xs font-semibold"><Plus className="w-3.5 h-3.5" /> Add</button>
                )}
              </div>
            );
          })}

          <p className="text-[10px] text-ink-soft flex items-start gap-1">
            <Info className="w-3 h-3 mt-0.5 shrink-0" />
            Matching is by amount and a few days' date window — review before relying on it. Added items go to your review queue.
          </p>
        </>
      )}
    </div>
  );
}
