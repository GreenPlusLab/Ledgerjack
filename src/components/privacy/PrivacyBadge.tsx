/**
 * PrivacyBadge — the colour label used everywhere (waiter, Settings, each
 * receipt). Colour is never the only signal: every badge has an icon and words.
 */

import { Lock, Eye, AlertTriangle, ShieldAlert } from "lucide-react";
import { COLOUR_WORD, type Colour } from "../../lib/privacy/choices";

const STYLE: Record<Colour, { box: string; Icon: typeof Lock }> = {
  green: { box: "bg-emerald-50 text-emerald-900 border-emerald-300", Icon: Lock },
  amber: { box: "bg-amber-50 text-amber-900 border-amber-300", Icon: Eye },
  orange: { box: "bg-orange-50 text-orange-900 border-orange-400", Icon: AlertTriangle },
  red: { box: "bg-red-50 text-red-900 border-red-400", Icon: ShieldAlert },
};

export default function PrivacyBadge({ colour, text, small = false }: { colour: Colour; text?: string; small?: boolean }) {
  const { box, Icon } = STYLE[colour];
  return (
    <span
      className={`inline-flex items-center gap-1 border rounded-full font-semibold ${box} ${small ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]"}`}
    >
      <Icon className={small ? "w-3 h-3 shrink-0" : "w-3.5 h-3.5 shrink-0"} aria-hidden />
      <span>{text ?? COLOUR_WORD[colour]}</span>
    </span>
  );
}

/** The coloured dot used by the backup health light. */
export function ColourDot({ colour }: { colour: Colour }) {
  const c = { green: "bg-emerald-500", amber: "bg-amber-500", orange: "bg-orange-500", red: "bg-red-500" }[colour];
  return <span className={`inline-block w-3 h-3 rounded-full ${c} shrink-0`} aria-hidden />;
}
