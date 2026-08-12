# First Customer Validation

Do not treat downloads, compliments, or GitHub stars as proof that the product should be commercialized. The first validation cycle tests one claim:

> Chinese-speaking developers who read English technical material will repeatedly use contextual word-by-word explanations and some will pay for a convenient official macOS build.

## Fourteen-day test

1. Recruit 15 macOS users who read English technical material at least three times per week.
   Direct candidates to the public product page at `https://fly1d.github.io/wordwise/`. Applications use the Founder Beta GitHub Issue form so no separate customer database is required.
2. Watch the first five users install and complete one selection translation. Do not coach them unless they are blocked.
3. Give each user the same seven-day build and support channel.
4. On day seven, offer a founder build for a one-time CNY 39 payment. It includes the signed build when available, updates through the beta, and direct support. Model usage remains BYOK or local.
5. Record only the funnel below. Never collect selected text, document content, API keys, or full model requests.

## Funnel

| Step | Minimum signal |
| --- | ---: |
| Invited target users | 15 |
| Installed without developer help | 10 |
| Completed first contextual translation | 8 |
| Used on at least three separate days | 4 |
| Paid CNY 39 | 2 |

Two payments are enough to justify another product iteration, not enough to prove a scalable business. Zero payments means interview the users who completed three active days before changing price or adding features.

## Interview prompts

- Show the last English material that made you open a translation tool.
- What did you use before this build, and why was it insufficient?
- Which result in this build changed what you understood?
- What would make you uninstall it?
- Will you pay CNY 39 now for the founder build and beta updates?

Do not ask whether the idea is good or whether the user might pay later.

## Product guardrail

Automatic mode must never present the small fallback dictionary as contextual translation. If no model is configured, stop and help the user connect Ollama or a cloud API. Dictionary mode remains available only as an explicit word-lookup choice.
