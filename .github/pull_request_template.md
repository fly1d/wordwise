## Summary

<!-- Describe the user-visible behavior and why the change is needed. -->

## Risk

- [ ] Low: documentation, copy, styles, or isolated dictionary data
- [ ] Medium: UI behavior, translation provider, document parsing, or shared API
- [ ] High: selection capture, OS permissions, credentials, packaging, or releases

## Verification

- [ ] `npm run check`
- [ ] `npm run test:smoke` when user-facing behavior changed
- [ ] `cargo check --manifest-path src-tauri/Cargo.toml` when desktop code changed
- [ ] No API keys, user content, or sensitive logs were added
- [ ] Error and fallback states were exercised

## Review Notes

<!-- Call out security, privacy, migration, or rollback concerns. -->
