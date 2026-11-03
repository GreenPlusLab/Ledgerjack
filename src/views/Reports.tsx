import { useState, useEffect, useCallback } from 'react';
import { Printer, Download, Filter, TrendingUp, TrendingDown, Scale, BarChart2, Package } from 'lucide-react';
import { db, loadWithSplits, type TransactionWithSplits } from '../lib/db';
import { useApp, useRegionConfig } from '../contexts/AppContext';
import { formatCurrency } from '../lib/currency';
import { getCurrentFiscalYear, getFiscalYearRange } from '../lib/regions';
import { transactionsToCSV } from '../lib/csv';
import { downloadFile } from '../lib/backup';
import Disclaimer from '../components/Disclaimer';

// ── Job Profitability Explorer ─────────────────────────────────────────────

interface JobProfitRow {
  tag: string;
  income: number;
  expenses: number;
  net: number;
  txCount: number;
}

function buildJobProfitability(txns: TransactionWithSplits[]): JobProfitRow[] {
  const map: Record<string, JobProfitRow> = {};

  txns.forEach((tx) => {
    const tag = tx.job_tag || '(Untagged)';
    if (!map[tag]) map[tag] = { tag, income: 0, expenses: 0, net: 0, txCount: 0 };
    map[tag].txCount++;
    tx.splits.forEach((split) => {
      if (split.account_id.startsWith('Income') && split.amount < 0) {
        map[tag].income += Math.abs(split.amount);
      }
      if (split.account_id.startsWith('Expenses') && split.amount > 0) {
        map[tag].expenses += split.amount;
      }
    });
  });

  return Object.values(map)
    .map((row) => ({ ...row, net: row.income - row.expenses }))
    .sort((a, b) => b.net - a.net);
}

function JobProfitabilityExplorer({
  txns,
  region,
}: {
  txns: TransactionWithSplits[];
  region: string;
}) {
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const rows = buildJobProfitability(txns);
  if (rows.length === 0) return null;

  const maxAbsNet = Math.max(...rows.map((r) => Math.abs(r.net)), 1);

  const selectedRow = rows.find((r) => r.tag === selectedTag);

  return (
    <div className="bg-white rounded-xl border border-line overflow-hidden">
      <div className="px-5 py-4 border-b border-line flex items-center gap-2">
        <BarChart2 className="w-5 h-5 text-brand-600" />
        <h3 className="font-bold text-slate-900">Job Profitability Explorer</h3>
      </div>

      <div className="p-4 space-y-2">
        {rows.map((row) => {
          const barWidth = maxAbsNet > 0 ? (Math.abs(row.net) / maxAbsNet) * 100 : 0;
          const isSelected = selectedTag === row.tag;
          return (
            <button
              key={row.tag}
              onClick={() => setSelectedTag(isSelected ? null : row.tag)}
              className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                isSelected
                  ? 'border-brand-400 bg-brand-50'
                  : 'border-line hover:border-line bg-slate-50/50 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-semibold text-slate-900 truncate max-w-[60%]">{row.tag}</span>
                <span
                  className={`text-sm font-bold ${
                    row.net >= 0 ? 'text-income' : 'text-red-600'
                  }`}
                >
                  {row.net >= 0 ? '+' : ''}{formatCurrency(row.net, region)}
                </span>
              </div>
              {/* Profit bar */}
              <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    row.net >= 0 ? 'bg-emerald-500' : 'bg-red-400'
                  }`}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
              {isSelected && selectedRow && (
                <div className="mt-3 grid grid-cols-3 gap-2 pt-2 border-t border-brand-200">
                  <div>
                    <p className="text-[10px] font-bold text-ink-soft uppercase tracking-wider">Revenue</p>
                    <p className="text-xs font-bold text-income">{formatCurrency(selectedRow.income, region)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-ink-soft uppercase tracking-wider">Expenses</p>
                    <p className="text-xs font-bold text-expense">{formatCurrency(selectedRow.expenses, region)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-ink-soft uppercase tracking-wider">Entries</p>
                    <p className="text-xs font-bold text-slate-900">{selectedRow.txCount}</p>
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Tax Bundle Export ──────────────────────────────────────────────────────

async function exportTaxBundle(
  txns: TransactionWithSplits[],
  region: string,
  cfg: ReturnType<typeof useRegionConfig>,
  fy: number,
  incomeByAccount: Record<string, number>,
  expensesByAccount: Record<string, number>,
  totalIncome: number,
  totalExpenses: number,
  addAuditEntry: (type: string) => void,
) {

  // Build P&L summary CSV
  const plLines: string[] = [
    `${region === 'uk' ? 'Provisional Self-Assessment Summary' : 'Provisional Income & Tax Summary'} - ${cfg.label} - FY ${fy}/${fy + 1}`,
    '',
    'INCOME',
    'Account,Amount',
    ...Object.entries(incomeByAccount).map(([a, v]) => `"${a}","${(v / 100).toFixed(2)}"`),
    `"TOTAL INCOME","${(totalIncome / 100).toFixed(2)}"`,
    '',
    'EXPENSES',
    'Account,Amount',
    ...Object.entries(expensesByAccount).map(([a, v]) => `"${a}","${(v / 100).toFixed(2)}"`),
    `"TOTAL EXPENSES","${(totalExpenses / 100).toFixed(2)}"`,
    '',
    `"NET PROFIT / (LOSS)","${((totalIncome - totalExpenses) / 100).toFixed(2)}"`,
    '',
    'NOTES',
    '"This is a pre-accounting summary only. Not certified tax advice."',
    `"Generated: ${new Date().toLocaleString()}"`,
  ];

  // Build transaction ledger CSV
  const ledgerCsv = transactionsToCSV(txns, region);

  // Build receipt manifest (attachment index)
  const txnsWithAttachments = txns.filter((tx) => tx.attachment_id);
  const manifestLines = [
    'Transaction ID,Date,Description,Account,Amount,Attachment Status',
    ...txnsWithAttachments.map((tx) => {
      const debit = tx.splits.find((s) => s.amount > 0);
      const amount = debit ? (debit.amount / 100).toFixed(2) : '0.00';
      return `"${tx.id}","${tx.date}","${tx.description}","${debit?.account_id || ''}","${amount}","Encrypted locally"`;
    }),
  ];

  // Combine everything into a single text file (ZIP not available in pure browser without a lib)
  const bundleContent = [
    '=== LEDGERJACK TAX BUNDLE ===',
    `Generated: ${new Date().toISOString()}`,
    `Region: ${cfg.label}  |  Fiscal Year: ${fy}/${fy + 1}`,
    '',
    '--- PROFIT & LOSS SUMMARY ---',
    plLines.join('\n'),
    '',
    '--- FULL TRANSACTION LEDGER ---',
    ledgerCsv,
    '',
    '--- RECEIPT ATTACHMENT MANIFEST ---',
    `Total receipts on file: ${txnsWithAttachments.length}`,
    manifestLines.join('\n'),
    '',
    '--- DISCLAIMER ---',
    'LedgerJack organises records. It does not give tax advice. The records were',
    "kept on the user's device, and what goes in them is the user's responsibility.",
  ].join('\n');

  downloadFile(
    bundleContent,
    `ledgerjack-tax-bundle-fy${fy}-${new Date().toISOString().split('T')[0]}.txt`,
    'text/plain',
  );
  addAuditEntry('tax-bundle');
}

// ── Main Reports View ──────────────────────────────────────────────────────

export default function Reports() {
  const [transactions, setTransactions] = useState<TransactionWithSplits[]>([]);
  const [jobTagFilter, setJobTagFilter] = useState('');
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [bundleLoading, setBundleLoading] = useState(false);
  const { region } = useApp();
  const cfg = useRegionConfig();
  const { addExportAuditEntry } = useApp();

  const fy = getCurrentFiscalYear(region);
  const { start, end } = getFiscalYearRange(region, fy);

  const loadData = useCallback(async () => {
    const txns = await db.transactions
      .where('date')
      .between(start, end, true, true)
      .toArray();
    const approved = txns.filter((tx) => !tx.pending_review);
    const withSplits = await loadWithSplits(approved);
    setTransactions(withSplits);
    const tags = new Set<string>();
    withSplits.forEach((tx) => { if (tx.job_tag) tags.add(tx.job_tag); });
    setAvailableTags([...tags].sort());
  }, [start, end]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = jobTagFilter
    ? transactions.filter((tx) => tx.job_tag === jobTagFilter)
    : transactions;

  const incomeByAccount: Record<string, number> = {};
  const expensesByAccount: Record<string, number> = {};

  filtered.forEach((tx) => {
    tx.splits.forEach((split) => {
      if (split.account_id.startsWith('Income') && split.amount < 0) {
        incomeByAccount[split.account_id] = (incomeByAccount[split.account_id] || 0) + Math.abs(split.amount);
      }
      if (split.account_id.startsWith('Expenses') && split.amount > 0) {
        expensesByAccount[split.account_id] = (expensesByAccount[split.account_id] || 0) + split.amount;
      }
    });
  });

  const totalIncome = Object.values(incomeByAccount).reduce((a, b) => a + b, 0);
  const totalExpenses = Object.values(expensesByAccount).reduce((a, b) => a + b, 0);
  const netProfit = totalIncome - totalExpenses;

  const travelTotal = Object.entries(expensesByAccount)
    .filter(([acct]) => acct.startsWith('Expenses:Travel'))
    .reduce((sum, [, v]) => sum + v, 0);

  const softwareTotal = Object.entries(expensesByAccount)
    .filter(([acct]) => acct.startsWith('Expenses:Software'))
    .reduce((sum, [, v]) => sum + v, 0);

  const handleExportCSV = () => {
    const csv = transactionsToCSV(filtered, region);
    downloadFile(csv, `ledgerjack-export-${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
    addExportAuditEntry('csv');
  };

  const handleTaxBundle = async () => {
    setBundleLoading(true);
    try {
      await exportTaxBundle(
        filtered,
        region,
        cfg,
        fy,
        incomeByAccount,
        expensesByAccount,
        totalIncome,
        totalExpenses,
        addExportAuditEntry,
      );
    } finally {
      setBundleLoading(false);
    }
  };

  return (
    <div className="space-y-4 pb-24">
      <Disclaimer />

      {/* Toolbar */}
      <div className="flex items-center justify-between no-print">
        <h2 className="text-lg font-bold text-slate-900">Tax Summary & Reports</h2>
        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1 px-3 py-1.5 border-2 border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50 font-semibold"
          >
            <Printer className="w-4 h-4" /> Print
          </button>
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1 px-3 py-1.5 bg-brand-500 text-white rounded-lg text-sm font-bold hover:bg-brand-600"
          >
            <Download className="w-4 h-4" /> CSV
          </button>
        </div>
      </div>

      {/* Tax Bundle button */}
      <button
        onClick={handleTaxBundle}
        disabled={bundleLoading || filtered.length === 0}
        className="no-print w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold py-3 rounded-xl text-sm transition-colors shadow-sm"
      >
        <Package className="w-4 h-4" />
        {bundleLoading ? 'Preparing Bundle…' : 'Export Tax Bundle (P&L + Ledger + Receipt Manifest)'}
      </button>

      {availableTags.length > 0 && (
        <div className="no-print flex items-center gap-2">
          <Filter className="w-4 h-4 text-ink-soft flex-shrink-0" />
          <select
            value={jobTagFilter}
            onChange={(e) => setJobTagFilter(e.target.value)}
            className="flex-1 px-3 py-2 border-2 border-slate-300 rounded-lg text-sm text-slate-900 bg-white font-medium"
          >
            <option value="">All Jobs</option>
            {availableTags.map((tag) => (
              <option key={tag} value={tag}>{tag}</option>
            ))}
          </select>
        </div>
      )}

      {/* Job Profitability Explorer */}
      {transactions.length > 0 && (
        <div className="no-print">
          <JobProfitabilityExplorer txns={transactions} region={region} />
        </div>
      )}

      {/* Print area */}
      <div className="bg-white rounded-xl border border-line overflow-hidden print-area">

        {/* Report header */}
        <div className="bg-brand-600 text-white p-5 print:bg-white print:text-black print:border-b print:border-line">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-xl font-bold tracking-tight">{region === 'uk' ? 'Provisional Self-Assessment Summary' : 'Provisional Income & Tax Summary'}</h3>
              <p className="text-brand-100 print:text-slate-500 text-sm mt-1 font-medium">
                {cfg.label} &middot; FY {fy}/{fy + 1} &middot; {start} to {end}
                {jobTagFilter && ` &middot; Job: ${jobTagFilter}`}
              </p>
            </div>
            <p className="text-brand-200 print:text-ink-soft text-xs font-medium text-right">
              Generated<br />{new Date().toLocaleDateString()}
            </p>
          </div>
        </div>

        <div className="p-5 space-y-6">

          {/* Three-KPI summary row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-4 bg-slate-50 rounded-xl border border-line print:bg-white">
              <div className="flex items-center gap-1.5 mb-2">
                <TrendingUp className="w-4 h-4 text-income" />
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Gross Turnover</span>
              </div>
              <span className="text-xl font-bold text-slate-900 block">{formatCurrency(totalIncome, region)}</span>
            </div>
            <div className="p-4 bg-slate-50 rounded-xl border border-line print:bg-white">
              <div className="flex items-center gap-1.5 mb-2">
                <TrendingDown className="w-4 h-4 text-red-500" />
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Expenses</span>
              </div>
              <span className="text-xl font-bold text-expense block">{formatCurrency(totalExpenses, region)}</span>
            </div>
            <div className={`p-4 rounded-xl border print:bg-white ${netProfit >= 0 ? 'bg-brand-50 border-brand-200' : 'bg-red-50 border-red-200'}`}>
              <div className="flex items-center gap-1.5 mb-2">
                <Scale className={`w-4 h-4 ${netProfit >= 0 ? 'text-brand-600' : 'text-red-600'}`} />
                <span className={`text-[10px] font-bold uppercase tracking-widest ${netProfit >= 0 ? 'text-brand-700' : 'text-red-700'}`}>Net Taxable Profit</span>
              </div>
              <span className={`text-xl font-bold block ${netProfit >= 0 ? 'text-brand-800' : 'text-red-700'}`}>
                {formatCurrency(netProfit, region)}
              </span>
            </div>
          </div>

          {/* Income breakdown */}
          <div>
            <h4 className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest mb-3 pb-2 border-b border-line">
              Gross Income
            </h4>
            {Object.entries(incomeByAccount).sort().map(([account, amount]) => (
              <div key={account} className="flex justify-between py-1.5 border-b border-line last:border-0">
                <span className="text-sm text-slate-600 pl-3 font-medium">{account.split(':').slice(1).join(' › ')}</span>
                <span className="text-sm font-bold text-slate-900">{formatCurrency(amount, region)}</span>
              </div>
            ))}
            {Object.keys(incomeByAccount).length === 0 && (
              <p className="text-sm text-ink-soft pl-3 py-1.5 font-medium italic">No income recorded this period.</p>
            )}
            <div className="flex justify-between pt-3 mt-2 border-t-2 border-line font-bold">
              <span className="text-slate-900">Total Income</span>
              <span className="text-income">{formatCurrency(totalIncome, region)}</span>
            </div>
          </div>

          {/* Expense breakdown */}
          <div>
            <h4 className="text-[10px] font-bold text-red-700 uppercase tracking-widest mb-3 pb-2 border-b border-line">
              Expenses
            </h4>
            {Object.entries(expensesByAccount).sort().map(([account, amount]) => (
              <div key={account} className="flex justify-between py-1.5 border-b border-line last:border-0">
                <span className="text-sm text-slate-600 pl-3 font-medium">{account.split(':').slice(1).join(' › ')}</span>
                <span className="text-sm font-bold text-slate-900">{formatCurrency(amount, region)}</span>
              </div>
            ))}
            {Object.keys(expensesByAccount).length === 0 && (
              <p className="text-sm text-ink-soft pl-3 py-1.5 font-medium italic">No expenses recorded this period.</p>
            )}
            <div className="flex justify-between pt-3 mt-2 border-t-2 border-line font-bold">
              <span className="text-slate-900">Total Expenses</span>
              <span className="text-expense">{formatCurrency(totalExpenses, region)}</span>
            </div>
          </div>

          {/* Notable sub-lines */}
          {(travelTotal > 0 || softwareTotal > 0) && (
            <div className="bg-slate-50 rounded-xl border border-line p-4 print:bg-white space-y-2">
              <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Line-Item Notes</h4>
              {travelTotal > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600 font-medium">Travel & Flat-Rate Mileage</span>
                  <span className="font-bold text-slate-900">{formatCurrency(travelTotal, region)}</span>
                </div>
              )}
              {softwareTotal > 0 && (
                <div className="flex justify-between text-sm border-t border-line pt-2">
                  <span className="text-slate-600 font-medium">Software & IT</span>
                  <span className="font-bold text-slate-900">{formatCurrency(softwareTotal, region)}</span>
                </div>
              )}
            </div>
          )}

          {/* Net profit footer */}
          <div className={`rounded-xl p-4 border-2 print:bg-gray-100 print:border-gray-300 ${netProfit >= 0 ? 'bg-brand-50 border-brand-200' : 'bg-red-50 border-red-200'}`}>
            <div className="flex justify-between items-center">
              <span className="text-lg font-bold text-slate-900">Net Profit / (Loss)</span>
              <span className={`text-xl font-bold ${netProfit >= 0 ? 'text-income' : 'text-red-600'}`}>
                {formatCurrency(netProfit, region)}
              </span>
            </div>
          </div>

          <p className="text-[10px] leading-relaxed text-ink-soft font-medium text-center italic border-t border-line pt-4">
            LedgerJack organises your records. It doesn't give tax advice. Your records are kept on this device, and what goes in them is your responsibility.
          </p>
        </div>
      </div>
    </div>
  );
}
