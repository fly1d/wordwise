import type { Token } from "./types.js";

const TOKEN_PATTERN = /\p{L}+(?:['’]\p{L}+)*|\p{N}+(?:[.,]\p{N}+)*|[^\s]/gu;

export function tokenize(text: string): Token[] {
  return Array.from(text.matchAll(TOKEN_PATTERN), (match, id) => {
    const source = match[0];
    let kind: Token["kind"] = "punctuation";

    if (/^\p{L}/u.test(source)) kind = "word";
    else if (/^\p{N}/u.test(source)) kind = "number";

    return { id, source, kind };
  });
}
