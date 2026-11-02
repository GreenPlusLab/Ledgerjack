/**
 * BulkReceipts — upload several receipt photos at once. Each is scanned by the AI
 * and added to the review queue for a glance. Processed one at a time to be gentle
 * on rate limits.
 */

import { AIBlockedError } from "../lib/ai/gateway";
import PrivacyBadge from "../components/privacy/PrivacyBadge";
import { useEffect, useState } from "react";
import { ArrowLeft, Images, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { useApp, useRegionConfig } from "../contexts/AppContext";
import { makeSimpleSplits } from "../lib/ledger";
import { effectiveReading } from "../lib/ai/policy";
import { loadChoice } from "../lib/privacy/store";
import type { PrivacyChoice } from "../lib/privacy/choices";
import { readTextOnDevice, ocrDownloadedBefore, OCR_DOWNLOAD_MB } from "../lib/ocr/ocr";
import { suggestFromReceiptText, dateOrderFor } from "../lib/ocr/receiptText";
import { createTransaction } from "../lib/ledger";
import { parseWithAI, aiParsedToPendingTransaction } from "../lib/ai";

type Status = "queued" | "processing" | "done" | "error";
interface Item { name: string; status: Status; message?: string }

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("read failed"));
    r.readAsDataURL(file);
  });
}

export default function BulkReceipts({ onBack }: { onBack: () => void }) {
  const { region, apiKey } = useApp();
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState<{ files: File[]; message: string } | null>(null);
  const [confirmOcr, setConfirmOcr] = useState<File[] | null>(null);
  const [choice, setChoice] = useState<PrivacyChoice | null>(null);
  const cfg = useRegionConfig();
  useEffect(() => { loadChoice().then(setChoice); }, []);
  const reading = effectiveReading(choice, !!apiKey);
  const onPhone = reading === "manual" || reading === "ocr";

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    if (onPhone) {
      if (!ocrDownloadedBefore()) { setConfirmOcr(files); return; }
      await readAllOnPhone(files);
      return;
    }
    await readAll(files, false);
  }

  /** Read each photo on this phone; nothing leaves it. Each goes to Review to check. */
  async function readAllOnPhone(files: File[]) {
    setConfirmOcr(null);
    setBlocked(null);
    setBusy(true);
    setItems(files.map((f) => ({ name: f.name, status: "queued" })));
    const today = new Date().toISOString().slice(0, 10);
    for (let i = 0; i < files.length; i++) {
      setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, status: "processing" } : it));
      try {
        const text = await readTextOnDevice(files[i]!);
        const s = suggestFromReceiptText(text, dateOrderFor(region), today);
        if (s.totalMinor === undefined) throw new Error("No clear total on this one. Add it by hand.");
        await createTransaction(
          { date: s.date ?? today, description: s.merchant ?? "Receipt", pending_review: true, job_tag: undefined, attachment_id: undefined },
          makeSimpleSplits(cfg.allowableExpensesParent, cfg.cashAccount, s.totalMinor),
        );
        setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, status: "done" } : it));
      } catch (err) {
        const msg = err instanceof Error && err.message.startsWith("No clear total") ? err.message : "Couldn't read this one. Try a clearer photo, or add it by hand.";
        setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, status: "error", message: msg } : it));
      }
    }
    setBusy(false);
  }

  async function readAll(files: File[], justThisOne: boolean) {
    setBlocked(null);
    setBusy(true);
    const queue: Item[] = files.map((f) => ({ name: f.name, status: "queued" }));
    setItems(queue);

    for (let i = 0; i < files.length; i++) {
      setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, status: "processing" } : it));
      try {
        const dataUrl = await fileToDataUrl(files[i]);
        const parsed = await parseWithAI({ text: "", apiKey, region, imageData: dataUrl, useHighQualityModel: true, justThisOne });
        const tx = aiParsedToPendingTransaction(parsed, region);
        await createTransaction(tx.txFields, tx.splits);
        setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, status: "done" } : it));
      } catch (err) {
        if (err instanceof AIBlockedError) {
          // Nothing was sent. Stop here and let the person decide.
          setItems([]);
          setBlocked(err.code === "ai-off" ? { files, message: err.message } : null);
          if (err.code !== "ai-off") setItems([{ name: "—", status: "error", message: err.message }]);
          setBusy(false);
          return;
        }
        const msg = err instanceof Error ? err.message : "Couldn't read this one";
        setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, status: "error", message: msg } : it));
      }
    }
    setBusy(false);
  }

  const done = items.filter((i) => i.status === "done").length;

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="p-1 -ml-1 text-slate-500"><ArrowLeft className="w-5 h-5" /></button>
        <Images className="w-5 h-5 text-brand-600" />
        <h2 className="text-lg font-bold text-slate-900">Bulk receipts</h2>
      </div>

      <p className="text-sm text-slate-500">
        Upload several receipt photos at once. Each is read and added to your review queue to check
        before it counts. {onPhone ? "They're read on your phone, so they never leave it." : "They're read by the AI you chose."}
      </p>

      <label className="bg-white rounded-xl border-2 border-dashed border-brand-300 p-6 flex flex-col items-center gap-2 cursor-pointer">
        <Images className="w-8 h-8 text-brand-400" />
        <span className="text-sm font-semibold text-brand-600">Choose photos</span>
        <span className="text-[11px] text-ink-soft">JPG or PNG · multiple allowed</span>
        <input type="file" accept="image/*" multiple onChange={onFiles} disabled={busy} className="hidden" />
      </label>

      {confirmOcr && (
        <div className="bg-emerald-50 border-2 border-emerald-300 rounded-xl p-3 space-y-2">
          <p className="text-xs text-slate-800">Reading on your phone needs a one-time download of about {OCR_DOWNLOAD_MB} MB from LedgerJack, not from anyone else. Best on Wi-Fi. After that it works offline, and your photos never leave your phone.</p>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setConfirmOcr(null)} className="bg-white border border-line py-2 rounded-lg text-xs font-bold">Not now</button>
            <button onClick={() => readAllOnPhone(confirmOcr)} className="bg-brand-600 text-white py-2 rounded-lg text-xs font-bold">Download and read</button>
          </div>
        </div>
      )}

      {blocked && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-3 space-y-2">
          <p className="text-xs text-slate-800">{blocked.message}</p>
          <button onClick={() => readAll(blocked.files, true)} className="w-full flex flex-wrap items-center justify-center gap-1.5 bg-white border border-amber-300 py-2 rounded-lg text-sm font-bold">
            Read these {blocked.files.length} with AI, just this once
            <PrivacyBadge colour="amber" text="Sent to the AI company you chose" small />
          </button>
        </div>
      )}

      {items.length > 0 && (
        <>
          {done > 0 && <p className="text-sm text-income font-semibold">{done} added to your review queue.</p>}
          <div className="space-y-1.5">
            {items.map((it, i) => (
              <div key={i} className="bg-white rounded-lg border border-line p-2.5 flex items-center gap-2">
                <span className="min-w-0 flex-1 text-xs text-slate-600 truncate">{it.name}</span>
                {it.status === "queued" && <span className="text-[11px] text-ink-soft">Queued</span>}
                {it.status === "processing" && <Loader2 className="w-4 h-4 text-brand-500 animate-spin" />}
                {it.status === "done" && <CheckCircle2 className="w-4 h-4 text-income" />}
                {it.status === "error" && <span className="flex items-center gap-1 text-[11px] text-red-500"><AlertCircle className="w-3.5 h-3.5" /> {it.message}</span>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
