/**
 * WhatChanged — plain month-on-month comparison, worked out on the device.
 * No AI and nothing leaves the phone.
 */

import { TrendingUp, TrendingDown } from "lucide-react";
import type { Entry } from "../lib/bookscheck/entries";
import { compareLastTwoMonths, describeChange, describeDrivers, monthName } from "../lib/insights/compare";

export default function WhatChanged({ entries, today, money }: { entries: Entry[]; today: string; money: (c: number) => string }) {
  const cmp = compareLastTwoMonths(entries, today);
  if (!cmp.hasData) return null;

  const now = monthName(cmp.month);
  const before = monthName(cmp.previous);

  return (
    <div className="bg-white rounded-xl border border-line p-4 space-y-2">
      <h3 className="font-bold text-slate-900 text-sm">What changed: {now} against {before}</h3>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <Total label="Income" thisCents={cmp.income.thisCents} lastCents={cmp.income.lastCents} money={money} />
        <Total label="Expenses" thisCents={cmp.expenses.thisCents} lastCents={cmp.expenses.lastCents} money={money} />
      </div>
      {cmp.changes.length === 0 ? (
        <p className="text-xs text-ink-soft">No big movements in any category.</p>
      ) : (
        <ul className="space-y-1.5">
          {cmp.changes.map((c) => {
            const up = c.deltaCents > 0;
            const Icon = up ? TrendingUp : TrendingDown;
            const drivers = describeDrivers(c, money);
            return (
              <li key={`${c.kind}-${c.category}`} className="flex items-start gap-2 text-xs">
                <Icon className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${up === (c.kind === "income") ? "text-income" : "text-expense"}`} />
                <span className="text-slate-600">
                  {describeChange(c, cmp, money)}
                  {drivers && <span className="text-ink-soft"> {drivers}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-[10px] text-ink-soft">Complete months only, approved entries only. Worked out on this device, no AI.</p>
    </div>
  );
}

function Total({ label, thisCents, lastCents, money }: { label: string; thisCents: number; lastCents: number; money: (c: number) => string }) {
  const delta = thisCents - lastCents;
  return (
    <div className="bg-slate-50 rounded-lg p-2">
      <p className="text-ink-soft">{label}</p>
      <p className="font-bold text-slate-800">{money(thisCents)}</p>
      <p className="text-[10px] text-ink-soft">
        {delta === 0 ? "same as the month before" : `${delta > 0 ? "up" : "down"} ${money(Math.abs(delta))}`}
      </p>
    </div>
  );
}
