import { useState, useRef, useEffect } from 'react';
import { Sparkles, Camera, Upload, Type, ChevronDown, X, Loader2, GitBranch, List, CheckCircle2, Pencil, Eye } from 'lucide-react';
import { useApp, useRegionConfig } from '../contexts/AppContext';
import { useCrypto } from '../contexts/CryptoContext';
import { createTransaction, makeSimpleSplits, LedgerError } from '../lib/ledger';
import { parseWithAI, aiParsedToPendingTransaction, checkAIReading, type AIParsedTransaction } from '../lib/ai';
import { MUST_FIX, flagsOf, fieldsToCheck } from '../lib/ai/readingChecks';
import FullAttention, { ReadingIssues, CheckMark } from '../components/FullAttention';
import { getSelectedModel } from '../lib/ai/aiModels';
import { blobToUint8Array } from '../lib/image';
import { useAttachment } from '../hooks/useAttachment';
import { db } from '../lib/db';
import { parseCurrencyInput, formatCurrency } from '../lib/currency';
import { loadRules, matchRule, type CategoryRule } from '../lib/rules/rules';
import { loadTrades, type Trade } from '../lib/trades/trades';
import Disclaimer from '../components/Disclaimer';
import PrivacyBadge from '../components/privacy/PrivacyBadge';
import { AIBlockedError } from '../lib/ai/gateway';
import { effectiveReading } from '../lib/ai/policy';
import { READING_OPTIONS, type PrivacyChoice } from '../lib/privacy/choices';
import { CHOICE_CHANGED_EVENT, loadChoice } from '../lib/privacy/store';
import { readTextOnDevice, ocrDownloadedBefore, OCR_DOWNLOAD_MB } from '../lib/ocr/ocr';
import { suggestFromReceiptText, dateOrderFor } from '../lib/ocr/receiptText';

type EntryMode = 'ai' | 'manual';

export default function TransactionEntry() {
  const [mode, setMode]               = useState<EntryMode>('ai');
  const [aiInput, setAiInput]         = useState('');
  const [aiLoading, setAiLoading]     = useState(false);
  const [aiError, setAiError]         = useState('');
  const [aiOff, setAiOff]             = useState(false);
  const [ocrState, setOcrState]       = useState<'idle' | 'confirm' | 'reading'>('idle');
  const [ocrProgress, setOcrProgress] = useState('');
  const [ocrNotes, setOcrNotes]       = useState<string[] | null>(null);
  const [privacy, setPrivacy]         = useState<PrivacyChoice | null>(null);
  const [parsedResult, setParsedResult] = useState<AIParsedTransaction | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<AIParsedTransaction | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [splitChoice, setSplitChoice] = useState<'combined' | 'split'>('combined');

  const { region, apiKey, aiModel } = useApp();
  const cfg = useRegionConfig();
  const { encryptBlob } = useCrypto();

  const [date, setDate]                   = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription]     = useState('');
  const [amount, setAmount]               = useState('');
  const [debitAccount, setDebitAccount]   = useState(cfg.allowableExpensesParent);
  const [creditAccount, setCreditAccount] = useState(cfg.cashAccount);
  const [jobTag, setJobTag]               = useState('');
  const [isIncome, setIsIncome]           = useState(false);
  const [receiptFile, setReceiptFile]     = useState<File | null>(null);
  const [receiptImageData, setReceiptImageData] = useState<string | null>(null);
  const [submitError, setSubmitError]     = useState('');
  const [success, setSuccess]             = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { compressToWebP } = useAttachment();

  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [rules, setRules] = useState<CategoryRule[]>([]);
  const [ruleHint, setRuleHint] = useState<string | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [selectedTrade, setSelectedTrade] = useState<string>('');

  useEffect(() => {
    db.accounts.toArray().then((accs) => {
      setAccounts(
        accs
          .filter((a) => !a.placeholder)
          .map((a) => ({ id: a.id, name: a.name }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
    });
  }, []);

  useEffect(() => {
    if (isIncome) {
      setDebitAccount(cfg.cashAccount);
      setCreditAccount(cfg.grossIncomeAccount);
    } else {
      setDebitAccount(cfg.allowableExpensesParent);
      setCreditAccount(cfg.cashAccount);
    }
  }, [isIncome, cfg]);

  // Categorisation rules: auto-file by description (deterministic, no AI).
  useEffect(() => {
    loadRules().then(setRules);
  }, []);

  useEffect(() => {
    loadTrades().then(setTrades);
  }, []);

  useEffect(() => {
    if (mode !== 'manual') { setRuleHint(null); return; }
    const match = description.trim() ? matchRule(description, rules) : null;
    if (!match) { setRuleHint(null); return; }
    const acc = accounts.find((a) => a.id === match.accountId);
    const inc = /^income/i.test(match.accountId) || !!acc?.name?.startsWith('Income');
    // Flip the income/expense side first if needed; the effect re-runs after.
    if (inc && !isIncome) { setIsIncome(true); return; }
    if (!inc && isIncome) { setIsIncome(false); return; }
    if (inc) setCreditAccount(match.accountId); else setDebitAccount(match.accountId);
    setRuleHint(acc?.name ?? match.accountId);
  }, [description, rules, mode, isIncome, accounts]);

  const resolveUseHighQuality = (hasImage: boolean): boolean => {
    if (aiModel === 'quality') return true;
    if (aiModel === 'economy') return false;
    return hasImage; // smart: use high quality only for images
  };

  useEffect(() => {
    const load = () => { loadChoice().then(setPrivacy); };
    load();
    window.addEventListener(CHOICE_CHANGED_EVENT, load);
    return () => window.removeEventListener(CHOICE_CHANGED_EVENT, load);
  }, []);
  const reading = effectiveReading(privacy, !!apiKey);
  const readingInfo = READING_OPTIONS[reading];

  const handleAIParse = async (forceBigModel = false, justThisOne = false) => {
    if (!aiInput.trim()) return;
    setAiLoading(true);
    setAiError('');
    setAiOff(false);
    setParsedResult(null);
    if (forceBigModel) setPendingConfirm(null);

    try {
      const hasImage = !!receiptImageData;
      const parsed = await parseWithAI({
        text:               aiInput,
        apiKey,
        region,
        imageData:          receiptImageData || undefined,
        useHighQualityModel: forceBigModel ? true : resolveUseHighQuality(hasImage),
        modelId:            forceBigModel ? 'openai/gpt-4o' : getSelectedModel('scanning'),
        justThisOne,
      });

      // If there's a split suggestion, show the split review UI before committing
      if (parsed.split_suggestion && parsed.split_suggestion.length > 1) {
        setParsedResult(parsed);
        setSplitChoice('split');
        return;
      }

      // Otherwise, ask the user to confirm the AI-read amount before saving.
      setPendingConfirm(parsed);
    } catch (e: unknown) {
      if (e instanceof AIBlockedError && e.code === 'ai-off') setAiOff(true);
      const msg = e instanceof Error ? e.message : 'AI parsing failed. Try manual entry.';
      setAiError(msg);
    } finally {
      setAiLoading(false);
    }
  };

  // Compress, encrypt and store the current receipt image (if any), returning
  // its attachment id so it can be linked to the ledger entry it belongs to.
  const saveReceiptIfAny = async (): Promise<string | undefined> => {
    if (!receiptFile) return undefined;
    const compressed = await compressToWebP(receiptFile);
    const bytes      = await blobToUint8Array(compressed);
    const encrypted  = await encryptBlob(bytes);
    const attachmentId = crypto.randomUUID();
    await db.attachments.add({
      id:             attachmentId,
      transaction_id: '',
      encrypted_iv:   encrypted.iv,
      encrypted_data: encrypted.ciphertext,
      mime_type:      'image/webp',
      created_at:     Date.now(),
    });
    return attachmentId;
  };

  const handleConfirmScanned = async () => {
    if (!pendingConfirm) return;
    try {
      const txData = aiParsedToPendingTransaction(pendingConfirm, region);
      const attachmentId = await saveReceiptIfAny();
      await createTransaction({ ...txData.txFields, trade: selectedTrade || undefined, attachment_id: attachmentId }, txData.splits);
      setPendingConfirm(null);
      setAiInput('');
      setReceiptFile(null);
      setReceiptImageData(null);
      setOcrNotes(null);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e: unknown) {
      setAiError(e instanceof Error ? e.message : 'Could not save. Please try again.');
    }
  };

  const handleEditScanned = () => {
    if (!pendingConfirm) return;
    const p = pendingConfirm;
    setDescription(p.description);
    setDate(p.date); // empty when the date couldn't be read
    setAmount(p.amount > 0 ? (p.amount / 100).toFixed(2) : '');
    setDebitAccount(p.debit_account);
    setCreditAccount(p.credit_account);
    setJobTag(p.job_tag || '');
    setPendingConfirm(null);
    setMode('manual');
  };

  const handleCommitSplitSuggestion = async () => {
    if (!parsedResult) return;
    try {
      const attachmentId = await saveReceiptIfAny();
      if (splitChoice === 'split' && parsedResult.split_suggestion && parsedResult.split_suggestion.length > 1) {
        const flags = flagsOf(checkAIReading(parsedResult, (m) => String(m)));
        for (const s of parsedResult.split_suggestion) {
          const splits = makeSimpleSplits(s.debit_account, s.credit_account, s.amount);
          await createTransaction({
            date:           parsedResult.date,
            description:    s.description,
            pending_review: true,
            job_tag:        s.job_tag,
            attachment_id:  attachmentId,
            review_flags:   flags.length ? flags : undefined,
          }, splits);
        }
      } else {
        const txData = aiParsedToPendingTransaction(parsedResult, region);
        await createTransaction({ ...txData.txFields, attachment_id: attachmentId }, txData.splits);
      }
      setParsedResult(null);
      setAiInput('');
      setReceiptFile(null);
      setReceiptImageData(null);
      setOcrNotes(null);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to save transaction.';
      setAiError(msg);
    }
  };

  // Read the receipt photo on this phone (text recognition). Fills in the form
  // as suggestions; the person checks every field before saving.
  const readOnPhone = async () => {
    if (!receiptImageData) return;
    if (!ocrDownloadedBefore() && ocrState !== 'confirm') { setOcrState('confirm'); return; }
    setOcrState('reading');
    setAiError('');
    try {
      const text = await readTextOnDevice(receiptImageData, (status, p) =>
        setOcrProgress(status.includes('recogniz') ? `Reading… ${Math.round(p * 100)}%` : 'Getting the reader ready…'));
      const today = new Date().toISOString().slice(0, 10);
      const s = suggestFromReceiptText(text, dateOrderFor(region), today);
      setDate(s.date ?? ''); // never filled in with today's date
      if (s.merchant) setDescription(s.merchant);
      if (s.totalMinor !== undefined) setAmount(`${Math.trunc(s.totalMinor / 100)}.${String(s.totalMinor % 100).padStart(2, '0')}`);
      setIsIncome(false);
      setOcrNotes(s.notes);
      setMode('manual');
    } catch {
      setAiError("Couldn't read this photo on your phone. Try a clearer photo, or type it in.");
    } finally {
      setOcrState('idle');
      setOcrProgress('');
    }
  };

  const handleFileSelect = async (file: File) => {
    setReceiptFile(file);
    setAiInput((prev) => prev || 'Parse the attached receipt image');
    const reader = new FileReader();
    reader.onload = (e) => setReceiptImageData(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleManualSubmit = async () => {
    setSubmitError('');
    const amountVal = parseCurrencyInput(amount);
    if (!amountVal) { setSubmitError('Please enter a valid amount.'); return; }
    if (!description.trim()) { setSubmitError('Please enter a description.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { setSubmitError('Please enter the date from the receipt.'); return; }

    try {
      let attachmentId: string | undefined;

      if (receiptFile) {
        const compressed = await compressToWebP(receiptFile);
        const bytes      = await blobToUint8Array(compressed);
        const encrypted  = await encryptBlob(bytes);
        attachmentId = crypto.randomUUID();
        await db.attachments.add({
          id:             attachmentId,
          transaction_id: '',
          encrypted_iv:   encrypted.iv,
          encrypted_data: encrypted.ciphertext,
          mime_type:      'image/webp',
          created_at:     Date.now(),
        });
      }

      const splits = makeSimpleSplits(debitAccount, creditAccount, amountVal);
      await createTransaction({
        date,
        description:    description.trim(),
        pending_review: true,
        job_tag:        jobTag.trim() || undefined,
        trade:          selectedTrade || undefined,
        attachment_id:  attachmentId,
      }, splits);

      setDescription('');
      setAmount('');
      setJobTag('');
      setReceiptFile(null);
      setReceiptImageData(null);
      setOcrNotes(null);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e: unknown) {
      if (e instanceof LedgerError) setSubmitError(e.message);
      else setSubmitError(e instanceof Error ? `Couldn't save: ${e.message}` : 'Failed to save transaction.');
    }
  };

  const fmtMoney = (minor: number) => formatCurrency(minor, region);
  const confirmIssues = pendingConfirm ? checkAIReading(pendingConfirm, fmtMoney) : [];
  const confirmIncomplete = confirmIssues.some((i) => MUST_FIX.has(i.flag));
  const confirmFields = fieldsToCheck(confirmIssues.map((i) => i.flag));
  const splitIssues = parsedResult ? checkAIReading(parsedResult, fmtMoney) : [];

  const modelLabel =
    aiModel === 'quality' ? 'gpt-4o (quality)'
    : aiModel === 'economy' ? 'gpt-4o-mini (economy)'
    : 'Smart routing (auto)';

  return (
    <div className="space-y-4 pb-24">
      <Disclaimer />

      {showReceipt && receiptImageData && (
        <button type="button" className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setShowReceipt(false)} aria-label="Close the receipt photo">
          <img src={receiptImageData} alt="Your receipt" className="max-w-full max-h-[85vh] rounded-xl" />
        </button>
      )}

      {success && (
        <div className="bg-brand-50 border-2 border-brand-300 rounded-xl p-3 text-brand-800 text-sm font-semibold">
          Transaction saved to Pending Review.
        </div>
      )}

      <div className="flex bg-slate-100 rounded-xl p-1 border border-line">
        <button
          onClick={() => setMode('ai')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-bold transition-all ${
            mode === 'ai' ? 'bg-white shadow text-brand-600' : 'text-slate-500'
          }`}
        >
          <Sparkles className="w-4 h-4" /> AI Parse
        </button>
        <button
          onClick={() => setMode('manual')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-bold transition-all ${
            mode === 'manual' ? 'bg-white shadow text-brand-600' : 'text-slate-500'
          }`}
        >
          <Type className="w-4 h-4" /> Manual
        </button>
      </div>

      {mode === 'ai' ? (
        <div className="space-y-3">
          {/* Confirm the AI-scanned details before saving */}
          {pendingConfirm && (
            <div className="bg-white border-2 border-brand-300 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-brand-600" />
                <p className="text-sm font-bold text-slate-900">Check what was scanned</p>
              </div>
              <FullAttention />

              {/* Each thing that looks wrong, in plain words. Nothing is changed for them. */}
              {(confirmIssues.length > 0 || pendingConfirm.uncertain_about) && (
                <div className="bg-amber-50 border border-amber-300 rounded-lg p-2.5 flex gap-2">
                  <Eye className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="space-y-1">
                    <p className="text-[11px] font-bold text-amber-900">Worth a second look</p>
                    <ReadingIssues messages={confirmIssues.map((i) => i.message)} />
                    {pendingConfirm.uncertain_about && (
                      <p className="text-[11px] text-amber-900 leading-relaxed">The reader said: {pendingConfirm.uncertain_about}</p>
                    )}
                  </div>
                </div>
              )}

              {/* The receipt beside the figures, so checking takes a glance. */}
              <div className="bg-slate-50 border border-line rounded-lg p-3 flex gap-3">
                {receiptImageData && (
                  <button type="button" onClick={() => setShowReceipt(true)} className="shrink-0" aria-label="Show the receipt photo larger">
                    <img src={receiptImageData} alt="Your receipt" className="w-24 max-h-40 object-contain rounded border border-line bg-white" />
                  </button>
                )}
                <div className="min-w-0 flex-1 space-y-1.5">
                  <CheckMark on={confirmFields.has('amount')}>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">Amount</p>
                    <p className="text-2xl font-bold text-slate-900 num">{pendingConfirm.amount > 0 ? formatCurrency(pendingConfirm.amount, region) : 'Not read'}</p>
                  </CheckMark>
                  <CheckMark on={confirmFields.has('description')}>
                    <p className="text-sm text-slate-700 truncate"><span className="text-ink-soft">Description:</span> {pendingConfirm.description || 'Not read'}</p>
                  </CheckMark>
                  <CheckMark on={confirmFields.has('date')}>
                    <p className="text-sm text-slate-700"><span className="text-ink-soft">Date:</span> {pendingConfirm.date || 'Not read'}</p>
                  </CheckMark>
                  <CheckMark on={confirmFields.has('category')}>
                    <p className="text-sm text-slate-700 truncate"><span className="text-ink-soft">Category:</span> {pendingConfirm.debit_account}</p>
                  </CheckMark>
                </div>
              </div>

              {confirmIncomplete ? (
                <p className="text-sm font-bold text-ink text-center">Something couldn't be read. Fill it in from the receipt.</p>
              ) : (
                <p className="text-sm font-bold text-ink text-center">Does every field match the receipt?</p>
              )}

              {trades.length > 0 && (
                <select
                  value={selectedTrade}
                  onChange={(e) => setSelectedTrade(e.target.value)}
                  className="w-full px-3 py-2 border border-line rounded-lg text-sm bg-white"
                >
                  <option value="">Trade: Unassigned</option>
                  {trades.map((t) => <option key={t.id} value={t.id}>Trade: {t.name}</option>)}
                </select>
              )}

              <div className="flex gap-2">
                {confirmIncomplete ? (
                  <button
                    onClick={handleEditScanned}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white py-2.5 rounded-lg text-sm font-bold transition-colors"
                  >
                    <Pencil className="w-4 h-4" /> Fill in what's missing
                  </button>
                ) : (
                  <button
                    onClick={handleConfirmScanned}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white py-2.5 rounded-lg text-sm font-bold transition-colors"
                  >
                    <CheckCircle2 className="w-4 h-4" /> I've checked it, save
                  </button>
                )}
                <button
                  onClick={handleEditScanned}
                  className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-semibold transition-colors"
                >
                  <Pencil className="w-4 h-4" /> Edit
                </button>
                <button
                  onClick={() => setPendingConfirm(null)}
                  className="flex items-center justify-center px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-lg transition-colors"
                  aria-label="Discard"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* If not correct, offer a more accurate (bigger) model */}
              <button
                onClick={() => handleAIParse(true)}
                disabled={aiLoading}
                className="w-full flex items-center justify-center gap-1.5 border border-brand-300 text-brand-700 py-2 rounded-lg text-xs font-bold disabled:opacity-50"
              >
                {aiLoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Re-scanning…</> : <>Not right? Scan again with a more accurate model</>}
              </button>
              <p className="text-[10px] text-ink-soft">The more accurate model costs a little more per scan. It'll be saved to your review queue for a final check either way.</p>
            </div>
          )}

          {/* Split suggestion review panel */}
          {parsedResult && parsedResult.split_suggestion && parsedResult.split_suggestion.length > 1 && (
            <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-amber-700" />
                <p className="text-sm font-bold text-amber-900">Mixed Receipt Detected</p>
              </div>
              <p className="text-xs text-amber-700 font-medium">
                This receipt contains multiple transaction types. How would you like to record it?
              </p>
              <FullAttention />
              <ReadingIssues messages={splitIssues.map((i) => i.message)} />
              <div className="flex p-0.5 bg-amber-100 rounded-lg border border-amber-200">
                <button
                  onClick={() => setSplitChoice('split')}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                    splitChoice === 'split' ? 'bg-white shadow-sm text-amber-900 border border-amber-200' : 'text-amber-600'
                  }`}
                >
                  Split into {parsedResult.split_suggestion.length} entries
                </button>
                <button
                  onClick={() => setSplitChoice('combined')}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                    splitChoice === 'combined' ? 'bg-white shadow-sm text-amber-900 border border-amber-200' : 'text-amber-600'
                  }`}
                >
                  Single entry
                </button>
              </div>

              {splitChoice === 'split' && (
                <div className="space-y-1.5">
                  {parsedResult.split_suggestion.map((s, i) => (
                    <div key={i} className="flex items-center justify-between bg-white border border-amber-200 rounded-lg px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-slate-900 truncate">{s.description}</p>
                        <p className="text-[10px] text-slate-500 truncate">{s.debit_account}</p>
                      </div>
                      <span className="text-xs font-bold text-slate-900 ml-2">
                        {formatCurrency(s.amount, region)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handleCommitSplitSuggestion}
                  className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 rounded-lg text-sm transition-colors"
                >
                  Confirm & Save
                </button>
                <button
                  onClick={() => setParsedResult(null)}
                  className="px-3 py-2 bg-white border border-amber-300 text-amber-700 rounded-lg text-sm font-semibold"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Line items panel */}
          {parsedResult && parsedResult.line_items && parsedResult.line_items.length > 0 && !parsedResult.split_suggestion && (
            <div className="bg-slate-50 border border-line rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-2">
                <List className="w-4 h-4 text-slate-500" />
                <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">Line Items Extracted</p>
              </div>
              {parsedResult.line_items.map((item, i) => (
                <div key={i} className="flex items-center justify-between text-xs border-b border-line pb-1.5 last:border-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <span className="font-semibold text-slate-800">{item.description}</span>
                    {item.quantity && <span className="text-ink-soft ml-1">× {item.quantity}</span>}
                    {item.account && <p className="text-[10px] text-ink-soft truncate">{item.account}</p>}
                  </div>
                  <span className="font-bold text-slate-900 ml-2">{formatCurrency(item.total, region)}</span>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-brand-600/30 transition-colors"
          >
            <Camera className="w-5 h-5" /> Scan a receipt
          </button>
          <p className="text-[11px] text-ink-soft text-center -mt-1">
            {reading === 'manual' || reading === 'ocr'
              ? 'Snap a photo and read it on your phone. You check every field before it counts.'
              : 'Snap a photo and the AI reads the amount, date & category. You approve it.'}
          </p>

          <div className="flex items-center gap-2 py-1">
            <div className="flex-1 h-px bg-line" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">or type it</span>
            <div className="flex-1 h-px bg-line" />
          </div>

          <textarea
            value={aiInput}
            onChange={(e) => { setAiInput(e.target.value); setAiError(''); }}
            placeholder='e.g. "Paid £20 for parking at terminal" or paste a receipt, invoice, or handwritten note'
            rows={3}
            className="w-full px-4 py-3 border border-line rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-slate-900 resize-none font-medium"
          />

          {receiptFile && (
            <div className="flex items-center gap-2 bg-slate-50 border border-line rounded-lg px-3 py-2">
              <Camera className="w-4 h-4 text-ink-soft flex-shrink-0" />
              <span className="text-xs font-medium text-slate-600 truncate flex-1">{receiptFile.name}</span>
              <button
                onClick={() => { setReceiptFile(null); setReceiptImageData(null); }}
                className="text-ink-soft hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-4 py-2.5 border-2 border-slate-300 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors text-sm font-semibold"
            >
              <Camera className="w-4 h-4" /> Photo
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0]); }}
            />
            <button
              onClick={() => handleAIParse()}
              disabled={aiLoading || !aiInput.trim()}
              className="flex-1 flex items-center justify-center gap-1.5 bg-brand-500 text-white font-bold py-2.5 rounded-xl hover:bg-brand-600 transition-colors disabled:opacity-50 shadow-sm"
            >
              {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {aiLoading ? 'Parsing...' : 'Parse & Save Draft'}
            </button>
          </div>

          {/* Status line — always shows model in use */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-soft font-medium">
            <span>Receipts: {readingInfo.label}{(reading === 'ownKey') && apiKey ? ` · ${modelLabel}` : ''}</span>
            <PrivacyBadge colour={readingInfo.colour} text={readingInfo.word} small />
          </div>
          {(reading === 'ownKey' || reading === 'freeAI') && !apiKey && (
            <p className="text-xs text-ink-soft">Add your AI account key in Settings to read receipts with AI.</p>
          )}

          {receiptImageData && (
            <div className="space-y-2">
              {ocrState === 'confirm' ? (
                <div className="bg-emerald-50 border-2 border-emerald-300 rounded-xl p-3 space-y-2">
                  <p className="text-xs text-slate-800">
                    Reading on your phone needs a one-time download of about {OCR_DOWNLOAD_MB} MB from LedgerJack, not from anyone else. Best on Wi-Fi. After that it works offline, and your photo never leaves your phone.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setOcrState('idle')} className="bg-white border border-line py-2 rounded-lg text-xs font-bold">Not now</button>
                    <button onClick={readOnPhone} className="bg-brand-600 text-white py-2 rounded-lg text-xs font-bold">Download and read</button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={readOnPhone}
                  disabled={ocrState === 'reading'}
                  className="w-full flex flex-wrap items-center justify-center gap-1.5 bg-white border-2 border-emerald-300 text-ink font-bold py-2.5 rounded-xl text-sm disabled:opacity-60"
                >
                  {ocrState === 'reading' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Type className="w-4 h-4" />}
                  {ocrState === 'reading' ? (ocrProgress || 'Reading…') : 'Read on this phone'}
                  <PrivacyBadge colour="green" small />
                </button>
              )}
            </div>
          )}
          {aiOff && (
            <button
              onClick={() => handleAIParse(false, true)}
              disabled={aiLoading}
              className="w-full flex flex-wrap items-center justify-center gap-1.5 bg-white border-2 border-amber-300 text-ink font-bold py-2.5 rounded-xl text-sm"
            >
              <Sparkles className="w-4 h-4" /> Read just this one with AI
              <PrivacyBadge colour="amber" text="Sent to the AI company you chose" small />
            </button>
          )}
          {aiError && (
            <div className={`${aiOff ? 'bg-amber-50 border-amber-300 text-slate-800' : 'bg-red-50 border-red-200 text-red-700'} border-2 rounded-xl p-3 text-sm font-medium`}>
              {aiError}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {ocrNotes !== null && (
            <div className="bg-emerald-50 border-2 border-emerald-300 rounded-xl p-3 space-y-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="text-sm font-bold text-slate-900">Read on your phone. Check each field before saving.</p>
                <PrivacyBadge colour="green" small />
              </div>
              {ocrNotes.map((n) => <p key={n} className="text-xs text-slate-700">{n}</p>)}
              <div className="pt-1"><FullAttention /></div>
            </div>
          )}
          <div className="flex bg-slate-100 rounded-xl p-1 border border-line">
            <button
              onClick={() => setIsIncome(false)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${
                !isIncome ? 'bg-white shadow text-red-600' : 'text-slate-500'
              }`}
            >
              Expense
            </button>
            <button
              onClick={() => setIsIncome(true)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${
                isIncome ? 'bg-white shadow text-income' : 'text-slate-500'
              }`}
            >
              Income
            </button>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-4 py-2.5 border-2 border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-slate-900 font-medium"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Parking at terminal"
              className="w-full px-4 py-2.5 border-2 border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-slate-900 font-medium"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1">
              Amount ({cfg.currencySymbol})
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full px-4 py-2.5 border-2 border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-slate-900 font-medium"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1">
              {isIncome ? 'Income Account' : 'Expense Account'}
            </label>
            <div className="relative">
              <select
                value={isIncome ? creditAccount : debitAccount}
                onChange={(e) => {
                  if (isIncome) setCreditAccount(e.target.value);
                  else setDebitAccount(e.target.value);
                }}
                className="w-full px-4 py-2.5 border-2 border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-slate-900 bg-white font-medium"
              >
                {accounts
                  .filter((a) => isIncome ? a.name.startsWith('Income') : a.name.startsWith('Expenses'))
                  .map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-soft pointer-events-none" />
            </div>
            {ruleHint && (
              <p className="mt-1 text-xs text-brand-600 flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Auto-filled from your rule — you can change it.
              </p>
            )}
          </div>

          {trades.length > 0 && (
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-1">Trade (optional)</label>
              <select
                value={selectedTrade}
                onChange={(e) => setSelectedTrade(e.target.value)}
                className="w-full px-4 py-2.5 border-2 border-slate-300 rounded-xl bg-white font-medium text-slate-900 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              >
                <option value="">Unassigned</option>
                {trades.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1">Job/Project Tag (optional)</label>
            <input
              type="text"
              value={jobTag}
              onChange={(e) => setJobTag(e.target.value)}
              placeholder="e.g. Kitchen Reno - Smith"
              className="w-full px-4 py-2.5 border-2 border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none text-slate-900 font-medium"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1">Receipt Photo (optional)</label>
            <div className="flex gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-4 py-2.5 border-2 border-slate-300 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors text-sm font-semibold"
              >
                {receiptFile ? <X className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
                {receiptFile ? receiptFile.name.slice(0, 20) : 'Upload Receipt'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => { if (e.target.files?.[0]) setReceiptFile(e.target.files[0]); }}
              />
            </div>
          </div>

          {submitError && (
            <div className="bg-red-50 border-2 border-red-200 rounded-xl p-3 text-red-700 text-sm font-medium">
              {submitError}
            </div>
          )}

          <button
            onClick={handleManualSubmit}
            className="w-full bg-brand-500 text-white font-bold py-3 rounded-xl hover:bg-brand-600 transition-colors shadow-sm"
          >
            Save to Pending Review
          </button>
        </div>
      )}
    </div>
  );
}
