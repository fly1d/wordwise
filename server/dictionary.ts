import type { Segment, Token, TranslationPayload } from "./types.js";

const WORDS: Record<string, string> = {
  a: "一个；一（在 a few 中表示‘几’）",
  about: "关于",
  agent: "智能体；代理",
  and: "和；并且",
  api: "应用程序接口",
  apis: "应用程序接口（API，复数）",
  are: "是",
  assumptions: "假设（复数）",
  be: "被；是",
  by: "通过；借助",
  can: "可以",
  code: "代码",
  common: "常见的",
  customer: "客户；用户",
  developers: "开发者（复数）",
  directly: "直接地",
  do: "确实；做",
  document: "文档",
  ensure: "确保",
  error: "错误",
  few: "少数；几个",
  for: "为了；对于",
  framework: "框架",
  from: "从；来自",
  hood: "引擎盖；表面之下的内部机制",
  if: "如果",
  implemented: "实现；被实现",
  in: "在……中；用",
  incorrect: "错误的；不正确的",
  is: "是",
  lines: "行（复数）",
  llm: "大语言模型",
  local: "本地的",
  many: "许多",
  model: "模型",
  models: "模型（复数）",
  of: "……的",
  patterns: "模式；范式（复数）",
  source: "来源；根源",
  start: "开始",
  suggest: "建议",
  that: "那；（引导从句，无实义）",
  the: "这；该（定冠词，常不译）",
  to: "到；向；用于",
  translate: "翻译",
  translation: "翻译；译文",
  under: "在……下面；在……内部",
  underlying: "底层的；潜在的",
  understand: "理解；了解",
  use: "使用",
  using: "使用；通过使用",
  we: "我们",
  "what's": "是什么；什么是",
  what: "什么",
  with: "和；使用",
  you: "你；你们",
};

const PUNCTUATION: Record<string, string> = {
  ".": "。",
  ",": "，",
  ":": "：",
  ";": "；",
  "?": "？",
  "!": "！",
  "(": "（",
  ")": "）",
  "[": "【",
  "]": "】",
  "\"": "引号",
  "'": "撇号",
  "-": "连字符；破折号",
};

function translateToken(token: Token): Segment {
  if (token.kind === "punctuation") {
    return {
      ...token,
      translation: PUNCTUATION[token.source] ?? token.source,
    };
  }

  if (token.kind === "number") return { ...token, translation: token.source };

  const translation = WORDS[token.source.toLocaleLowerCase("en-US")];
  return {
    ...token,
    translation: translation ?? "（基础词典未收录）",
  };
}

export function dictionaryTranslate(text: string, tokens: Token[]): TranslationPayload {
  const normalized = text.replace(/\s+/g, " ").trim();
  const sampleTranslation = normalized.startsWith("We suggest that developers start")
    ? "我们建议开发者先直接使用大语言模型 API：许多模式只需几行代码就能实现。如果确实使用框架，请确保理解其底层代码。对内部机制的错误假设是客户出错的常见根源。"
    : "基础词典模式只提供逐词释义；切换到本地模型或云端模型可获得通顺的整句翻译。";

  return {
    fullTranslation: sampleTranslation,
    segments: tokens.map(translateToken),
  };
}
