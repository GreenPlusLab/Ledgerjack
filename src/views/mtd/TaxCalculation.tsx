/**
 * TaxCalculation — trigger a calculation and show the headline figure read-only.
 * We deliberately signpost HMRC for anything authoritative and never present our
 * number as the final amount owed.
 */

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { triggerCalculation, waitForCalculation } from "../../lib/mtd/mtdApi";

function gbp(n: unknown): string {
  const v = typeof n === "number" ? n : Number(n);
  return isFinite(v) ? `£${v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";
}

export default function TaxCalculation({ taxYear, onBack }: { taxYear: string; onBack: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [calc, setCalc] = useState<any>(null);

  async function run() {
    setBusy(true); setError(null); setCalc(null);
    try {
      const trig = await triggerCalculation(taxYear, "in-year");
      const id = (trig.data as any)?.calculationId;
      if (trig.status >= 400 || !id) throw new Error("no_calc_id");
      // HMRC answers "not found" until the calculation is ready, so wait for it.
      const res = await waitForCalculation(taxYear, id);
      if (res.status >= 400) throw new Error(`calc_${res.status}`);
      setCalc(res.data);
    } catch (e) {
      setError("Couldn't get a calculation from HMRC. Please try again shortly.");
    } finally {
      setBusy(false);
    }
  }

  // individual-calculations-api v8: calculation.taxCalculation.totalIncomeTaxAndNicsDue
  const income = calc?.calculation?.taxCalculation?.totalIncomeTaxAndNicsDue;

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="p-1 -ml-1 text-slate-500"><ArrowLeft className="w-5 h-5" /></button>
        <h2 className="text-lg font-bold text-slate-900">Tax estimate</h2>
      </div>

      <p className="text-sm text-slate-600">Tax year <span className="font-bold">{taxYear}</span></p>

      {!calc && (
        <button onClick={run} disabled={busy} className="w-full bg-brand-600 text-white py-2.5 rounded-lg text-sm font-bold disabled:opacity-50">
          {busy ? "Asking HMRC…" : "Get estimate from HMRC"}
        </button>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {calc && (
        <div className="bg-white rounded-xl border border-line p-4 space-y-2">
          <p className="text-sm text-slate-500">Estimated income tax &amp; NICs due</p>
          <p className="text-2xl font-bold text-slate-900">{gbp(income)}</p>
          <p className="text-xs text-ink-soft">
            This is HMRC's estimate for the year so far and may change. The amount and
            payment dates in your HMRC online account are the authoritative figures.
          </p>
        </div>
      )}
    </div>
  );
}
