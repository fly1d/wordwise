# Build Wordwise on macOS

The signed and notarized beta installer is not available yet. Developers can run the current version from source without waiting for that release.

## Prerequisites

- macOS 12 or later
- Node.js 22.13 or later
- Rust stable
- Xcode Command Line Tools

Confirm that the required command-line tools are available:

```bash
git --version
node --version
rustc --version
xcode-select -p
```

If Xcode Command Line Tools or Rust is missing, install them first:

```bash
xcode-select --install
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

After Rust finishes installing, open a new terminal and run:

```bash
rustup toolchain install stable
```

Use the [Node.js download page](https://nodejs.org/en/download) for an installer or alternative installation method. `node --version` must report `v22.13.0` or later.

## Run the desktop app

Clone the repository and install the locked dependency versions:

```bash
git clone https://github.com/fly1d/wordwise.git
cd wordwise
npm ci
```

Start the desktop app:

```bash
npm run tauri dev
```

Wordwise opens as a native desktop window. Select English in another macOS app and press `Option + T` to capture it.

The first selection capture requires permission in **System Settings -> Privacy & Security -> Accessibility**. Wordwise first tries the macOS Accessibility API. When an app does not expose its selection there, Wordwise uses a copy fallback and restores the previous clipboard contents.

## Configure a translation engine

Use one of these contextual engines:

- Ollama on the same Mac, with `qwen3:4b` or a larger Qwen model recommended
- An OpenAI-compatible API endpoint and your own API key

Local mode needs no API key. Install and start Ollama from the [macOS download page](https://ollama.com/download/mac), then run this in another terminal:

```bash
ollama pull qwen3:4b
```

Return to Wordwise and keep **Automatic** selected, or choose **Local Ollama**. Select `What's under the hood?` in any app and press `Option + T`. A successful first run shows a full Chinese translation, token-aligned results, and the `Ollama · qwen3:4b` engine label.

Automatic mode uses an available Ollama model first, then a configured cloud API. It reports a setup error when neither is available. The offline dictionary is an explicit word-lookup mode and is not presented as contextual sentence translation.

API keys remain in application memory and are not written to browser storage or committed to the repository. Never include keys, selected text, or private documents in a public GitHub issue.

## Common blockers

- The shortcut cannot read the selection: check Wordwise under **System Settings -> Privacy & Security -> Accessibility**, then restart the development app.
- Automatic mode reports that no engine is configured: make sure Ollama is running and use `ollama list` to confirm that the model was downloaded.
- A development port is already in use: stop the existing Wordwise development process and try again.

## Verify a change

Run the repository quality gates before opening a pull request:

```bash
npm run check
npm run test:smoke
npm run test:site
npm run desktop:check
```
