import type { EngineSettings, ServerStatus } from "./types";

export const DEFAULT_SETTINGS: EngineSettings = {
  provider: "auto",
  ollamaUrl: "http://127.0.0.1:11434",
  ollamaModel: "qwen3:4b",
  openaiBaseUrl: "https://api.openai.com/v1",
  openaiModel: "gpt-5-mini",
  openaiApiKey: "",
};

const DEFAULT_FIELDS = ["ollamaUrl", "ollamaModel", "openaiBaseUrl", "openaiModel"] as const;

export function readInitialSettings(savedValue: string | null) {
  try {
    const saved = JSON.parse(savedValue ?? "{}") as Partial<EngineSettings>;
    return {
      settings: { ...DEFAULT_SETTINGS, ...saved, openaiApiKey: "" },
      configuredFields: new Set<keyof EngineSettings>(
        DEFAULT_FIELDS.filter((field) => Object.prototype.hasOwnProperty.call(saved, field)),
      ),
    };
  } catch {
    return { settings: { ...DEFAULT_SETTINGS }, configuredFields: new Set<keyof EngineSettings>() };
  }
}

export function applyEngineDefaults(
  current: EngineSettings,
  status: ServerStatus,
  configuredFields: ReadonlySet<keyof EngineSettings>,
): EngineSettings {
  const next = { ...current };
  for (const field of DEFAULT_FIELDS) {
    const serverOwned = !status.customEndpointsAllowed
      && (field === "ollamaUrl" || field === "openaiBaseUrl");
    if (serverOwned || !configuredFields.has(field)) {
      next[field] = status.defaults[field];
    }
  }
  return next;
}

export function serializeSavedSettings(
  settings: EngineSettings,
  configuredFields: ReadonlySet<keyof EngineSettings>,
) {
  // Automatic fallback/status values must remain defaults after reopening, not user overrides.
  const saved: Partial<EngineSettings> = { provider: settings.provider };
  for (const field of DEFAULT_FIELDS) {
    if (configuredFields.has(field)) saved[field] = settings[field];
  }
  return JSON.stringify(saved);
}
