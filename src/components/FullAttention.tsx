/**
 * FullAttention: shown wherever a receipt has been read for the person (by AI
 * or by text recognition on the phone). Readings can be wrong even when
 * nothing is flagged, so the person checks every field against the receipt.
 */

import { Eye } from "lucide-react";

export const FULL_ATTENTION_TITLE = "Full attention required";
export const FULL_ATTENTION_TEXT =
  "AI and text recognition can misread receipts, even when nothing is flagged. Check every field against the receipt before you save. What goes into your books, and from there to HMRC, is your responsibility.";

export default function FullAttention({ compact = false }: { compact?: boolean }) {
  return (
    <div role="note" className="bg-amber-50 border border-amber-300 rounded-lg p-2.5 flex gap-2">
      <Eye className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
      <div>
        <p className="text-xs font-bold text-amber-900">{FULL_ATTENTION_TITLE}</p>
        {!compact && <p className="text-[11px] text-amber-900 leading-relaxed mt-0.5">{FULL_ATTENTION_TEXT}</p>}
        {compact && <p className="text-[11px] text-amber-900 leading-relaxed mt-0.5">Check every field against the receipt before you approve it.</p>}
      </div>
    </div>
  );
}

/** A list of the specific things that look wrong, each in plain words. */
export function ReadingIssues({ messages }: { messages: string[] }) {
  if (messages.length === 0) return null;
  return (
    <ul className="space-y-1" aria-label="Things to check">
      {messages.map((m) => (
        <li key={m} className="text-[11px] text-amber-900 leading-relaxed flex gap-1.5">
          <span aria-hidden="true" className="font-bold">!</span>
          <span>{m}</span>
        </li>
      ))}
    </ul>
  );
}
