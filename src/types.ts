export type Provider = "auto" | "ollama" | "openai" | "dictionary";

export type Segment = {
  id: number;
  source: string;
  translation: string;
  kind: "word" | "number" | "punctuation";
  note?: string;
};

export type TranslationResult = {
  fullTranslation: string;
  segments: Segment[];
  engine: string;
  elapsedMs: number;
  warning?: string;
};

export type EngineSettings = {
  provider: Provider;
  ollamaUrl: string;
  ollamaModel: string;
  openaiBaseUrl: string;
  openaiModel: string;
  openaiApiKey: string;
};

export type ServerStatus = {
  ollama: {
    available: boolean;
    models: string[];
  };
  openaiConfigured: boolean;
  customEndpointsAllowed: boolean;
  defaults: {
    ollamaUrl: string;
    ollamaModel: string;
    openaiBaseUrl: string;
    openaiModel: string;
  };
};
