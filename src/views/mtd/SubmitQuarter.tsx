/**
 * SubmitQuarter — review the year-to-date figures and submit the quarterly update.
 *
 * Quarterly updates are cumulative: each covers the start of the tax year to the
 * end of the update period (GOV.UK, "Send quarterly updates").
 *
 * Flow: aggregate the ledger from the year's start to the obligation's end ->
 * show a plain-English summary and anything HMRC would reject -> let the user
 * expand the exact JSON we'll send -> submit. Nothing leaves the device until
 * the user taps "Send to HMRC".
 */

import { useEffect, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronUp } from "lucide-react";
import { aggregatePeriod, type PeriodSummary } from "../../lib/mtd/mtdAggregator";
import { submitQuarterlyUpdate, type Obligation } from "../../lib/mtd/mtdApi";
import { cumulativeStart } from "../../lib/mtd/mtdEndpoints";
import { buildCumulativeBody, checkCumulativeBody } from "../../lib/mtd/cumulativeUpdate";
import { HMRC_ENV } from "../../lib/mtd/hmrcConfig";

function gbp(n: number | undefined): string {
  return `£${(n ?? 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function SubmitQuarter({
  businessId, obligation, allObligations = [], onBack,
}: { businessId: string; obligation: Obligation; allObligations?: Obligation[]; onBack: () => void }) {
  const [summary, setSummary] = useState<PeriodSummary | null>(null);
  const [consolidated, setConsolidated] = useState(false);
  const [showJson, setShowJson] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<"ok" | "error" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const start = cumulativeStart(obligation, allObligations);

  useEffect(() => {
    aggregatePeriod(start, obligation.periodEndDate).then(setSummary);
  }, [obligation, start]);

  const payload = summary && buildCumulativeBody(summary, consolidated);
  const problems = payload ? checkCumulativeBody(payload) : [];

  async function submit() {
    if (!summary || problems.length) return;
    setBusy(true); setResult(null); setMessage(null);
    try {
      // In sandbox, ask HMRC for the success scenario.
      const res = await submitQuarterlyUpdate(businessId, summary, {
        consolidated,
        scenario: HMRC_ENV === "sandbox" ? undefined : undefined,
      });
      if (res.status >= 200 && res.status < 300) {
        setResult("ok");
        setMessage("Quarterly update submitted. HMRC now has your figures for the year so far.");
      } else {
        setResult("error");
        setMessage(`HMRC rejected the submission (status ${res.status}). Nothing was filed.`);
      }
    } catch (e) {
      setResult("error");
      setMessage("Couldn't reach HMRC. Nothing was filed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="p-1 -ml-1 text-slate-500"><ArrowLeft className="w-5 h-5" /></button>
        <h2 className="text-lg font-bold text-slate-900">Review &amp; submit</h2>
      </div>

      <p className="text-sm text-slate-600">
        Update period <span className="font-bold">{obligation.periodStartDate} → {obligation.periodEndDate}</span>
      </p>
      <p className="text-xs text-slate-500">
        Each update covers the year so far, so these figures run from <span className="font-semibold">{start}</span> to{" "}
        <span className="font-semibold">{obligation.periodEndDate}</span>. HMRC replaces your previous update with this one.
      </p>

      {!summary && <p className="text-sm text-ink-soft">Adding up your transactions…</p>}

      {summary && result !== "ok" && (
        <>
          <div className="bg-white rounded-xl border border-line p-4 space-y-2">
            <Row label="Income" value={gbp(summary.meta.totalIncome)} strong />
            <Row label="Expenses" value={gbp(summary.meta.totalExpenses)} strong />
            <div className="border-t border-line pt-2">
              <Row label="Net profit" value={gbp(summary.meta.net)} strong />
            </div>
            <p className="text-xs text-ink-soft">From {summary.meta.transactionCount} approved transactions.</p>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={consolidated} onChange={(e) => setConsolidated(e.target.checked)} />
            Send expenses as a single total (allowed under the turnover threshold)
          </label>

          {/* Transparency: show exactly what we'll send */}
          <button onClick={() => setShowJson((s) => !s)} className="flex items-center gap-1 text-sm text-brand-600 font-semibold">
            {showJson ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            What we'll send to HMRC
          </button>
          {showJson && (
            <pre className="bg-slate-900 text-brand-300 text-[11px] rounded-xl p-3 overflow-x-auto">
              {JSON.stringify(payload, null, 2)}
            </pre>
          )}

          {problems.length > 0 && (
            <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-3 space-y-1">
              <p className="text-xs font-bold text-amber-900">HMRC won't accept this yet</p>
              <ul className="list-disc pl-4 text-xs text-amber-900 space-y-0.5">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
              <p className="text-[11px] text-amber-900">Nothing has been sent. Correct the entries in your books, then come back.</p>
            </div>
          )}

          {message && <p className={`text-sm ${result === "error" ? "text-red-600" : "text-slate-600"}`}>{message}</p>}

          <button
            onClick={submit}
            disabled={busy || problems.length > 0}
            className="w-full bg-brand-600 text-white py-2.5 rounded-lg text-sm font-bold disabled:opacity-50"
          >
            {busy ? "Submitting…" : "Send to HMRC"}
          </button>
          <p className="text-xs text-ink-soft text-center">
            {HMRC_ENV === "sandbox" ? "Practice mode — this is a test submission, not a real one." : "This is a real submission to HMRC."}
          </p>
        </>
      )}

      {result === "ok" && (
        <div className="bg-emerald-50 border-2 border-emerald-200 rounded-xl p-4 text-center space-y-2">
          <p className="font-bold text-emerald-700">{message}</p>
          <button onClick={onBack} className="text-sm text-brand-600 underline">Back to obligations</button>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-sm ${strong ? "font-semibold text-slate-800" : "text-slate-500"}`}>{label}</span>
      <span className={`text-sm ${strong ? "font-bold text-slate-900" : "text-slate-600"}`}>{value}</span>
    </div>
  );
}
