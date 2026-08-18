import { describe, expect, it } from "vitest";
import { isOfficialOpenAIUrl, normalizePayload } from "./providers.js";
import { tokenize } from "./tokenize.js";

describe("OpenAI endpoint classification", () => {
  it("accepts only OpenAI's domain and its subdomains", () => {
    expect(isOfficialOpenAIUrl("https://openai.com/v1")).toBe(true);
    expect(isOfficialOpenAIUrl("https://api.openai.com/v1")).toBe(true);
    expect(isOfficialOpenAIUrl("https://OPENAI.COM/v1")).toBe(true);
  });

  it("rejects hostnames that only contain the OpenAI domain", () => {
    expect(isOfficialOpenAIUrl("https://openai.com.example.test/v1")).toBe(false);
    expect(isOfficialOpenAIUrl("https://notopenai.com/v1")).toBe(false);
  });
});

describe("model output normalization", () => {
  const tokens = tokenize("LLM APIs");
  const validPayload = {
    fullTranslation: "大语言模型 API",
    segments: [
      { id: 0, source: "LLM", kind: "word", translation: "大语言模型" },
      { id: 1, source: "APIs", kind: "word", translation: "应用程序接口" },
    ],
  };

  it("reconstructs successful output from trusted tokens", () => {
    expect(normalizePayload(validPayload, tokens)).toEqual(validPayload);
  });

  it("rejects missing, extra, duplicate, or unknown token ids", () => {
    expect(() =>
      normalizePayload({ ...validPayload, segments: validPayload.segments.slice(0, 1) }, tokens),
    ).toThrow("预期 2 个");
    expect(() =>
      normalizePayload(
        { ...validPayload, segments: [...validPayload.segments, validPayload.segments[1]] },
        tokens,
      ),
    ).toThrow("预期 2 个");
    expect(() =>
      normalizePayload(
        { ...validPayload, segments: [validPayload.segments[0], validPayload.segments[0]] },
        tokens,
      ),
    ).toThrow("重复返回了词元 0");
    expect(() =>
      normalizePayload(
        {
          ...validPayload,
          segments: [validPayload.segments[0], { ...validPayload.segments[1], id: 2 }],
        },
        tokens,
      ),
    ).toThrow("未知词元 2");
  });

  it("rejects rewritten token metadata and blank translations", () => {
    expect(() =>
      normalizePayload(
        {
          ...validPayload,
          segments: [validPayload.segments[0], { ...validPayload.segments[1], source: "API" }],
        },
        tokens,
      ),
    ).toThrow("改写了词元 1");
    expect(() =>
      normalizePayload(
        {
          ...validPayload,
          segments: [validPayload.segments[0], { ...validPayload.segments[1], translation: " " }],
        },
        tokens,
      ),
    ).toThrow("没有翻译词元 1");
  });
});
