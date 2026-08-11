import { describe, expect, it } from "vitest";
import { tokenize } from "./tokenize.js";

describe("tokenize", () => {
  it("keeps contractions and separates punctuation", () => {
    expect(tokenize("what's under the hood.").map((token) => token.source)).toEqual([
      "what's",
      "under",
      "the",
      "hood",
      ".",
    ]);
  });

  it("assigns stable ids and token kinds", () => {
    expect(tokenize("LLM APIs: 3.5")).toEqual([
      { id: 0, source: "LLM", kind: "word" },
      { id: 1, source: "APIs", kind: "word" },
      { id: 2, source: ":", kind: "punctuation" },
      { id: 3, source: "3.5", kind: "number" },
    ]);
  });
});
