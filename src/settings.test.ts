import { describe, expect, it } from "vitest";
import { applyEngineDefaults, DEFAULT_SETTINGS, readInitialSettings, serializeSavedSettings } from "./settings";
import type { EngineSettings, ServerStatus } from "./types";

const status: ServerStatus = {
  ollama: { available: true, models: ["configured-local"] },
  openaiConfigured: true,
  customEndpointsAllowed: true,
  defaults: {
    ollamaUrl: "http://127.0.0.1:11435",
    ollamaModel: "configured-local",
    openaiBaseUrl: "https://gateway.example.test/v1",
    openaiModel: "compatible-model",
  },
};

describe("engine settings initialization", () => {
  it("uses all configured desktop defaults on first use", () => {
    const initial = readInitialSettings(null);
    expect(applyEngineDefaults(initial.settings, status, initial.configuredFields))
      .toEqual({ ...DEFAULT_SETTINGS, ...status.defaults });
  });

  it("uses configured Web model defaults and server-owned addresses", () => {
    const initial = readInitialSettings(null);
    expect(applyEngineDefaults(initial.settings, { ...status, customEndpointsAllowed: false }, initial.configuredFields))
      .toEqual({ ...DEFAULT_SETTINGS, ...status.defaults });
  });

  it("preserves saved desktop choices and fills only missing fields", () => {
    const saved = { ollamaUrl: "http://saved-host.test:11434", openaiModel: "saved-model" };
    const initial = readInitialSettings(JSON.stringify(saved));
    expect(applyEngineDefaults(initial.settings, status, initial.configuredFields))
      .toEqual({ ...DEFAULT_SETTINGS, ...status.defaults, ...saved });
  });

  it("keeps explicitly saved built-in values rather than guessing user intent from equality", () => {
    const initial = readInitialSettings(JSON.stringify(DEFAULT_SETTINGS));
    expect(applyEngineDefaults(initial.settings, status, initial.configuredFields))
      .toEqual(DEFAULT_SETTINGS);
  });

  it("preserves a choice made while status is pending, even when it equals the built-in default", () => {
    const initial = readInitialSettings(null);
    const edited = { ...initial.settings, openaiModel: DEFAULT_SETTINGS.openaiModel };
    initial.configuredFields.add("openaiModel");
    expect(applyEngineDefaults(edited, status, initial.configuredFields))
      .toEqual({ ...DEFAULT_SETTINGS, ...status.defaults, openaiModel: DEFAULT_SETTINGS.openaiModel });
  });

  it("enforces Web addresses over saved or edited values without losing model choices", () => {
    const initial = readInitialSettings(JSON.stringify({
      ollamaUrl: "http://saved-host.test:11434",
      openaiBaseUrl: "https://saved-host.test/v1",
      openaiModel: "saved-model",
    }));
    const edited: EngineSettings = { ...initial.settings, ollamaUrl: "http://edited-host.test:11434" };
    initial.configuredFields.add("ollamaUrl");
    const next = applyEngineDefaults(edited, { ...status, customEndpointsAllowed: false }, initial.configuredFields);
    expect(next).toEqual({ ...DEFAULT_SETTINGS, ...status.defaults, openaiModel: "saved-model" });
  });

  it("ignores malformed saved data and never restores a stored API key", () => {
    const malformed = readInitialSettings("{invalid");
    expect(applyEngineDefaults(malformed.settings, status, malformed.configuredFields))
      .toEqual({ ...DEFAULT_SETTINGS, ...status.defaults });
    expect(readInitialSettings(JSON.stringify({ openaiApiKey: "synthetic-stored-key" })).settings.openaiApiKey)
      .toBe("");
  });

  it("does not turn pending or failed first-load fallback values into saved choices on reopening", () => {
    const initial = readInitialSettings(null);
    const saved = serializeSavedSettings(initial.settings, initial.configuredFields);
    expect(JSON.parse(saved)).toEqual({ provider: "auto" });
    const reopened = readInitialSettings(saved);
    expect(applyEngineDefaults(reopened.settings, status, reopened.configuredFields))
      .toEqual({ ...DEFAULT_SETTINGS, ...status.defaults });
  });

  it("continues following configured defaults after an automatic first-use value was persisted", () => {
    const initial = readInitialSettings(null);
    const applied = applyEngineDefaults(initial.settings, status, initial.configuredFields);
    const reopened = readInitialSettings(serializeSavedSettings(applied, initial.configuredFields));
    const changedStatus = { ...status, defaults: { ...status.defaults, openaiModel: "next-configured-model" } };
    expect(applyEngineDefaults(reopened.settings, changedStatus, reopened.configuredFields).openaiModel)
      .toBe("next-configured-model");
  });

  it("round-trips legacy saved choices and actual edits back to built-in values", () => {
    const initial = readInitialSettings(JSON.stringify({ ollamaModel: "legacy-choice" }));
    const edited = { ...initial.settings, provider: "openai" as const, openaiModel: DEFAULT_SETTINGS.openaiModel };
    initial.configuredFields.add("openaiModel");
    const reopened = readInitialSettings(serializeSavedSettings(edited, initial.configuredFields));
    expect(applyEngineDefaults(reopened.settings, status, reopened.configuredFields))
      .toEqual({ ...DEFAULT_SETTINGS, ...status.defaults, provider: "openai", ollamaModel: "legacy-choice", openaiModel: DEFAULT_SETTINGS.openaiModel });
  });

  it("never persists an entered API key or automatically applied endpoint fields", () => {
    const initial = readInitialSettings(JSON.stringify({ openaiModel: "saved-choice" }));
    const applied = applyEngineDefaults(initial.settings, { ...status, customEndpointsAllowed: false }, initial.configuredFields);
    const withKey = { ...applied, openaiApiKey: "synthetic-entered-key" };
    initial.configuredFields.add("openaiApiKey");
    expect(JSON.parse(serializeSavedSettings(withKey, initial.configuredFields)))
      .toEqual({ provider: "auto", openaiModel: "saved-choice" });
  });
});
