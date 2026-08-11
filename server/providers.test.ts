import { describe, expect, it } from "vitest";
import { isOfficialOpenAIUrl } from "./providers.js";

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
