# Build Wordwise on macOS

The signed and notarized beta installer is not available yet. Developers can run the current version from source without waiting for that release.

## Prerequisites

- macOS 12 or later
- Node.js 24 or later
- Rust stable
- Xcode Command Line Tools

Install the Rust toolchain if needed:

```bash
rustup toolchain install stable
```

## Run the desktop app

From the repository root:

```bash
npm ci
npm run tauri dev
```

Wordwise opens as a native desktop window. Select English in another macOS app and press `Option + T` to capture it.

The first selection capture requires permission in **System Settings -> Privacy & Security -> Accessibility**. Wordwise first tries the macOS Accessibility API. When an app does not expose its selection there, Wordwise uses a copy fallback and restores the previous clipboard contents.

## Configure a translation engine

Use one of these contextual engines:

- Ollama on the same Mac, with `qwen3:4b` or a larger Qwen model recommended
- An OpenAI-compatible API endpoint and your own API key

Automatic mode uses an available Ollama model first, then a configured cloud API. It reports a setup error when neither is available. The offline dictionary is an explicit word-lookup mode and is not presented as contextual sentence translation.

API keys remain in application memory and are not written to browser storage or committed to the repository. Never include keys, selected text, or private documents in a public GitHub issue.

## Verify a change

Run the repository quality gates before opening a pull request:

```bash
npm run check
npm run test:smoke
npm run test:site
npm run desktop:check
```
