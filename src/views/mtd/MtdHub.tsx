/**
 * MtdHub — the home of Making Tax Digital inside LedgerJack.
 *
 * States it walks through:
 *   1. Not connected  -> show Connect to HMRC
 *   2. No NINO yet     -> capture National Insurance number (stored encrypted)
 *   3. Connected       -> list quarterly obligations; open submit / calc / final
 *
 * Everything stays in sandbox until hmrcConfig.HMRC_ENV is switched.
 */

import { useEffect, useState } from "react";
import { ArrowLeft, RefreshCw, ShieldCheck } from "lucide-react";
import ConnectHmrc from "./ConnectHmrc";
import SubmitQuarter from "./SubmitQuarter";
import TaxCalculation from "./TaxCalculation";
import FinalDeclaration from "./FinalDeclaration";
import { isConnected } from "../../lib/mtd/mtdVault";
import { loadNino, saveNino, isValidNino } from "../../lib/mtd/mtdVault";
import { getSelfEmploymentBusiness, getObligations, type Obligation, type BusinessInfo } from "../../lib/mtd/mtdApi";
import { HMRC_ENV } from "../../lib/mtd/hmrcConfig";

/** Current UK tax year window (6 Apr → 5 Apr). */
function taxYearWindow(): { from: string; to: string; label: string } {
  const now = new Date();
  const y = now.getUTCFullYear();
  const startYear = (now.getUTCMonth() > 3 || (now.getUTCMonth() === 3 && now.getUTCDate() >= 6)) ? y : y - 1;
  return {
    from: `${startYear}-04-06`,
    to: `${startYear + 1}-04-05`,
    label: `${startYear}-${(startYear + 1).toString().slice(2)}`,
  };
}

export default function MtdHub({ onBack }: { onBack: () => void }) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [nino, setNino] = useState<string | null>(null);
  const [ninoInput, setNinoInput] = useState("");
  const [business, setBusiness] = useState<BusinessInfo | null>(null);
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [screen, setScreen] = useState<"list" | "submit" | "calc" | "final">("list");
  const [selected, setSelected] = useState<Obligation | null>(null);

  const win = taxYearWindow();

  useEffect(() => {
    (async () => {
      const c = await isConnected();
      setConnected(c);
      setNino(await loadNino());
    })();
  }, []);

  async function loadEverything() {
    setLoading(true);
    setError(null);
    try {
      const biz = await getSelfEmploymentBusiness();
      setBusiness(biz);
      const obs = biz ? await getObligations(win.from, win.to, undefined, biz.businessId) : [];
      setObligations(obs);
    } catch (e) {
      setError("Couldn't load from HMRC. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (connected && nino) loadEverything();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, nino]);

  async function submitNino() {
    if (!isValidNino(ninoInput)) {
      setError("That doesn't look like a valid National Insurance number.");
      return;
    }
    await saveNino(ninoInput);
    setNino(ninoInput.toUpperCase().replace(/\s+/g, ""));
    setError(null);
  }

  // ---- sub-screens ----
  if (screen === "submit" && business && selected) {
    return <SubmitQuarter businessId={business.businessId} obligation={selected} allObligations={obligations} onBack={() => { setScreen("list"); loadEverything(); }} />;
  }
  if (screen === "calc") {
    return <TaxCalculation taxYear={win.label} onBack={() => setScreen("list")} />;
  }
  if (screen === "final") {
    return <FinalDeclaration taxYear={win.label} onBack={() => setScreen("list")} />;
  }

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="p-1 -ml-1 text-slate-500"><ArrowLeft className="w-5 h-5" /></button>
        <h2 className="text-lg font-bold text-slate-900">Making Tax Digital</h2>
        {HMRC_ENV === "sandbox" && (
          <span className="ml-auto text-[10px] font-bold uppercase tracking-widest text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
            Practice mode
          </span>
        )}
      </div>

      {connected === null && <p className="text-sm text-ink-soft">Loading…</p>}

      {connected === false && (
        <div className="bg-white rounded-xl border border-line p-4">
          <ConnectHmrc />
        </div>
      )}

      {connected && !nino && (
        <div className="bg-white rounded-xl border border-line p-4 space-y-3">
          <h3 className="font-bold text-slate-900">Your National Insurance number</h3>
          <p className="text-xs text-slate-500">HMRC needs this to match your submissions. It's stored encrypted on your device.</p>
          <input
            value={ninoInput}
            onChange={(e) => setNinoInput(e.target.value)}
            placeholder="e.g. QQ123456C"
            className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg text-sm font-medium uppercase"
          />
          <button onClick={submitNino} className="w-full bg-brand-600 text-white py-2 rounded-lg text-sm font-bold">Save</button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}

      {connected && nino && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600">Tax year <span className="font-bold">{win.label}</span></p>
            <button onClick={loadEverything} className="flex items-center gap-1 text-sm text-brand-600 font-semibold">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {loading && <p className="text-sm text-ink-soft">Checking with HMRC…</p>}

          {!loading && obligations.length === 0 && !error && (
            <p className="text-sm text-slate-500">No quarterly updates are due in this tax year yet.</p>
          )}

          {obligations.map((o, i) => (
            <div key={i} className="bg-white rounded-xl border border-line p-4 flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-900 text-sm">
                  {o.periodStartDate} → {o.periodEndDate}
                </p>
                <p className="text-xs text-slate-500">Due {o.dueDate}</p>
              </div>
              {o.status === "Fulfilled" ? (
                <span className="text-xs font-bold text-income flex items-center gap-1"><ShieldCheck className="w-4 h-4" /> Submitted</span>
              ) : (
                <button
                  onClick={() => { setSelected(o); setScreen("submit"); }}
                  className="bg-brand-600 text-white text-sm font-bold px-3 py-1.5 rounded-lg"
                >
                  Review &amp; submit
                </button>
              )}
            </div>
          ))}

          <div className="grid grid-cols-2 gap-3 pt-2">
            <button onClick={() => setScreen("calc")} className="bg-white border border-line rounded-xl p-3 text-sm font-semibold text-slate-700">
              View tax estimate
            </button>
            <button onClick={() => setScreen("final")} className="bg-white border border-line rounded-xl p-3 text-sm font-semibold text-slate-700">
              Final declaration
            </button>
          </div>
        </>
      )}
    </div>
  );
}
