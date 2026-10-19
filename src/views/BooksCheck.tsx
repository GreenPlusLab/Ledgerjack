/**
 * BooksCheck — "things worth a look" in this year's entries.
 *
 * Read-only by default: it lists what looks unusual and lets the user send an
 * entry back to the review queue, where it can be corrected or deleted. It
 * never deletes or changes an amount by itself, and it never states tax rules.
 */

import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft, Search, CheckCircle2, AlertTriangle, Info, Loader2, RefreshCw, ChevronDown, ChevronUp,
} from "lucide-react";
import { useApp, useRegionConfig } from "../contexts/AppContext";
import { formatCurrency } from "../lib/currency";
import { updateTransaction } from "../lib/ledger";
import { fiscalYearWindow, localToday } from "../lib/bookscheck/entries";
import { loadBooksCheck } from "../lib/bookscheck/load";
import {
  describeFinding, describeItem, overallStatus,
  type BooksCheckReport, type Finding, type FindingItem,
} from "../lib/bookscheck/bookscheck";

const PREVIEW = 5;

export default function BooksCheck({ onBack, onNavigate }: { onBack: () => void; onNavigate: (v: string) => void }) {
  const { region } = useApp();
  const cfg = useRegionConfig();
  const money = useCallback((c: number) => formatCurrency(c, region), [region]);
  const yearWord = region === "uk" ? "tax year" : "financial year";

  const [report, setReport] = useState<BooksCheckReport | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const run = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const today = localToday();
      const win = fiscalYearWindow(cfg.fiscalYearStart.month, cfg.fiscalYearStart.day, today);
      setReport(await loadBooksCheck(win.from, win.to, today));
    } catch (e: unknown) {
      setError(e instanceof Error ? `Couldn't run the check: ${e.message}` : "Couldn't run the check.");
    } finally {
      setBusy(false);
    }
  }, [cfg.fiscalYearStart.month, cfg.fiscalYearStart.day]);

  useEffect(() => { run(); }, [run]);

  async function sendToReview(txId: string, label: string) {
    setNotice("");
    setError("");
    try {
      await updateTransaction(txId, { pending_review: true });
      setNotice(`"${label}" is back in your review queue. Correct or delete it there, then approve it again.`);
      await run();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Couldn't move that entry.");
    }
  }

  const status = report ? overallStatus(report) : null;
  const head = status === "clear"
    ? { Icon: CheckCircle2, cls: "bg-brand-50 border-brand-200 text-brand-700", title: "Nothing stood out", sub: "Your entries for this year look tidy." }
    : status === "check"
      ? { Icon: AlertTriangle, cls: "bg-amber-50 border-amber-200 text-amber-700", title: "A few entries are worth a look", sub: "These may be mistakes. Only you can tell, so nothing has been changed." }
      : { Icon: Info, cls: "bg-slate-50 border-line text-ink", title: "Some things to know", sub: "No likely mistakes, just a few gaps you may want to fill." };

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="p-1 -ml-1 text-slate-500" aria-label="Back"><ArrowLeft className="w-5 h-5" /></button>
          <Search className="w-5 h-5 text-brand-600" />
          <h2 className="text-lg font-bold text-slate-900">Check my books</h2>
        </div>
        <button onClick={run} disabled={busy} className="flex items-center gap-1 text-xs font-bold text-brand-600 disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${busy ? "animate-spin" : ""}`} /> Re-check
        </button>
      </div>

      <p className="text-xs text-ink-soft leading-relaxed">
        Looks through this {yearWord}'s entries for slips that are easy to miss: the same cost saved twice, a typo
        that adds a zero, a date in the future. It runs on this device and changes nothing on its own.
      </p>

      {notice && (
        <div className="bg-brand-50 border border-brand-200 rounded-xl p-3">
          <p className="text-xs text-brand-700">{notice}</p>
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3">
          <p className="text-xs font-bold text-red-700">{error}</p>
        </div>
      )}

      {busy && !report ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-ink-soft animate-spin" /></div>
      ) : report ? (
        <>
          <div className={`${head.cls} border rounded-xl p-4 flex items-start gap-3`}>
            <head.Icon className="w-6 h-6 shrink-0" />
            <div>
              <p className="font-bold">{head.title}</p>
              <p className="text-xs text-ink-soft mt-0.5">{head.sub}</p>
              <p className="text-[11px] text-ink-soft mt-1">
                {report.entriesChecked} entr{report.entriesChecked === 1 ? "y" : "ies"} checked, {report.period.from} to {report.period.to}.
              </p>
            </div>
          </div>

          {report.findings.map((f) => (
            <FindingCard key={f.id} finding={f} money={money} onSendToReview={sendToReview} onNavigate={onNavigate} />
          ))}

          <p className="text-[10px] text-ink-soft">
            These are prompts, not rulings. An entry flagged here may be perfectly correct. If you're unsure about one,
            flag it for your accountant; the results of this check are included in your accountant note.
          </p>
        </>
      ) : null}
    </div>
  );
}

function FindingCard({
  finding, money, onSendToReview, onNavigate,
}: {
  finding: Finding;
  money: (c: number) => string;
  onSendToReview: (txId: string, label: string) => void;
  onNavigate: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const text = describeFinding(finding, money);
  const items = open ? finding.items : finding.items.slice(0, PREVIEW);
  const isCheck = finding.severity === "check";
  const Icon = isCheck ? AlertTriangle : Info;

  return (
    <div className="bg-white rounded-xl border border-line p-3">
      <div className="flex items-start gap-2.5">
        <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${isCheck ? "text-amber-600" : "text-ink-soft"}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-900">{text.title}</p>
          <p className="text-xs text-ink-soft leading-relaxed mt-0.5">{text.summary}</p>

          {finding.id === "pending-review" ? (
            <button onClick={() => onNavigate("pending")} className="mt-2 text-xs font-bold text-brand-600">
              Open review queue →
            </button>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {items.map((item, i) => (
                <ItemRow key={`${item.txId ?? item.date}-${i}`} finding={finding} item={item} money={money} onSendToReview={onSendToReview} />
              ))}
            </ul>
          )}

          {finding.id === "quiet-months" && (
            <button onClick={() => onNavigate("new-transaction")} className="mt-2 text-xs font-bold text-brand-600">
              Add an entry →
            </button>
          )}

          {finding.id !== "pending-review" && finding.items.length > PREVIEW && (
            <button onClick={() => setOpen(!open)} className="mt-2 flex items-center gap-1 text-xs font-bold text-brand-600">
              {open ? <><ChevronUp className="w-3.5 h-3.5" /> Show fewer</> : <><ChevronDown className="w-3.5 h-3.5" /> Show all {finding.items.length}</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ItemRow({
  finding, item, money, onSendToReview,
}: {
  finding: Finding;
  item: FindingItem;
  money: (c: number) => string;
  onSendToReview: (txId: string, label: string) => void;
}) {
  const canReview = finding.id === "possible-duplicates" || finding.id === "unusual-amounts" || finding.id === "future-dates";

  if (finding.id === "possible-duplicates") {
    return (
      <li className="border-t border-slate-100 pt-1.5 text-xs">
        <p className="font-semibold text-slate-800">{money(item.amountCents ?? 0)}</p>
        <DupeSide date={item.date} description={item.description} onReview={() => onSendToReview(item.txId!, item.description)} />
        <DupeSide date={item.relatedDate ?? ""} description={item.relatedDescription ?? ""} onReview={() => onSendToReview(item.relatedTxId!, item.relatedDescription ?? "")} />
      </li>
    );
  }

  return (
    <li className="border-t border-slate-100 pt-1.5 text-xs flex items-start justify-between gap-2">
      <span className="text-slate-600 min-w-0">{describeItem(finding, item, money)}</span>
      {canReview && item.txId && (
        <button onClick={() => onSendToReview(item.txId!, item.description)} className="shrink-0 font-bold text-brand-600">
          Review
        </button>
      )}
    </li>
  );
}

function DupeSide({ date, description, onReview }: { date: string; description: string; onReview: () => void }) {
  return (
    <div className="flex items-start justify-between gap-2 mt-0.5">
      <span className="text-slate-600 min-w-0 truncate">{date} · {description}</span>
      <button onClick={onReview} className="shrink-0 font-bold text-brand-600">Review</button>
    </div>
  );
}
