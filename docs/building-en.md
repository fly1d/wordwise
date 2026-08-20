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

Wordwise opens as a native desktop window. Select English in another macOS app and press the default `Option + K` shortcut to capture it. You can disable selection translation or record another key combination in Settings.

The first selection capture requires permission in **System Settings -> Privacy & Security -> Accessibility**. Wordwise first tries the macOS Accessibility API. When an app does not expose its selection there, Wordwise uses a copy fallback and may also request permission under **Automation -> System Events**. The fallback briefly uses the system pasteboard: Wordwise snapshots every pasteboard item and declared representation in memory, then restores them only while `changeCount` still identifies the candidate generation. An additional or unexpected change observed before restoration begins keeps the newer contents and cancels the capture. The snapshot is never sent to a translation engine and is released from memory after capture. Disabling the shortcut only unregisters the global shortcut; remove Wordwise in macOS System Settings to revoke the permissions themselves.

`NSPasteboard` exposes neither writer identity nor an atomic compare-and-swap operation. Wordwise cannot prove that the first generation observed after Command+C came from the target application, and a narrow TOCTOU window remains between the generation check and the restoration write. The implementation protects additional or unexpected changes observed before restoration begins and checks the generation again after clearing. A signed release candidate must still exercise the concurrent-write release checks, and conditional restoration must not be described as an absolute atomic guarantee.

macOS also does not expose whether the original contents used `NSPasteboardContentsCurrentHostOnly`. Wordwise restores snapshots with `CurrentHostOnly` so sensitive local-only contents are not widened to Universal Clipboard. As a consequence, the restoration itself does not make previously syncable contents available to the user's other Apple devices.

## Configure a translation engine

Use one of these contextual engines:

- Ollama on the same Mac, with `qwen3:4b` or a larger Qwen model recommended
- An OpenAI-compatible API endpoint and your own API key

Local mode needs no API key. Install and start Ollama from the [macOS download page](https://ollama.com/download/mac), then run this in another terminal:

```bash
ollama pull qwen3:4b
```

Return to Wordwise and keep `自动选择` selected, or choose `Ollama`. Select `What's under the hood?` in an app that supports text selection or copying, then press the default `Option + K` shortcut. A successful first run shows a full Chinese translation, token-aligned results, and the `Ollama · qwen3:4b` engine label.

Automatic mode uses an available Ollama model first, then a configured cloud API. It reports a setup error when neither is available. The offline dictionary is an explicit word-lookup mode and is not presented as contextual sentence translation.

API keys remain in application memory and are not written to browser storage or committed to the repository. With a cloud model or remote Ollama URL, selected text, manual input, and extracted document text are sent to the configured service; the default localhost Ollama URL and dictionary mode do not send that content to the cloud. Never include keys, selected text, or private documents in a public GitHub issue.

## Common blockers

- The shortcut does not respond: confirm that selection translation is enabled in Settings and that another app has not reserved the key combination.
- The shortcut cannot read the selection: check Wordwise under **System Settings -> Privacy & Security -> Accessibility**. The copy fallback also needs Wordwise to control System Events under **Automation**. Restart the development app after changing either permission.
- Wordwise reports that the pasteboard changed: another write occurred after the candidate generation. Wordwise cancels that capture and does not send the candidate text to a translation engine. Check the current pasteboard, quit and reopen Wordwise, then try again.
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
