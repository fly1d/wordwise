# First Customer Validation

Do not treat downloads, compliments, or GitHub stars as proof that the product should be commercialized. The first validation cycle tests one claim:

> Chinese-speaking developers who read English technical material will repeatedly use contextual word-by-word explanations and some will pay for a convenient official macOS build.

## Fourteen-day test

1. Recruit 15 macOS users who read English technical material at least three times per week.
   Direct candidates to the public product page at `https://fly1d.github.io/wordwise/`. Applications use the private Founder Beta form at `https://tally.so/r/PdZ9ze`. Product-page links default to the hidden `source=product-page` field; campaign landing links use a lowercase source such as `?source=dev` or `?source=hashnode`, which the page carries into Tally. The hidden `language=zh` or `language=en` value records the landing-page language only; the visible Tally form itself is bilingual.
2. Watch the first five users install and complete one selection translation. Do not coach them unless they are blocked.
3. Give each user the same seven-day build and support channel.
4. On day seven, offer a founder build for a one-time CNY 39 payment. It includes the signed build when available, updates through the beta, and direct support. Model usage remains BYOK or local.
5. Record only the funnel below. Never collect selected text, document content, API keys, or full model requests.

## Funnel

Record the hidden `source` value in each Founder Beta application. The landing page accepts only lowercase letters, digits, and hyphens in a source value, with a maximum length of 32 characters; invalid values fall back to `product-page`. Use the hidden `language` value only to distinguish the Chinese and English product-page funnels. Evaluate each public channel from the top of the funnel instead of treating all missing demand as a product defect.

| Acquisition step | Evidence |
| --- | --- |
| Channel reach | Readers or views reported by the publishing channel |
| Product interest | Product-page visits or a direct application attributed to that channel |
| Qualified application | Applicant meets the reading-frequency and macOS criteria |
| First use | Applicant installs and completes a contextual translation |

Do not optimize the landing page when a channel produced no readers. Do not expand distribution claims when readers reached the page but nobody applied. Inspect the first broken step and change only that step.

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

## Waitlist privacy and retention

Founder Beta responses are private and visible in the project owner's Tally workspace, not public GitHub issues. Tally is an external EU-hosted form provider. The contact email is used only for beta invitations and support. Never ask applicants to submit selected text, documents, API keys, or full model requests.

Apply this retention procedure to the Tally workspace and to any necessary export:

1. Review new responses at least weekly while recruitment is open. Delete test submissions and obvious duplicates during that review.
2. Delete every undecided application no later than 90 days after submission. Delete rejected applications within 30 days after the decision or within 30 days after recruitment closes, whichever is earlier.
3. For accepted applicants, delete the application no later than 30 days after their beta participation ends.
4. An applicant can request access, correction, or deletion through the public privacy form at `https://tally.so/r/2E9AkL` or by replying to an invitation or support email. Process the request, delete any matching working export when applicable, and confirm by email within seven days. Delete the completed privacy-request response within the same seven-day window.
5. Keep only aggregate funnel totals after deletion. Aggregate records must not contain names, email addresses, free-text workflow answers, or other identifiers.

Deleting a response from the Wordwise workspace does not claim immediate erasure from Tally's infrastructure or backups; Tally's own retention and privacy terms still apply. Do not export responses unless beta operations require it. If an export is required, restrict access to the project owner and apply the same deletion deadlines.

The Founder Beta GitHub issue templates remain available as optional public feedback paths. Anyone using them must not post email addresses, selected text, documents, API keys, full model requests, or other private information.

Before every acquisition post and at least weekly while recruitment is open, run an external-form smoke check in a logged-out browser:

1. Open the waitlist with both `?source=smoke-test&language=zh` and `?source=smoke-test&language=en` and confirm HTTP success, the exact Wordwise form title, bilingual eligibility and privacy copy, all seven visible questions, and hidden `source` and `language` parameters.
2. Confirm all visible waitlist questions are required and the testing agreement requires all three acknowledgements. Use Tally preview rather than creating a real submission.
3. Open `https://tally.so/r/2E9AkL` and confirm the bilingual privacy-request title, required email and request type, optional details field, and seven-day confirmation promise.
4. Treat a closed, renamed, repurposed, or structurally changed form as a release blocker. Record real submission counts separately; never create a fake production application for monitoring.

## Product guardrail

Automatic mode must never present the small fallback dictionary as contextual translation. If no model is configured, stop and help the user connect Ollama or a cloud API. Dictionary mode remains available only as an explicit word-lookup choice.
