/**
 * FinalDeclaration — the once-a-year "this is complete and correct" step that
 * replaces the old Self Assessment return.
 *
 * Follows HMRC's journey (MTD for Income Tax end-to-end service guide,
 * "Making updates at the end of the tax year"):
 *   1. trigger a calculation with calculationType "intent-to-finalise";
 *   2. retrieve it (HMRC answers 404 until it is ready) and show it to the person;
 *   3. show HMRC's declaration and get the person's agreement;
 *   4. submit the final declaration with the SAME calculationId they saw.
 * If HMRC's calculation contains errors, the person can't continue until the
 * figures are put right.
 */

import { useState } from "react";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { triggerCalculation, waitForCalculation, submitFinalDeclaration } from "../../lib/mtd/mtdApi";
import { HMRC_ENV } from "../../lib/mtd/hmrcConfig";
import { HMRC_DECLARATION, HMRC_DECLARATION_INTRO } from "../../lib/mtd/declaration";

function gbp(n: unknown): string {
  const v = typeof n === "number" ? n : Number(n);
  return Number.isFinite(v) ? `£${v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "Not given";
}

interface Msg { id?: string; text?: string }

export default function FinalDeclaration({ taxYear, onBack }: { taxYear: string; onBack: () => void }) {
  const [calcId, setCalcId] = useState<string | null>(null);
  const [calc, setCalc] = useState<any>(null);
  const [agreed, setAgreed] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<"ok" | "error" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const errors: Msg[] = Array.isArray(calc?.messages?.errors) ? calc.messages.errors : [];
  const warnings: Msg[] = Array.isArray(calc?.messages?.warnings) ? calc.messages.warnings : [];
  const total = calc?.calculation?.taxCalculation?.totalIncomeTaxAndNicsDue;
  const ready = !!calcId && !!calc && errors.length === 0 && agreed && confirmText.trim().toUpperCase() === "CONFIRM";

  async function getFinalCalculation() {
    setBusy(true); setResult(null); setMessage(null); setCalc(null); setCalcId(null); setAgreed(false); setConfirmText("");
    try {
      const trig = await triggerCalculation(taxYear, "intent-to-finalise");
      const id = (trig.data as any)?.calculationId;
      if (trig.status >= 400 || !id) throw new Error("no_calc_id");
      const res = await waitForCalculation(taxYear, id);
      if (res.status >= 400) throw new Error(`calc_${res.status}`);
      setCalcId(id);
      setCalc(res.data);
    } catch {
      setResult("error");
      setMessage("Couldn't get your final calculation from HMRC. Nothing was filed. Please try again shortly.");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!ready || !calcId) return;
    setBusy(true); setResult(null); setMessage(null);
    try {
      // The same calculation the person has just seen and agreed to.
      const res = await submitFinalDeclaration(taxYear, calcId);
      if (res.status >= 200 && res.status < 300) {
        setResult("ok");
        setMessage("Final declaration submitted for " + taxYear + ".");
      } else {
        setResult("error");
        setMessage(`HMRC rejected the declaration (status ${res.status}). Nothing was filed.`);
      }
    } catch {
      setResult("error");
      setMessage("Couldn't reach HMRC. Nothing was filed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="p-1 -ml-1 text-slate-500" aria-label="Back"><ArrowLeft className="w-5 h-5" /></button>
        <h2 className="text-lg font-bold text-slate-900">Final declaration</h2>
      </div>
      <p className="text-sm text-slate-600">Tax year <span className="font-bold">{taxYear}</span></p>

      {result !== "ok" && (
        <>
          <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4 flex gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" aria-hidden="true" />
            <p className="text-xs text-amber-800">
              This is the final, legally binding declaration for the year. It replaces your Self
              Assessment return. Make sure every quarterly update and all your figures are complete
              and correct first.
            </p>
          </div>

          {/* Step 1: HMRC's final calculation */}
          {!calc && (
            <button onClick={getFinalCalculation} disabled={busy} className="w-full bg-brand-600 text-white py-2.5 rounded-lg text-sm font-bold disabled:opacity-50">
              {busy ? "Asking HMRC…" : "Step 1: Get my final calculation from HMRC"}
            </button>
          )}

          {calc && (
            <div className="bg-white rounded-xl border border-line p-4 space-y-2">
              <p className="text-sm text-slate-500">HMRC's final calculation: income tax and NICs due</p>
              <p className="text-2xl font-bold text-slate-900">{gbp(total)}</p>
              <p className="text-xs text-ink-soft">
                This is HMRC's own calculation. Check it carefully. Your HMRC online account shows the full
                details and payment dates.
              </p>
              {warnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-2">
                  <p className="text-xs font-bold text-amber-900">HMRC's notes</p>
                  <ul className="list-disc pl-4 text-xs text-amber-900">{warnings.map((w, i) => <li key={w.id ?? i}>{w.text}</li>)}</ul>
                </div>
              )}
              {errors.length > 0 && (
                <div className="bg-red-50 border-2 border-red-200 rounded-lg p-2">
                  <p className="text-xs font-bold text-red-800">HMRC found problems, so you can't declare yet</p>
                  <ul className="list-disc pl-4 text-xs text-red-800">{errors.map((e, i) => <li key={e.id ?? i}>{e.text}</li>)}</ul>
                  <p className="text-[11px] text-red-800 mt-1">Put these right in your updates, then get a new calculation.</p>
                </div>
              )}
              <button onClick={getFinalCalculation} disabled={busy} className="text-xs text-brand-600 underline">Get a new calculation</button>
            </div>
          )}

          {/* Step 2: HMRC's declaration */}
          {calc && errors.length === 0 && (
            <div className="bg-white rounded-xl border-2 border-slate-300 p-4 space-y-3">
              <p className="text-sm font-bold text-slate-900">Step 2: The declaration</p>
              <p className="text-xs text-slate-700">{HMRC_DECLARATION_INTRO}:</p>
              <blockquote className="text-sm text-slate-900 border-l-4 border-brand-500 pl-3">{HMRC_DECLARATION}</blockquote>
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1" />
                I have read and agree to this declaration.
              </label>
              <label className="block text-sm text-slate-600">
                Type <span className="font-bold">CONFIRM</span> to submit:
                <input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border-2 border-slate-300 rounded-lg text-sm font-medium uppercase"
                />
              </label>
              <button onClick={submit} disabled={!ready || busy} className="w-full bg-brand-600 text-white py-2.5 rounded-lg text-sm font-bold disabled:opacity-50">
                {busy ? "Submitting…" : "Submit final declaration"}
              </button>
              <p className="text-xs text-ink-soft text-center">
                {HMRC_ENV === "sandbox" ? "Practice mode: this is a test submission." : "This is a real, final submission to HMRC."}
              </p>
            </div>
          )}

          {message && <p className={`text-sm ${result === "error" ? "text-red-600" : "text-slate-600"}`}>{message}</p>}
        </>
      )}

      {result === "ok" && (
        <div className="bg-emerald-50 border-2 border-emerald-200 rounded-xl p-4 text-center space-y-2">
          <p className="font-bold text-emerald-700">{message}</p>
          <button onClick={onBack} className="text-sm text-brand-600 underline">Done</button>
        </div>
      )}
    </div>
  );
}
