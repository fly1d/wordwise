# Contributing

All changes are merged through pull requests. Direct pushes to `main` should be disabled with a GitHub branch protection rule.

## Development

```bash
npm ci
npm run dev
```

Before opening a pull request:

```bash
npm run check
npm run test:smoke
cargo check --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

## Review policy

- Low risk: automated checks plus one review.
- Medium risk: one review and the affected smoke path.
- High risk: one security-aware review, affected integration tests, and a manual macOS check.
- High-risk areas include selection capture, Accessibility permissions, credentials, document parsing, packaging, and release workflows.

Tests should describe user-visible behavior. A fix must include a regression test when the failure can be reproduced automatically.

## Releases

Use semantic versions. Beta tags such as `v0.1.0-beta.1` create a draft prerelease; a maintainer reviews the artifacts and changelog before publishing.
