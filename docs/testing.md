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
- AX-selected text succeeds without changing any pasteboard item or representation
- Forced copy fallback restores byte-identical plain text, RTF/HTML, image, file URL, and multi-item pasteboards
- Denied Automation leaves the original pasteboard unchanged and reports **Automation -> System Events**
- With no concurrent write and an unchanged `changeCount`, no selection reports the existing reason without reading stale pasteboard text, then quarantines copy fallback until restart
- An unexpected generation observed before restoration starts is preserved and cancels translation
- A stalled System Events process is terminated by the 15-second watchdog without freezing the app event loop
- A timeout, no-selection result, generation anomaly, native failure, or abandoned request quarantines copy fallback until restart, so a late event cannot enter a newer transaction
- First-change attribution and the restore check-to-write TOCTOU boundary are reviewed as residual risks, not marked as atomically solved
- Accessibility and Automation permission revoke/regrant paths work after restart
- The signed candidate shows the expected first-run TCC text; inspect its effective entitlements with `codesign -d --entitlements - <app>`
- Ollama available, cloud available, and full fallback paths
- TXT, Markdown, DOCX, and PDF imports
- Unsigned local bundle launch before signing, plus signed/notarized candidate launch before publication

## Nightly candidates

Long documents, provider compatibility matrices, malformed model output, and multiple macOS versions should not block every small pull request. They belong in scheduled suites once representative fixtures are available.
