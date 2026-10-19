import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, TrendingDown, FileText, Clock, ArrowUpRight, ArrowDownRight, Flame, BarChart2, Lightbulb, Search } from 'lucide-react';
import { db, loadWithSplits, type TransactionWithSplits } from '../lib/db';
import { useApp } from '../contexts/AppContext';
import { formatCurrency } from '../lib/currency';
import { getCurrentFiscalYear, getFiscalYearRange } from '../lib/regions';
import Disclaimer from '../components/Disclaimer';
import BackupReminder from '../components/BackupReminder';
import QuickEntry from '../components/QuickEntry';
import ThisMonthCard from '../components/ThisMonthCard';
import BudgetHomeCard from '../components/BudgetHomeCard';

interface DashboardProps {
  onNavigate: (view: string) => void;
}

interface RunwayData {
  avgMonthlyBurn: number;
  avgMonthlyIncome: number;
  cashBalance: number;
  runwayMonths: number | null;
}

function computeRunway(txns: TransactionWithSplits[]): RunwayData {
  // Group by month to compute averages
  const monthlyExpenses: Record<string, number> = {};
  const monthlyIncome: Record<string, number> = {};
  let cashBalance = 0;

  txns.forEach((tx) => {
    const monthKey = tx.date.slice(0, 7); // YYYY-MM
    tx.splits.forEach((split) => {
      if (split.account_id.startsWith('Income') && split.amount < 0) {
        monthlyIncome[monthKey] = (monthlyIncome[monthKey] || 0) + Math.abs(split.amount);
        cashBalance += Math.abs(split.amount);
      }
      if (split.account_id.startsWith('Expenses') && split.amount > 0) {
        monthlyExpenses[monthKey] = (monthlyExpenses[monthKey] || 0) + split.amount;
        cashBalance -= split.amount;
      }
    });
  });

  const expenseMonths = Object.values(monthlyExpenses);
  const incomeMonths = Object.values(monthlyIncome);

  const avgMonthlyBurn = expenseMonths.length
    ? expenseMonths.reduce((a, b) => a + b, 0) / expenseMonths.length
    : 0;
  const avgMonthlyIncome = incomeMonths.length
    ? incomeMonths.reduce((a, b) => a + b, 0) / incomeMonths.length
    : 0;

  const runwayMonths =
    cashBalance > 0 && avgMonthlyBurn > 0
      ? Math.floor(cashBalance / avgMonthlyBurn)
      : null;

  return { avgMonthlyBurn, avgMonthlyIncome, cashBalance, runwayMonths };
}

function RunwayGauge({ runway }: { runway: RunwayData }) {
  const { avgMonthlyBurn, avgMonthlyIncome, cashBalance, runwayMonths } = runway;
  const { region } = useApp();

  const monthlyNet = avgMonthlyIncome - avgMonthlyBurn;
  const isHealthy = monthlyNet >= 0;
  const runwayDisplay =
    runwayMonths === null
      ? '—'
      : runwayMonths >= 24
      ? '24+ mo'
      : `${runwayMonths} mo`;

  const gaugePercent =
    runwayMonths === null ? 0 : Math.min(100, (runwayMonths / 24) * 100);

  const gaugeColor =
    runwayMonths === null
      ? 'bg-slate-300'
      : runwayMonths >= 6
      ? 'bg-emerald-500'
      : runwayMonths >= 3
      ? 'bg-amber-400'
      : 'bg-red-500';

  return (
    <div className="bg-white rounded-xl border border-line p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Flame className="w-5 h-5 text-orange-500" />
          <h3 className="font-bold text-slate-900 text-sm">Burn Rate & Runway</h3>
        </div>
        <span
          className={`text-xs font-bold px-2 py-0.5 rounded-full ${
            isHealthy ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
          }`}
        >
          {isHealthy ? 'Profitable' : 'Burning'}
        </span>
      </div>

      {/* Runway gauge bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-center">
          <span className="text-xs text-slate-500 font-medium">Estimated runway</span>
          <span className="text-sm font-bold text-slate-900">{runwayDisplay}</span>
        </div>
        <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${gaugeColor}`}
            style={{ width: `${gaugePercent}%` }}
          />
        </div>
        <p className="text-[10px] text-ink-soft font-medium">Based on current cash balance ÷ avg monthly expenses</p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-slate-50 rounded-lg p-2.5 border border-line">
          <p className="text-[10px] font-bold text-ink-soft uppercase tracking-wider">Avg Burn</p>
          <p className="text-sm font-bold text-red-600 mt-0.5">{formatCurrency(avgMonthlyBurn, region)}</p>
          <p className="text-[9px] text-ink-soft">/ month</p>
        </div>
        <div className="bg-slate-50 rounded-lg p-2.5 border border-line">
          <p className="text-[10px] font-bold text-ink-soft uppercase tracking-wider">Avg Revenue</p>
          <p className="text-sm font-bold text-income mt-0.5">{formatCurrency(avgMonthlyIncome, region)}</p>
          <p className="text-[9px] text-ink-soft">/ month</p>
        </div>
        <div className="bg-slate-50 rounded-lg p-2.5 border border-line">
          <p className="text-[10px] font-bold text-ink-soft uppercase tracking-wider">Net Cash</p>
          <p className={`text-sm font-bold mt-0.5 ${cashBalance >= 0 ? 'text-slate-900' : 'text-red-600'}`}>
            {formatCurrency(Math.abs(cashBalance), region)}
          </p>
          <p className="text-[9px] text-ink-soft">{cashBalance >= 0 ? 'surplus' : 'deficit'}</p>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard({ onNavigate }: DashboardProps) {
  const [recentTxns, setRecentTxns] = useState<TransactionWithSplits[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [totalIncome, setTotalIncome] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [runway, setRunway] = useState<RunwayData | null>(null);
  const { region } = useApp();

  const loadDashboard = useCallback(async () => {
    const fy = getCurrentFiscalYear(region);
    const { start, end } = getFiscalYearRange(region, fy);

    const allTxns = await db.transactions
      .where('date')
      .between(start, end, true, true)
      .toArray();

    const approved = allTxns.filter((tx) => !tx.pending_review);
    const pending  = allTxns.filter((tx) => tx.pending_review);
    setPendingCount(pending.length);

    const approvedWithSplits = await loadWithSplits(approved);

    let income = 0;
    let expenses = 0;

    approvedWithSplits.forEach((tx) => {
      tx.splits.forEach((split) => {
        if (split.account_id.startsWith('Income') && split.amount < 0) {
          income += Math.abs(split.amount);
        }
        if (split.account_id.startsWith('Expenses') && split.amount > 0) {
          expenses += split.amount;
        }
      });
    });

    setTotalIncome(income);
    setTotalExpenses(expenses);
    setRunway(computeRunway(approvedWithSplits));

    const recent = approvedWithSplits
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5);
    setRecentTxns(recent);
  }, [region]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const profit = totalIncome - totalExpenses;

  return (
    <div className="space-y-4 pb-24">
      <BackupReminder onSetup={() => onNavigate('cloud-backup')} />

      <QuickEntry />
      <ThisMonthCard />
      <BudgetHomeCard onNavigate={onNavigate} />

      <button
        onClick={() => onNavigate('bulk-receipts')}
        className="w-full bg-white rounded-xl border border-line p-4 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-brand-600" />
          <div>
            <h3 className="font-bold text-slate-900">Bulk receipts</h3>
            <p className="text-xs text-slate-500">Upload several receipt photos to scan at once</p>
          </div>
        </div>
        <span className="text-ink-soft text-xl leading-none">›</span>
      </button>

      <button
        onClick={() => onNavigate('invoices')}
        className="w-full bg-white rounded-xl border-2 border-brand-200 p-4 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-brand-600" />
          <div>
            <h3 className="font-bold text-slate-900">Invoices</h3>
            <p className="text-xs text-slate-500">Create and send invoices, save as PDF</p>
          </div>
        </div>
        <span className="text-ink-soft text-xl leading-none">›</span>
      </button>

      <button
        onClick={() => onNavigate('insights')}
        className="w-full bg-white rounded-xl border-2 border-brand-200 p-4 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-brand-600" />
          <div>
            <h3 className="font-bold text-slate-900">Insights</h3>
            <p className="text-xs text-slate-500">Understand your numbers in plain English</p>
          </div>
        </div>
        <span className="text-ink-soft text-xl leading-none">›</span>
      </button>

      <button
        onClick={() => onNavigate('books-check')}
        className="w-full bg-white rounded-xl border-2 border-brand-200 p-4 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <Search className="w-5 h-5 text-brand-600" />
          <div>
            <h3 className="font-bold text-slate-900">Check my books</h3>
            <p className="text-xs text-slate-500">Spot duplicates, typos and gaps before year end</p>
          </div>
        </div>
        <span className="text-ink-soft text-xl leading-none">›</span>
      </button>

      <div className="bg-gradient-to-br from-brand-600 to-brand-700 rounded-2xl p-5 text-white shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-brand-100 text-xs font-bold uppercase tracking-widest">Net Profit</p>
            <p className="text-3xl font-bold mt-0.5 tracking-tight">{formatCurrency(profit, region)}</p>
          </div>
          <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
            {profit >= 0 ? (
              <TrendingUp className="w-6 h-6 text-white" />
            ) : (
              <TrendingDown className="w-6 h-6 text-white" />
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white/15 rounded-xl p-3 border border-white/20">
            <p className="text-brand-100 text-xs font-semibold uppercase">Income</p>
            <p className="font-bold text-lg flex items-center gap-1 mt-0.5">
              <ArrowUpRight className="w-4 h-4" />
              {formatCurrency(totalIncome, region)}
            </p>
          </div>
          <div className="bg-white/15 rounded-xl p-3 border border-white/20">
            <p className="text-brand-100 text-xs font-semibold uppercase">Expenses</p>
            <p className="font-bold text-lg flex items-center gap-1 mt-0.5">
              <ArrowDownRight className="w-4 h-4" />
              {formatCurrency(totalExpenses, region)}
            </p>
          </div>
        </div>
      </div>

      {pendingCount > 0 && (
        <button
          onClick={() => onNavigate('pending')}
          className="w-full bg-brand-50 border-2 border-brand-300 rounded-xl p-4 flex items-center gap-3 hover:bg-brand-100 transition-colors"
        >
          <div className="w-10 h-10 bg-brand-200 rounded-lg flex items-center justify-center">
            <Clock className="w-5 h-5 text-brand-700" />
          </div>
          <div className="flex-1 text-left">
            <p className="font-bold text-brand-900">{pendingCount} Pending Review</p>
            <p className="text-sm text-brand-600 font-medium">Tap to review and approve</p>
          </div>
        </button>
      )}

      {/* Burn Rate Widget */}
      {runway && (runway.avgMonthlyBurn > 0 || runway.avgMonthlyIncome > 0) && (
        <RunwayGauge runway={runway} />
      )}

      <Disclaimer />

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Recent Transactions</h3>
          <button
            onClick={() => onNavigate('reports')}
            className="flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700"
          >
            <BarChart2 className="w-3.5 h-3.5" /> Full Report
          </button>
        </div>
        {recentTxns.length === 0 ? (
          <div className="bg-white rounded-xl border border-line p-6 text-center">
            <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-500 font-medium">No transactions yet</p>
            <button
              onClick={() => onNavigate('new-transaction')}
              className="mt-3 text-brand-600 text-sm font-bold hover:text-brand-700"
            >
              Add your first entry
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {recentTxns.map((tx) => {
              const debitSplit = tx.splits.find((s) => s.amount > 0);
              const isExpense = debitSplit?.account_id.startsWith('Expenses');
              return (
                <div
                  key={tx.id}
                  className="bg-white rounded-xl border border-line p-3 flex items-center gap-3 hover:border-slate-300 transition-colors"
                >
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center border ${
                      isExpense ? 'bg-red-50 border-red-200 text-red-600' : 'bg-emerald-50 border-emerald-200 text-income'
                    }`}
                  >
                    {isExpense ? (
                      <ArrowDownRight className="w-4 h-4" />
                    ) : (
                      <ArrowUpRight className="w-4 h-4" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{tx.description}</p>
                    <p className="text-xs text-ink-soft font-medium">
                      {tx.date} &middot; {debitSplit?.account_id || ''}
                    </p>
                  </div>
                  <span
                    className={`text-sm font-bold ${
                      isExpense ? 'text-red-600' : 'text-income'
                    }`}
                  >
                    {isExpense ? '-' : '+'}{formatCurrency(debitSplit?.amount || 0, region)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
