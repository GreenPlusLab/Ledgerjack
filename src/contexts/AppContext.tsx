// Combines security fix #2 (API key encrypted at rest) with credit system removal.
// creditBalance, deductCredits, addCredits, and DBCreditPurchase references are gone.

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import { type TaxRegion, TAX_REGIONS, detectRegionFromBrowser } from '../lib/regions';
import { db } from '../lib/db';

export type AIModelPreference = 'smart' | 'economy' | 'quality';

// Injected crypto helpers — optional so the context still works before vault unlock
export interface CryptoHelpers {
  encrypt: (plaintext: string) => Promise<{ iv: Uint8Array; ciphertext: Uint8Array }>;
  decrypt: (iv: Uint8Array, ciphertext: Uint8Array) => Promise<string>;
}

interface AppSettings {
  region: TaxRegion;
  apiKey: string;
  lastBackupTimestamp: number | null;
  exportAuditLog: boolean;
  exportAuditEntries: { date: string; type: string }[];
  aiModel: AIModelPreference;
}

interface AppContextValue extends AppSettings {
  setRegion: (region: TaxRegion) => void;
  setApiKey: (key: string) => void;
  updateBackupTimestamp: () => void;
  toggleExportAuditLog: () => void;
  addExportAuditEntry: (type: string) => void;
  setAiModel: (model: AIModelPreference) => void;
  isConfigured: boolean;
  reloadApiKey: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

const DEFAULT_SETTINGS: AppSettings = {
  region:              detectRegionFromBrowser(),
  apiKey:              '',
  lastBackupTimestamp: null,
  exportAuditLog:      false,
  exportAuditEntries:  [],
  aiModel:             'smart',
};

interface AppProviderProps {
  children: ReactNode;
  crypto?: CryptoHelpers;
}

export function AppProvider({ children, crypto }: AppProviderProps) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  // ── Helpers ───────────────────────────────────────────────────────────────────

  const persistSetting = useCallback(async (key: string, value: string) => {
    await db.settings.put({ key, value });
  }, []);

  // ── API key load/save (encrypted) ─────────────────────────────────────────────

  const loadApiKey = useCallback(async (): Promise<string> => {
    if (!crypto) return '';

    // Migrate legacy plaintext key if present
    const legacy = await db.settings.get('api_key');
    if (legacy?.value) {
      const { iv, ciphertext } = await crypto.encrypt(legacy.value);
      await db.settings.put({ key: 'api_key_iv', value: btoa(String.fromCharCode(...iv)) });
      await db.settings.put({ key: 'api_key_ct', value: btoa(String.fromCharCode(...ciphertext)) });
      await db.settings.delete('api_key');
      return legacy.value;
    }

    const ivRow = await db.settings.get('api_key_iv');
    const ctRow = await db.settings.get('api_key_ct');
    if (!ivRow || !ctRow) return '';

    try {
      const iv         = Uint8Array.from(atob(ivRow.value), (c) => c.charCodeAt(0));
      const ciphertext = Uint8Array.from(atob(ctRow.value), (c) => c.charCodeAt(0));
      return await crypto.decrypt(iv, ciphertext);
    } catch {
      console.error('[AppContext] Failed to decrypt API key — vault may be locked.');
      return '';
    }
  }, [crypto]);

  const saveApiKey = useCallback(async (key: string) => {
    if (!key) {
      await db.settings.delete('api_key_iv');
      await db.settings.delete('api_key_ct');
      await db.settings.delete('api_key');
      return;
    }
    if (!crypto) {
      console.error('[AppContext] Cannot encrypt API key — vault is locked.');
      return;
    }
    const { iv, ciphertext } = await crypto.encrypt(key);
    await db.settings.put({ key: 'api_key_iv', value: btoa(String.fromCharCode(...iv)) });
    await db.settings.put({ key: 'api_key_ct', value: btoa(String.fromCharCode(...ciphertext)) });
    await db.settings.delete('api_key');
  }, [crypto]);

  // ── Initial load ──────────────────────────────────────────────────────────────

  const reloadApiKey = useCallback(async () => {
    const key = await loadApiKey();
    setSettings((prev) => ({ ...prev, apiKey: key }));
  }, [loadApiKey]);

  useEffect(() => {
    (async () => {
      const savedRegion       = await db.settings.get('region');
      const savedAuditLog     = await db.settings.get('export_audit_log');
      const savedAuditEntries = await db.settings.get('export_audit_entries');
      const savedAiModel      = await db.settings.get('ai_model');
      const savedLastBackup   = await db.settings.get('last_backup_timestamp');
      const apiKey            = await loadApiKey();

      setSettings((prev) => ({
        ...prev,
        region:             (savedRegion?.value as TaxRegion) || detectRegionFromBrowser(),
        apiKey,
        exportAuditLog:     savedAuditLog?.value === 'true',
        exportAuditEntries: savedAuditEntries
          ? JSON.parse(savedAuditEntries.value)
          : prev.exportAuditEntries,
        aiModel: (savedAiModel?.value as AIModelPreference) || prev.aiModel,
        lastBackupTimestamp: savedLastBackup ? (Number.parseInt(savedLastBackup.value, 10) || null) : prev.lastBackupTimestamp,
      }));
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crypto]);

  // ── Setters ───────────────────────────────────────────────────────────────────

  const setRegion = useCallback((region: TaxRegion) => {
    setSettings((prev) => ({ ...prev, region }));
    persistSetting('region', region);
  }, [persistSetting]);

  const setApiKey = useCallback((key: string) => {
    setSettings((prev) => ({ ...prev, apiKey: key }));
    saveApiKey(key);
  }, [saveApiKey]);

  const updateBackupTimestamp = useCallback(() => {
    const now = Date.now();
    setSettings((prev) => ({ ...prev, lastBackupTimestamp: now }));
    db.settings.put({ key: 'last_backup_timestamp', value: now.toString() });
  }, []);

  const toggleExportAuditLog = useCallback(() => {
    setSettings((prev) => {
      const newVal = !prev.exportAuditLog;
      persistSetting('export_audit_log', newVal.toString());
      return { ...prev, exportAuditLog: newVal };
    });
  }, [persistSetting]);

  const addExportAuditEntry = useCallback((type: string) => {
    setSettings((prev) => {
      const entries = [
        ...prev.exportAuditEntries,
        { date: new Date().toISOString(), type },
      ];
      persistSetting('export_audit_entries', JSON.stringify(entries));
      return { ...prev, exportAuditEntries: entries };
    });
  }, [persistSetting]);

  const setAiModel = useCallback((model: AIModelPreference) => {
    setSettings((prev) => ({ ...prev, aiModel: model }));
    persistSetting('ai_model', model);
  }, [persistSetting]);

  return (
    <AppContext.Provider
      value={{
        ...settings,
        setRegion,
        setApiKey,
        updateBackupTimestamp,
        toggleExportAuditLog,
        addExportAuditEntry,
        setAiModel,
        isConfigured: !!settings.region,
        reloadApiKey,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

export function useRegionConfig() {
  const { region } = useApp();
  return TAX_REGIONS[region] ?? TAX_REGIONS['generic'];
}
