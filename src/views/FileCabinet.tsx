import { useState, useEffect, useRef } from 'react';
import { Image, X, Loader2, Lock, Eye, Camera, Trash2 } from 'lucide-react';
import { db, loadWithSplits, type TransactionWithSplits, type DBTransaction, type DBAttachment } from '../lib/db';
import { useApp } from '../contexts/AppContext';
import { useCrypto } from '../contexts/CryptoContext';
import { formatCurrency } from '../lib/currency';
import { useAttachment } from '../hooks/useAttachment';
import { blobToUint8Array } from '../lib/image';

type SortMode = 'date' | 'merchant' | 'category';
type Folder = 'processed' | 'other';

// Standalone (unfiled) receipts are stored with this sentinel so they can be
// listed separately from receipts that are linked to a ledger entry.
const STANDALONE = 'STANDALONE';

export default function FileCabinet({ onBack }: { onBack?: () => void }) {
  const [folder, setFolder] = useState<Folder>('processed');
  const [transactions, setTransactions] = useState<TransactionWithSplits[]>([]);
  const [others, setOthers] = useState<DBAttachment[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>('date');
  const [q, setQ] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [decryptingId, setDecryptingId] = useState<string | null>(null);
  const [zoomedUrl, setZoomedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { region } = useApp();
  const { decryptBlob, encryptBlob } = useCrypto();
  const { createTrackedUrl, compressToWebP } = useAttachment();

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    const txns = await db.transactions.filter((tx) => !!tx.attachment_id).toArray();
    setTransactions(await loadWithSplits(txns));
    setOthers(await db.attachments.where('transaction_id').equals(STANDALONE).toArray());
    setLoading(false);
  };

  // Manual receipt capture — stored for records ONLY, never added to the ledger.
  const captureReceipt = async (file: File) => {
    setSaving(true);
    try {
      const compressed = await compressToWebP(file);
      const bytes = await blobToUint8Array(compressed);
      const encrypted = await encryptBlob(bytes);
      await db.attachments.add({
        id: crypto.randomUUID(),
        transaction_id: STANDALONE,
        encrypted_iv: encrypted.iv,
        encrypted_data: encrypted.ciphertext,
        mime_type: 'image/webp',
        created_at: Date.now(),
      });
      await loadAll();
      setFolder('other');
    } catch {
      /* ignore — capture failed */
    } finally {
      setSaving(false);
    }
  };

  const decryptTx = async (tx: DBTransaction) => {
    if (!tx.attachment_id || previews[tx.id]) return;
    setDecryptingId(tx.id);
    try {
      const att = await db.attachments.get(tx.attachment_id);
      if (!att) return;
      const decrypted = await decryptBlob(att.encrypted_iv, att.encrypted_data);
      const url = createTrackedUrl(new Blob([new Uint8Array(decrypted)], { type: att.mime_type }));
      setPreviews((p) => ({ ...p, [tx.id]: url }));
    } catch { /* stays sealed */ } finally { setDecryptingId(null); }
  };

  const decryptOther = async (att: DBAttachment) => {
    if (previews[att.id]) return;
    setDecryptingId(att.id);
    try {
      const decrypted = await decryptBlob(att.encrypted_iv, att.encrypted_data);
      const url = createTrackedUrl(new Blob([new Uint8Array(decrypted)], { type: att.mime_type }));
      setPreviews((p) => ({ ...p, [att.id]: url }));
    } catch { /* stays sealed */ } finally { setDecryptingId(null); }
  };

  const deleteOther = async (id: string) => {
    await db.attachments.delete(id);
    await loadAll();
  };

  const filtered = transactions.filter((tx) => {
    if (q.trim() && !tx.description.toLowerCase().includes(q.trim().toLowerCase())) return false;
    if (fromDate && tx.date < fromDate) return false;
    if (toDate && tx.date > toDate) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    switch (sortMode) {
      case 'date': return b.date.localeCompare(a.date);
      case 'merchant': return a.description.localeCompare(b.description);
      case 'category': {
        const aD = a.splits.find((s) => s.amount > 0)?.account_id || '';
        const bD = b.splits.find((s) => s.amount > 0)?.account_id || '';
        return aD.localeCompare(bD);
      }
    }
  });

  return (
    <div className="space-y-4 pb-24">
      {zoomedUrl && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setZoomedUrl(null)}>
          <button className="absolute top-4 right-4 text-white/80 hover:text-white"><X className="w-6 h-6" /></button>
          <img src={zoomedUrl} alt="Receipt" className="max-w-full max-h-[88vh] rounded-xl shadow-2xl" />
        </div>
      )}

      {onBack && <button onClick={onBack} className="flex items-center gap-1 text-ink-soft font-semibold text-sm">← Back</button>}

      <div>
        <h2 className="text-lg font-bold text-ink">File Cabinet</h2>
        <p className="text-xs text-ink-soft font-medium">Your receipts, kept encrypted on this device.</p>
      </div>

      {/* Folder tabs */}
      <div className="flex bg-brand-50 rounded-lg p-0.5 border border-line">
        <button onClick={() => setFolder('processed')} className={`flex-1 px-3 py-2 rounded-md text-xs font-bold ${folder === 'processed' ? 'bg-white shadow text-ink' : 'text-ink-soft'}`}>
          Processed receipts
        </button>
        <button onClick={() => setFolder('other')} className={`flex-1 px-3 py-2 rounded-md text-xs font-bold ${folder === 'other' ? 'bg-white shadow text-ink' : 'text-ink-soft'}`}>
          Other receipts
        </button>
      </div>

      {/* Receipt backup reminder */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 flex items-start gap-2">
        <span className="text-sm">🗂️</span>
        <p className="text-[11px] text-amber-800 leading-relaxed">
          <strong>Back up your receipts.</strong> They live encrypted on this device only. Use Settings → Backup to keep a copy — HMRC expects you to keep records for years.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-ink-soft animate-spin" /></div>
      ) : folder === 'processed' ? (
        <>
          <p className="text-[11px] text-ink-soft">Receipts attached to a ledger entry. Snap a receipt from the Scan button to add one here automatically.</p>

          {/* Search + date filter */}
          <div className="space-y-2">
            <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search receipts by name…" className="w-full px-3 py-2 border border-line rounded-lg text-sm bg-white text-ink" />
            <div className="flex items-center gap-2">
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="flex-1 px-2 py-2 border border-line rounded-lg text-xs bg-white text-ink" />
              <span className="text-xs text-ink-soft">to</span>
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="flex-1 px-2 py-2 border border-line rounded-lg text-xs bg-white text-ink" />
              {(q || fromDate || toDate) && <button onClick={() => { setQ(''); setFromDate(''); setToDate(''); }} className="text-xs font-bold text-brand-600">Clear</button>}
            </div>
            <div className="flex bg-brand-50 rounded-lg p-0.5 border border-line">
              {(['date', 'merchant', 'category'] as SortMode[]).map((mode) => (
                <button key={mode} onClick={() => setSortMode(mode)} className={`flex-1 px-3 py-1.5 rounded-md text-xs font-bold ${sortMode === mode ? 'bg-white shadow text-ink' : 'text-ink-soft'}`}>
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {sorted.length === 0 ? (
            <div className="bg-white rounded-xl border border-line p-8 text-center">
              <Image className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-900 font-bold">No processed receipts yet</p>
              <p className="text-ink-soft text-sm mt-1">Scan a receipt when adding a transaction and it'll be filed here.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {sorted.map((tx) => {
                const debitSplit = tx.splits.find((s) => s.amount > 0);
                const url = previews[tx.id] ?? null;
                const unlocked = !!url;
                return (
                  <div key={tx.id} className="bg-white rounded-xl border border-line p-3 flex flex-col gap-2">
                    <div className="w-full aspect-square bg-slate-50 border border-line rounded-lg overflow-hidden relative flex items-center justify-center">
                      {unlocked ? (
                        <>
                          <img src={url} alt="Receipt" className="w-full h-full object-cover" />
                          <button onClick={() => setZoomedUrl(url)} className="absolute bottom-1.5 right-1.5 w-7 h-7 bg-black/50 text-white rounded-lg flex items-center justify-center"><Eye className="w-3.5 h-3.5" /></button>
                        </>
                      ) : (
                        <div className="text-center px-2">
                          <Lock className="w-5 h-5 text-slate-300 mx-auto mb-1" />
                          <span className="text-[10px] font-bold text-ink-soft uppercase tracking-wider block">Sealed</span>
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900 truncate">{tx.description}</p>
                      <p className="text-xs text-ink-soft mt-0.5 font-medium">{tx.date}</p>
                      <span className="text-xs font-bold text-slate-900 num">{formatCurrency(debitSplit?.amount || 0, region)}</span>
                    </div>
                    {unlocked ? (
                      <span className="block text-center text-[10px] font-bold text-brand-700 bg-brand-50 border border-brand-200 py-1 rounded-lg uppercase tracking-wider">In memory</span>
                    ) : (
                      <button onClick={() => decryptTx(tx)} disabled={decryptingId === tx.id} className="w-full flex items-center justify-center gap-1.5 py-2 bg-slate-900 hover:bg-slate-700 disabled:opacity-60 text-white rounded-lg text-xs font-bold">
                        {decryptingId === tx.id ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Decrypting…</> : <><Lock className="w-3.5 h-3.5" /> Unlock</>}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <>
          {/* OTHER RECEIPTS — storage only, clearly not part of the ledger */}
          <div className="bg-brand-50 border border-brand-200 rounded-lg p-3">
            <p className="text-xs text-brand-800 leading-relaxed">
              <strong>Storage only.</strong> Receipts you save here are kept for your records but are <strong>NOT added to your ledger, your figures, or your tax totals</strong>. Use them for proof of purchase or to process later. If you want a receipt to create a transaction, use the <strong>Scan</strong> button instead.
            </p>
          </div>

          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { if (e.target.files?.[0]) captureReceipt(e.target.files[0]); e.target.value = ''; }} />
          <button onClick={() => fileRef.current?.click()} disabled={saving} className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-bold py-3 rounded-xl disabled:opacity-60">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><Camera className="w-4 h-4" /> Save a receipt (records only)</>}
          </button>

          {others.length === 0 ? (
            <div className="bg-white rounded-xl border border-line p-8 text-center">
              <Image className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-900 font-bold">No saved receipts</p>
              <p className="text-ink-soft text-sm mt-1">Snap a receipt above to keep it for your records.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {others.sort((a, b) => b.created_at - a.created_at).map((att) => {
                const url = previews[att.id] ?? null;
                const unlocked = !!url;
                return (
                  <div key={att.id} className="bg-white rounded-xl border border-line p-3 flex flex-col gap-2">
                    <div className="w-full aspect-square bg-slate-50 border border-line rounded-lg overflow-hidden relative flex items-center justify-center">
                      {unlocked ? (
                        <>
                          <img src={url} alt="Receipt" className="w-full h-full object-cover" />
                          <button onClick={() => setZoomedUrl(url)} className="absolute bottom-1.5 right-1.5 w-7 h-7 bg-black/50 text-white rounded-lg flex items-center justify-center"><Eye className="w-3.5 h-3.5" /></button>
                        </>
                      ) : (
                        <div className="text-center px-2">
                          <Lock className="w-5 h-5 text-slate-300 mx-auto mb-1" />
                          <span className="text-[10px] font-bold text-ink-soft uppercase tracking-wider block">Sealed</span>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-ink-soft font-medium">{new Date(att.created_at).toLocaleDateString()}</p>
                    <div className="flex gap-1.5">
                      {unlocked ? (
                        <span className="flex-1 text-center text-[10px] font-bold text-brand-700 bg-brand-50 border border-brand-200 py-1.5 rounded-lg uppercase tracking-wider">In memory</span>
                      ) : (
                        <button onClick={() => decryptOther(att)} disabled={decryptingId === att.id} className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-slate-900 text-white rounded-lg text-[11px] font-bold">
                          {decryptingId === att.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Lock className="w-3 h-3" />} Unlock
                        </button>
                      )}
                      <button onClick={() => deleteOther(att.id)} className="w-8 flex items-center justify-center bg-red-50 text-red-600 rounded-lg border border-red-200" title="Delete receipt"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
