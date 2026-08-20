# Releasing

## Beta checklist

1. Update `CHANGELOG.md` and keep the versions in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json` identical.
2. Run `npm run check`, `npm run test:smoke`, and `npm run desktop:check`.
3. On an unsigned local `.app`, verify the full selection matrix in `docs/testing.md`, including byte-identical multi-representation fallback restoration, denied Automation, no selection, and an extra write after the candidate generation.
4. Create and push a beta tag such as `v0.1.0-beta.1`.
5. On the signed and notarized candidate, repeat permission revoke/regrant and first-run TCC checks. Confirm the bundled `NSAppleEventsUsageDescription` and inspect the effective entitlements with `codesign -d --entitlements - <app>`.
6. Review the draft GitHub prerelease and its `.app` / `.dmg` artifacts before publishing.

## Signing and notarization

Public macOS artifacts should not be published without Apple signing and notarization. Configure these GitHub Actions secrets:

- `APPLE_CERTIFICATE`
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_SIGNING_IDENTITY`
- `APPLE_ID`
- `APPLE_PASSWORD`
- `APPLE_TEAM_ID`

The release workflow checks that all six secrets are present before reserving a macOS runner. It never prints their values; a missing secret stops the workflow with the secret name and setup guidance.

Unsigned builds are suitable only for local development and internal beta testing because Gatekeeper will warn users.

## Rollback

GitHub prereleases remain drafts until a maintainer publishes them. If a published beta regresses a high-risk path, mark it as withdrawn in the release notes and publish a new patch beta rather than replacing existing artifacts.
