import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type FontScale = 1.0 | 1.15 | 1.3;

/**
 * App-wide accessibility / UX preferences. Language lives in i18n.tsx —
 * everything else lives here. Both providers persist via AsyncStorage and
 * load on mount.
 */
export type Settings = {
  fontScale: FontScale;
  readAloud: boolean;
  hapticsEnabled: boolean;
};

const DEFAULTS: Settings = {
  fontScale: 1.0,
  readAloud: false,
  hapticsEnabled: true,
};

const STORAGE_KEY = "techbuddy.settings.v1";

type SettingsContextValue = {
  settings: Settings;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  /** True once AsyncStorage has been read at least once. */
  ready: boolean;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

function isFontScale(v: unknown): v is FontScale {
  return v === 1.0 || v === 1.15 || v === 1.3;
}

function sanitize(raw: unknown): Settings {
  if (!raw || typeof raw !== "object") return DEFAULTS;
  const r = raw as Partial<Record<keyof Settings, unknown>>;
  return {
    fontScale: isFontScale(r.fontScale) ? r.fontScale : DEFAULTS.fontScale,
    readAloud:
      typeof r.readAloud === "boolean" ? r.readAloud : DEFAULTS.readAloud,
    hapticsEnabled:
      typeof r.hapticsEnabled === "boolean"
        ? r.hapticsEnabled
        : DEFAULTS.hapticsEnabled,
  };
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [ready, setReady] = useState(false);

  // Hydrate from disk on mount.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        try {
          setSettings(sanitize(JSON.parse(raw)));
        } catch {
          /* corrupt storage — fall back to defaults */
        }
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const setSetting = useCallback(
    <K extends keyof Settings>(key: K, value: Settings[K]) => {
      setSettings((prev) => {
        const next = { ...prev, [key]: value };
        // Fire-and-forget persistence; we don't gate state on it.
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    []
  );

  const value = useMemo(
    () => ({ settings, setSetting, ready }),
    [settings, setSetting, ready]
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside <SettingsProvider>");
  return ctx;
}

/** Convenience selector when a component only cares about font scale. */
export function useFontScale(): FontScale {
  return useSettings().settings.fontScale;
}
