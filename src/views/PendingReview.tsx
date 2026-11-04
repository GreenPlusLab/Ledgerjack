import { useState, useEffect } from 'react';
import { Check, X, Edit3, Eye, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { db, loadWithSplits, type TransactionWithSplits } from '../lib/db';
import { approveTransaction, deleteTransaction, updateTransaction, makeSimpleSplits } from '../lib/ledger';
import { useApp } from '../contexts/AppContext';
import { useCrypto } from '../contexts/CryptoContext';
import { formatCurrency, parseCurrencyInput } from '../lib/currency';
import { useAttachment } from '../hooks/useAttachment';
import Disclaimer from '../components/Disclaimer';
import FullAttention, { ReadingIssues, CheckMark } from '../components/FullAttention';
import { FLAG_TEXT, MUST_FIX, storedFlags, fieldsToCheck, type ReadingField } from '../lib/ai/readingChecks';

export default function PendingReview() {
  const [pending, setPending] = useState<TransactionWithSplits[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editDebitAccount, setEditDebitAccount] = useState('');
  const [editCreditAccount, setEditCreditAccount] = useState('');
  const [editJobTag, setEditJobTag] = useState('');
  const [error, setError] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const { region } = useApp();
  const { decryptBlob } = useCrypto();
  const { createTrackedUrl, revokeTrackedUrl } = useAttachment();
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    loadPending();
    db.accounts.toArray().then((accs) => {
      setAccounts(
        accs
          .filter((a) => !a.placeholder)
          .map((a) => ({ id: a.id, name: a.name }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
    });
  }, []);


  const loadPending = async () => {
    const txns = await db.transactions.filter((tx) => tx.pending_review).toArray();
    txns.sort((a, b) => b.date.localeCompare(a.date));
    const withSplits = await loadWithSplits(txns);
    setPending(withSplits);
  };

  const handleApprove = async (id: string) => {
    try {
      await approveTransaction(id);
      await loadPending();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTransaction(id);
      await loadPending();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const startEdit = (tx: TransactionWithSplits) => {
    setEditingId(tx.id);
    setEditDate(tx.date);
    setEditDesc(tx.description);
    const debitSplit  = tx.splits.find((s) => s.amount > 0);
    const creditSplit = tx.splits.find((s) => s.amount < 0);
    setEditAmount((Math.abs(debitSplit?.amount || 0) / 100).toFixed(2));
    setEditDebitAccount(debitSplit?.account_id || '');
    setEditCreditAccount(creditSplit?.account_id || '');
    setEditJobTag(tx.job_tag || '');
    setError('');
  };

  const handleEditSave = async (id: string) => {
    try {
      const amountVal = parseCurrencyInput(editAmount);
      if (!amountVal) { setError('Invalid amount.'); return; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(editDate)) { setError('Enter the date from the receipt.'); return; }
      await updateTransaction(
        id,
        // The person has now looked at and saved every field, so the reading flags are cleared.
        { date: editDate, description: editDesc, job_tag: editJobTag || undefined, review_flags: undefined },
        makeSimpleSplits(editDebitAccount, editCreditAccount, amountVal),
      );
      setEditingId(null);
      await loadPending();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handlePreviewAttachment = async (attachmentId: string) => {
    try {
      const att = await db.attachments.get(attachmentId);
      if (!att) return;
      const decrypted = await decryptBlob(att.encrypted_iv, att.encrypted_data);
      const blob = new Blob([new Uint8Array(decrypted)], { type: att.mime_type });
      if (previewUrl) revokeTrackedUrl(previewUrl);
      const url = createTrackedUrl(blob);
      setPreviewUrl(url);
    } catch {
      setError('Failed to decrypt attachment.');
    }
  };

  if (pending.length === 0) {
    return (
      <div className="space-y-4 pb-24">
        <Disclaimer />
        <div className="bg-white rounded-xl border border-line p-8 text-center">
          <Check className="w-10 h-10 text-brand-500 mx-auto mb-3" />
          <p className="text-slate-900 font-bold">All caught up!</p>
          <p className="text-ink-soft text-sm mt-1">No transactions pending review.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24">
      <Disclaimer />

      {previewUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => { if (previewUrl) revokeTrackedUrl(previewUrl); setPreviewUrl(null); }}>
          <img src={previewUrl} alt="Receipt" className="max-w-full max-h-[80vh] rounded-xl" />
        </div>
      )}

      <h2 className="text-lg font-bold text-slate-900">
        Pending Review ({pending.length})
      </h2>

      <FullAttention compact />

      {error && (
        <div className="bg-red-50 border-2 border-red-200 rounded-xl p-3 text-red-700 text-sm font-medium">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {pending.map((tx) => {
          const isEditing = editingId === tx.id;
          const debitSplit = tx.splits.find((s) => s.amount > 0);
          const isExpense = debitSplit?.account_id.startsWith('Expenses');
          const flags = storedFlags(tx.review_flags);
          if (!tx.date && !flags.includes('date-missing')) flags.unshift('date-missing');
          const incomplete = flags.some((f) => MUST_FIX.has(f));
          const toCheck = fieldsToCheck(flags);
          const inputCls = (field: ReadingField, extra = '') =>
            `w-full px-3 py-2 border-2 rounded-lg text-sm text-slate-900 font-medium ${toCheck.has(field) ? 'border-amber-400 bg-amber-50' : `border-slate-300 ${extra}`}`;
          const lookLabel = (field: ReadingField) =>
            toCheck.has(field) ? <p className="text-[10px] font-bold text-amber-800 -mb-2">Worth a look</p> : null;

          return (
            <div key={tx.id} className="bg-white rounded-xl border border-line p-4 space-y-3">
              {isEditing ? (
                <div className="space-y-3">
                  {lookLabel('date')}
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className={inputCls('date')}
                  />
                  {lookLabel('description')}
                  <input
                    type="text"
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    className={inputCls('description')}
                  />
                  {lookLabel('amount')}
                  <input
                    type="number"
                    step="0.01"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    className={inputCls('amount')}
                  />
                  {lookLabel('category')}
                  <select
                    value={editDebitAccount}
                    onChange={(e) => setEditDebitAccount(e.target.value)}
                    className={inputCls('category', 'bg-white')}
                  >
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                  <select
                    value={editCreditAccount}
                    onChange={(e) => setEditCreditAccount(e.target.value)}
                    className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg text-sm text-slate-900 bg-white font-medium"
                  >
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                  <input
                    type="text"
                    value={editJobTag}
                    onChange={(e) => setEditJobTag(e.target.value)}
                    placeholder="Job tag"
                    className="w-full px-3 py-2 border-2 border-slate-300 rounded-lg text-sm text-slate-900 font-medium"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEditSave(tx.id)}
                      className="flex-1 bg-brand-500 text-white py-2 rounded-lg text-sm font-bold hover:bg-brand-600"
                    >
                      Save Changes
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-4 py-2 border-2 border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50 font-medium"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start gap-3">
                  {tx.attachment_id && <ReceiptThumb attachmentId={tx.attachment_id} onOpen={() => handlePreviewAttachment(tx.attachment_id!)} />}
                  <div className="flex-1 min-w-0 flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center border ${
                          isExpense ? 'bg-red-50 border-red-200 text-red-600' : 'bg-emerald-50 border-emerald-200 text-income'
                        }`}
                      >
                        {isExpense ? <ArrowDownRight className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0 space-y-0.5">
                        <CheckMark on={toCheck.has('description')}>
                          <p className="font-semibold text-slate-900 break-words">{tx.description}</p>
                        </CheckMark>
                        <CheckMark on={toCheck.has('date')}>
                          <p className="text-xs text-ink-soft font-medium">{tx.date || 'No date'}</p>
                        </CheckMark>
                        <CheckMark on={toCheck.has('category')}>
                          <p className="text-xs text-ink-soft font-medium break-words">{debitSplit?.account_id}</p>
                        </CheckMark>
                        {tx.job_tag && (
                          <span className="inline-block mt-1 text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full font-semibold border border-brand-200">
                            {tx.job_tag}
                          </span>
                        )}
                      </div>
                    </div>
                    <CheckMark on={toCheck.has('amount')} className="shrink-0 text-right">
                      <span className={`font-bold ${isExpense ? 'text-red-600' : 'text-income'}`}>
                      {isExpense ? '-' : '+'}{formatCurrency(Math.abs(debitSplit?.amount || 0), region)}
                      </span>
                    </CheckMark>
                  </div>
                  </div>

                  {flags.length > 0 && (
                    <div className="bg-amber-50 border border-amber-300 rounded-lg p-2.5 space-y-1">
                      <p className="text-[11px] font-bold text-amber-900">Worth a second look</p>
                      <ReadingIssues messages={flags.map((f) => FLAG_TEXT[f])} />
                    </div>
                  )}

                  <div className="flex gap-2 pt-1">
                    {incomplete ? (
                      <button
                        onClick={() => startEdit(tx)}
                        className="flex-1 flex items-center justify-center gap-1 bg-brand-500 text-white py-2 rounded-lg text-sm font-bold hover:bg-brand-600 transition-colors"
                      >
                        <Edit3 className="w-4 h-4" /> Fill in what's missing
                      </button>
                    ) : (
                      <button
                        onClick={() => handleApprove(tx.id)}
                        className="flex-1 flex items-center justify-center gap-1 bg-brand-500 text-white py-2 rounded-lg text-sm font-bold hover:bg-brand-600 transition-colors"
                      >
                        <Check className="w-4 h-4" /> Approve & Save
                      </button>
                    )}
                    <button
                      onClick={() => startEdit(tx)}
                      className="px-3 py-2 bg-slate-100 border border-line text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
                      aria-label="Edit"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    {tx.attachment_id && (
                      <button
                        onClick={() => handlePreviewAttachment(tx.attachment_id!)}
                        className="px-3 py-2 bg-slate-100 border border-line text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(tx.id)}
                      className="px-3 py-2 bg-red-50 border border-red-200 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The receipt photo beside the figures, decrypted on this device only while shown. */
function ReceiptThumb({ attachmentId, onOpen }: { attachmentId: string; onOpen: () => void }) {
  const { decryptBlob } = useCrypto();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let made: string | null = null;
    let live = true;
    (async () => {
      try {
        const att = await db.attachments.get(attachmentId);
        if (!att || !live) return;
        const bytes = await decryptBlob(att.encrypted_iv, att.encrypted_data);
        if (!live) return;
        made = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: att.mime_type }));
        setUrl(made);
      } catch { /* the eye button still offers the full view */ }
    })();
    return () => { live = false; if (made) URL.revokeObjectURL(made); };
  }, [attachmentId, decryptBlob]);
  if (!url) return null;
  return (
    <button type="button" onClick={onOpen} className="shrink-0" aria-label="Show the receipt photo larger">
      <img src={url} alt="Receipt" className="w-20 max-h-32 object-contain rounded border border-line bg-white" />
    </button>
  );
}
