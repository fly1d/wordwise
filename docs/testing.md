# Testing Strategy

## Pull request gate

- TypeScript type checking
- Unit tests for deterministic tokenization and translation behavior
- API integration tests
- Production web build
- Chromium smoke test for the primary translation workflow
- Rust formatting, Clippy, unit tests, and compilation when desktop-owned files change

## Release gate

- All pull request checks
- Manual macOS selection capture with Accessibility allowed and denied
- Ollama available, cloud available, and full fallback paths
- TXT, Markdown, DOCX, and PDF imports
- Unsigned local bundle launch before signing or notarization

## Nightly candidates

Long documents, provider compatibility matrices, malformed model output, and multiple macOS versions should not block every small pull request. They belong in scheduled suites once representative fixtures are available.
