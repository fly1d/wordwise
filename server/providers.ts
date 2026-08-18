import { dictionaryTranslate } from "./dictionary.js";
import type {
  Segment,
  Token,
  TranslateOptions,
  TranslationPayload,
} from "./types.js";

const DEFAULT_OLLAMA_URL = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
const DEFAULT_OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen3:4b";
const DEFAULT_OPENAI_URL = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
const DEFAULT_OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-5-mini";

export const providerDefaults = {
  ollamaUrl: DEFAULT_OLLAMA_URL,
  ollamaModel: DEFAULT_OLLAMA_MODEL,
  openaiBaseUrl: DEFAULT_OPENAI_URL,
  openaiModel: DEFAULT_OPENAI_MODEL,
};

export function configuredApiKey(value: string | undefined) {
  const key = value?.trim();
  return key || undefined;
}

function parseBaseUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("模型服务地址无效");
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
    throw new Error("模型服务地址必须使用 HTTP(S)，且不能包含用户名或密码");
  }
  url.search = "";
  url.hash = "";
  return url;
}

function canonicalBaseUrl(value: string) {
  const url = parseBaseUrl(value);
  const path = url.pathname.split("/").filter(Boolean).join("/");
  url.pathname = path ? `/${path}` : "/";
  return url.toString();
}

function configuredBaseUrl(requested: string | undefined, configured: string, provider: string) {
  if (requested && canonicalBaseUrl(requested) !== canonicalBaseUrl(configured)) {
    throw new Error(`${provider} 服务地址必须由服务端环境变量配置`);
  }
  return parseBaseUrl(configured);
}

function endpointUrl(baseUrl: URL, endpoint: string) {
  const url = new URL(baseUrl);
  const path = [...url.pathname.split("/"), ...endpoint.split("/")]
    .filter(Boolean)
    .join("/");
  url.pathname = `/${path}`;
  return url;
}

export function isOfficialOpenAIUrl(value: string | URL) {
  const hostname = new URL(value).hostname.toLowerCase();
  return hostname === "openai.com" || hostname.endsWith(".openai.com");
}

async function fetchWithTimeout(url: URL, init?: RequestInit, timeoutMs = 60_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function getOllamaModels(): Promise<string[]> {
  try {
    const baseUrl = configuredBaseUrl(undefined, DEFAULT_OLLAMA_URL, "Ollama");
    const response = await fetchWithTimeout(endpointUrl(baseUrl, "api/tags"), undefined, 1_500);
    if (!response.ok) return [];
    const data = (await response.json()) as { models?: Array<{ name?: string }> };
    return (data.models ?? []).flatMap((model) => (model.name ? [model.name] : []));
  } catch {
    return [];
  }
}

function makePrompt(text: string, tokens: Token[]) {
  return `你是严谨的英中逐词翻译器。将下面英文按语境翻译成简体中文。

必须遵守：
1. 输出合法 JSON 对象，不要 Markdown，不要解释。
2. segments 必须与给定 tokens 一一对应，数量、id、source、kind 完全一致，不得合并、删除或新增。
3. 每个 translation 是该词在当前句子中的准确中文含义。冠词、助词等可说明“常不译”，但不能留空。
4. 固定短语仍逐词输出，可在相关词的 note 中说明整体短语含义。例如 under the hood 的 hood 可注明“短语整体指底层机制”。
5. fullTranslation 给出自然、准确、完整的整段中文译文。
6. JSON 结构严格为 {"fullTranslation":"...","segments":[{"id":0,"source":"...","kind":"word","translation":"...","note":"可选"}]}。

原文：
${text}

tokens：
${JSON.stringify(tokens)}`;
}

function parseJsonContent(content: string): unknown {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("模型没有返回 JSON 对象");
  return JSON.parse(trimmed.slice(start, end + 1));
}

export function normalizePayload(raw: unknown, tokens: Token[]): TranslationPayload {
  if (!raw || typeof raw !== "object") throw new Error("模型返回格式无效");
  const candidate = raw as { fullTranslation?: unknown; segments?: unknown };
  if (typeof candidate.fullTranslation !== "string" || !Array.isArray(candidate.segments)) {
    throw new Error("模型返回缺少译文或逐词结果");
  }
  if (!candidate.fullTranslation.trim()) throw new Error("模型返回的完整译文为空");
  if (candidate.segments.length !== tokens.length) {
    throw new Error(`模型返回了 ${candidate.segments.length} 个词元，预期 ${tokens.length} 个`);
  }

  const expectedById = new Map(tokens.map((token) => [token.id, token]));
  const byId = new Map<number, Record<string, unknown>>();
  for (const item of candidate.segments) {
    if (!item || typeof item !== "object") throw new Error("模型返回了无效的词元");

    const segment = item as Record<string, unknown>;
    if (!Number.isSafeInteger(segment.id) || (segment.id as number) < 0) {
      throw new Error("模型返回了无效的词元 ID");
    }

    const id = segment.id as number;
    if (byId.has(id)) throw new Error(`模型重复返回了词元 ${id}`);

    const expected = expectedById.get(id);
    if (!expected) throw new Error(`模型返回了未知词元 ${id}`);
    if (segment.source !== expected.source || segment.kind !== expected.kind) {
      throw new Error(`模型改写了词元 ${id}: ${expected.source}`);
    }
    if (typeof segment.translation !== "string" || !segment.translation.trim()) {
      throw new Error(`模型没有翻译词元 ${id}`);
    }

    byId.set(id, segment);
  }

  const segments: Segment[] = tokens.map((token) => {
    const translated = byId.get(token.id);
    if (!translated) {
      throw new Error(`模型漏掉了词元 ${token.id}: ${token.source}`);
    }
    const translation = translated.translation;
    if (typeof translation !== "string") {
      throw new Error(`模型没有翻译词元 ${token.id}`);
    }
    return {
      ...token,
      translation,
      ...(typeof translated.note === "string" && translated.note
        ? { note: translated.note }
        : {}),
    };
  });

  return { fullTranslation: candidate.fullTranslation.trim(), segments };
}

async function translateWithOllama(
  text: string,
  tokens: Token[],
  options: TranslateOptions,
): Promise<TranslationPayload> {
  const baseUrl = configuredBaseUrl(options.ollamaUrl, DEFAULT_OLLAMA_URL, "Ollama");
  const model = options.ollamaModel || DEFAULT_OLLAMA_MODEL;
  const response = await fetchWithTimeout(endpointUrl(baseUrl, "api/chat"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      format: "json",
      options: { temperature: 0.1 },
      messages: [{ role: "user", content: makePrompt(text, tokens) }],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Ollama 请求失败（${response.status}）：${detail.slice(0, 180)}`);
  }
  const body = (await response.json()) as { message?: { content?: string } };
  if (!body.message?.content) throw new Error("Ollama 没有返回内容");
  return normalizePayload(parseJsonContent(body.message.content), tokens);
}

async function translateWithOpenAI(
  text: string,
  tokens: Token[],
  options: TranslateOptions,
): Promise<TranslationPayload> {
  const apiKey = configuredApiKey(options.openaiApiKey) ?? configuredApiKey(process.env.OPENAI_API_KEY);
  if (!apiKey) throw new Error("尚未配置云端 API Key");

  const baseUrl = configuredBaseUrl(options.openaiBaseUrl, DEFAULT_OPENAI_URL, "云端模型");
  const model = options.openaiModel || DEFAULT_OPENAI_MODEL;
  const isOfficialOpenAI = isOfficialOpenAIUrl(baseUrl);
  const response = await fetchWithTimeout(endpointUrl(baseUrl, "chat/completions"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: makePrompt(text, tokens) }],
      ...(isOfficialOpenAI ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`云端模型请求失败（${response.status}）：${detail.slice(0, 180)}`);
  }
  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("云端模型没有返回内容");
  return normalizePayload(parseJsonContent(content), tokens);
}

export async function translate(
  text: string,
  tokens: Token[],
  options: TranslateOptions,
): Promise<{ payload: TranslationPayload; engine: string; warning?: string }> {
  if (options.provider === "dictionary") {
    return { payload: dictionaryTranslate(text, tokens), engine: "极速词典" };
  }
  if (options.provider === "ollama") {
    return {
      payload: await translateWithOllama(text, tokens, options),
      engine: `Ollama · ${options.ollamaModel || DEFAULT_OLLAMA_MODEL}`,
    };
  }
  if (options.provider === "openai") {
    return {
      payload: await translateWithOpenAI(text, tokens, options),
      engine: `云端 · ${options.openaiModel || DEFAULT_OPENAI_MODEL}`,
    };
  }

  const ollamaModels = await getOllamaModels();
  const requestedModel = options.ollamaModel || DEFAULT_OLLAMA_MODEL;
  const localModel = ollamaModels.includes(requestedModel) ? requestedModel : ollamaModels[0];

  if (localModel) {
    return {
      payload: await translateWithOllama(text, tokens, { ...options, ollamaModel: localModel }),
      engine: `Ollama · ${localModel}`,
    };
  }

  if (configuredApiKey(options.openaiApiKey) || configuredApiKey(process.env.OPENAI_API_KEY)) {
    return {
      payload: await translateWithOpenAI(text, tokens, options),
      engine: `云端 · ${options.openaiModel || DEFAULT_OPENAI_MODEL}`,
    };
  }

  throw new Error(
    "尚未配置语境翻译引擎。请连接 Ollama 或填写云端 API Key；只需逐词查义时，可明确选择极速词典。",
  );
}
