export type Provider = "auto" | "ollama" | "openai" | "dictionary";

export type Token = {
  id: number;
  source: string;
  kind: "word" | "number" | "punctuation";
};

export type Segment = Token & {
  translation: string;
  note?: string;
};

export type TranslateOptions = {
  provider: Provider;
  ollamaUrl?: string;
  ollamaModel?: string;
  openaiBaseUrl?: string;
  openaiModel?: string;
  openaiApiKey?: string;
};

export type TranslationPayload = {
  fullTranslation: string;
  segments: Segment[];
};
