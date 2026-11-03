/**
 * Privacy choices — how receipts are read and where backups go.
 *
 * Plain data and pure functions only, so every screen (the waiter, Settings,
 * the label on each receipt) says exactly the same thing, and all of it is
 * tested. See docs/PRIVACY-CHOICES.md for the agreed design.
 *
 * Wording rules: no jargon ("your own AI account", not "API key"; "locked",
 * not "encrypted"); always state the price in money and in privacy; never push.
 */

export type Colour = "green" | "amber" | "orange" | "red";

/** How receipts are read. */
export type ReadingOption = "manual" | "ocr" | "ownKey" | "freeAI";

/** Where the locked backup is kept. */
export type BackupOption = "none" | "deviceOnly" | "computer" | "cloudShare" | "webdav";

export type PresetId = "fullyPrivate" | "privateSafe" | "easyFree" | "mostAccurate";

export interface PrivacyChoice {
  reading: ReadingOption;
  backup: BackupOption;
  /** Text recognition works offline; backups and downloads wait for Wi-Fi where possible. */
  dataSaver: boolean;
  /** Which ready-made choice this is, or "custom". */
  preset: PresetId | "custom";
  /** Version of the service terms the person saw when choosing (see terms.ts). */
  termsVersion: string;
  /** When the choice was made (ISO date). */
  chosenAt: string;
}

export interface OptionInfo {
  label: string;
  /** Where the data goes, in plain words. */
  where: string;
  cost: string;
  colour: Colour;
  /** Shown with the colour so colour is never the only signal. */
  word: string;
}

export const COLOUR_WORD: Record<Colour, string> = {
  green: "Stays with you",
  amber: "Read by a company, not used for training",
  orange: "May be used to train AI",
  red: "Risk of losing your books",
};

export const READING_OPTIONS: Record<ReadingOption, OptionInfo> = {
  manual: {
    label: "Type it in",
    where: "Nowhere. Nothing leaves your phone.",
    cost: "Free",
    colour: "green",
    word: COLOUR_WORD.green,
  },
  ocr: {
    label: "Text recognition on your phone",
    where: "Nowhere. The receipt is read on your phone.",
    cost: "Free",
    colour: "green",
    word: COLOUR_WORD.green,
  },
  ownKey: {
    label: "AI with your own account",
    where: "To the AI company you choose, which does not use it to train its AI.",
    cost: "A few pence per receipt, paid to the AI company",
    colour: "amber",
    word: COLOUR_WORD.amber,
  },
  freeAI: {
    label: "Free online AI",
    where: "To the AI company, which may use it to train its AI.",
    cost: "Free, with daily limits",
    colour: "orange",
    word: COLOUR_WORD.orange,
  },
};

export const BACKUP_OPTIONS: Record<BackupOption, OptionInfo> = {
  none: {
    label: "No backup",
    where: "Only on this phone. If you lose it, your books are gone.",
    cost: "Free",
    colour: "red",
    word: COLOUR_WORD.red,
  },
  deviceOnly: {
    label: "Locked file kept on this phone",
    where: "On this phone only, so it is lost if the phone is lost.",
    cost: "Free",
    colour: "amber",
    word: "Only on this phone",
  },
  computer: {
    label: "Locked file on your own computer or USB stick",
    where: "Somewhere only you keep. Only you can open it.",
    cost: "Free",
    colour: "green",
    word: COLOUR_WORD.green,
  },
  cloudShare: {
    label: "Locked file in your own Google Drive, OneDrive, iCloud or Dropbox",
    where: "In your own cloud, saved through your phone's Share menu. It is locked, so the company can't read it.",
    cost: "Free",
    colour: "green",
    word: COLOUR_WORD.green,
  },
  webdav: {
    label: "Locked file on your own server (WebDAV / Nextcloud)",
    where: "On a server you control. Only you can open it.",
    cost: "Free, if you have a server",
    colour: "green",
    word: COLOUR_WORD.green,
  },
};

export interface Preset {
  id: PresetId;
  name: string;
  reading: ReadingOption;
  backup: BackupOption;
  summary: string;
  goodToKnow: string;
}

export const PRESETS: Record<PresetId, Preset> = {
  fullyPrivate: {
    id: "fullyPrivate",
    name: "Fully private",
    reading: "ocr",
    backup: "computer",
    summary: "Your receipts are read on your phone and your locked backup goes to your own computer or USB stick. Nothing leaves your hands. It's free.",
    goodToKnow: "You'll need to save your backup by hand now and then. LedgerJack reminds you.",
  },
  privateSafe: {
    id: "privateSafe",
    name: "Private and safe",
    reading: "ocr",
    backup: "cloudShare",
    summary: "Your receipts are read on your phone, so they never leave it. Your backup is locked with your recovery key and kept in your own cloud, so only you can open it, and you won't lose your books if you lose your phone. It's free.",
    goodToKnow: "Reading is less accurate on crumpled receipts, so check each one before saving.",
  },
  easyFree: {
    id: "easyFree",
    name: "Easy and free",
    reading: "freeAI",
    backup: "cloudShare",
    summary: "A free online AI reads your receipts, and your locked backup is kept in your own cloud. It costs nothing.",
    goodToKnow: "The AI company may use your receipts to train its AI, and free accounts have daily limits.",
  },
  mostAccurate: {
    id: "mostAccurate",
    name: "Most accurate",
    reading: "ownKey",
    backup: "cloudShare",
    summary: "AI with your own account reads your receipts most accurately, and your locked backup is kept in your own cloud.",
    goodToKnow: "The AI company reads your receipts but doesn't use them for training. You pay it a few pence per receipt, and you can set a monthly limit.",
  },
};

export const PRESET_ORDER: PresetId[] = ["privateSafe", "fullyPrivate", "mostAccurate", "easyFree"];

/** The suggested starting point when the person hasn't answered anything. */
export const DEFAULT_PRESET: PresetId = "privateSafe";

/** Colour for "where do my receipts go". Backups are always locked, so this is the privacy colour. */
export function privacyColour(c: Pick<PrivacyChoice, "reading">): Colour {
  return READING_OPTIONS[c.reading].colour;
}

/** Colour for "what if I lose my phone". */
export function safetyColour(c: Pick<PrivacyChoice, "backup">): Colour {
  return BACKUP_OPTIONS[c.backup].colour;
}

const RANK: Record<Colour, number> = { green: 0, amber: 1, orange: 2, red: 3 };

/** The weakest of several colours: overall privacy is set by the weakest part, never an average. */
export function weakest(...colours: Colour[]): Colour {
  return colours.reduce((w, c) => (RANK[c] > RANK[w] ? c : w), "green" as Colour);
}

/** Which ready-made choice these settings match, if any. */
export function presetFor(reading: ReadingOption, backup: BackupOption): PresetId | "custom" {
  const hit = PRESET_ORDER.find((id) => PRESETS[id].reading === reading && PRESETS[id].backup === backup);
  return hit ?? "custom";
}

// ── The waiter ──────────────────────────────────────────────────────────────

export type PrivacyAnswer = "never" | "trusted" | "notFussed";
export type PayAnswer = "yes" | "no";
export type BackupAnswer = "cloud" | "computer" | "server" | "help";
export type DataAnswer = "limited" | "fine";

export interface WaiterAnswers {
  privacy: PrivacyAnswer;
  pay: PayAnswer;
  backup: BackupAnswer;
  data: DataAnswer;
}

export interface WaiterQuestion<K extends keyof WaiterAnswers> {
  key: K;
  question: string;
  choices: { value: WaiterAnswers[K]; label: string }[];
}

export const WAITER_QUESTIONS = [
  {
    key: "privacy",
    question: "How private do you want your receipts to be?",
    choices: [
      { value: "never", label: "Completely private. They never leave my phone." },
      { value: "trusted", label: "A trusted company may read them, if it saves me time." },
      { value: "notFussed", label: "I'm not fussed." },
    ],
  },
  {
    key: "pay",
    question: "Would you pay a little for the most accurate reading?",
    choices: [
      { value: "yes", label: "Yes, a few pence a receipt is fine." },
      { value: "no", label: "No, it has to be free." },
    ],
  },
  {
    key: "backup",
    question: "Where would you like your backup kept?",
    choices: [
      { value: "cloud", label: "In my Google Drive, OneDrive, iCloud or Dropbox" },
      { value: "computer", label: "On my own computer or a USB stick" },
      { value: "server", label: "On my own server (WebDAV / Nextcloud)" },
      { value: "help", label: "I'm not sure, help me choose" },
    ],
  },
  {
    key: "data",
    question: "Is your mobile data limited?",
    choices: [
      { value: "limited", label: "Yes, I try to save data" },
      { value: "fine", label: "No, it's fine" },
    ],
  },
] as const satisfies readonly WaiterQuestion<keyof WaiterAnswers>[];

export interface Recommendation {
  reading: ReadingOption;
  backup: BackupOption;
  dataSaver: boolean;
  preset: PresetId | "custom";
  /** Plain-words explanation of the recommendation. */
  summary: string;
  goodToKnow: string[];
}

/** Fixed rules, not AI: the same answers always give the same recommendation. */
export function recommend(a: WaiterAnswers): Recommendation {
  const goodToKnow: string[] = [];

  let reading: ReadingOption;
  if (a.privacy === "never") reading = "ocr";
  else if (a.pay === "yes") reading = "ownKey";
  else if (a.privacy === "notFussed") reading = "freeAI";
  else {
    // "A trusted company" but free: free AI services may train on receipts, so
    // keep reading on the phone and say honestly that the free option exists.
    reading = "ocr";
    goodToKnow.push("A free online AI is also available under Other options, but the company may use your receipts to train its AI.");
  }

  const backup: BackupOption =
    a.backup === "computer" ? "computer" : a.backup === "server" ? "webdav" : "cloudShare";
  if (a.backup === "help") {
    goodToKnow.push("Most phones already have Google Drive, OneDrive or iCloud. Your backup is locked, so the company can't read it.");
  }

  const dataSaver = a.data === "limited";
  if (dataSaver) goodToKnow.push("Data saver is on: text recognition works offline, and LedgerJack suggests backing up when you're on Wi-Fi.");

  const preset = presetFor(reading, backup);
  const summary = preset === "custom"
    ? `${READING_OPTIONS[reading].label}, with your backup as a ${BACKUP_OPTIONS[backup].label.toLowerCase()}.`
    : PRESETS[preset].summary;
  if (preset !== "custom") goodToKnow.unshift(PRESETS[preset].goodToKnow);
  else {
    if (reading === "ocr") goodToKnow.unshift(PRESETS.privateSafe.goodToKnow);
    if (reading === "ownKey") goodToKnow.unshift(PRESETS.mostAccurate.goodToKnow);
    if (reading === "freeAI") goodToKnow.unshift(PRESETS.easyFree.goodToKnow);
  }

  return { reading, backup, dataSaver, preset, summary, goodToKnow };
}

/** A choice ready to save, from a recommendation or a hand-made selection. */
export function makeChoice(
  reading: ReadingOption,
  backup: BackupOption,
  dataSaver: boolean,
  termsVersion: string,
  now = new Date(),
): PrivacyChoice {
  return { reading, backup, dataSaver, preset: presetFor(reading, backup), termsVersion, chosenAt: now.toISOString().slice(0, 10) };
}

/** Warnings to show before saving a hand-made choice. */
export function choiceWarnings(c: Pick<PrivacyChoice, "reading" | "backup">): string[] {
  const w: string[] = [];
  if (c.backup === "none") w.push("If you lose your phone, your books are gone.");
  if (c.backup === "deviceOnly") w.push("A backup kept only on this phone is lost with the phone. Save a copy somewhere else too.");
  if (c.reading === "freeAI") w.push("The AI company may use your receipts to train its AI.");
  return w;
}

/** Parse a stored choice, refusing anything that isn't a known shape. */
export function parseChoice(raw: string | null | undefined): PrivacyChoice | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<PrivacyChoice>;
    if (!o || typeof o !== "object") return null;
    if (!o.reading || !(o.reading in READING_OPTIONS)) return null;
    if (!o.backup || !(o.backup in BACKUP_OPTIONS)) return null;
    return {
      reading: o.reading,
      backup: o.backup,
      dataSaver: o.dataSaver === true,
      preset: presetFor(o.reading, o.backup),
      termsVersion: typeof o.termsVersion === "string" ? o.termsVersion : "",
      chosenAt: typeof o.chosenAt === "string" ? o.chosenAt : "",
    };
  } catch {
    return null;
  }
}
