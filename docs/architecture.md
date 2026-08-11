# Architecture

The project has two user surfaces and one translation contract.

```text
Web UI ---- HTTP ---- Node API ---- Ollama / cloud model
   |
Desktop UI - invoke --- Tauri ---- Ollama / cloud model
   |
   +--- macOS Accessibility selection capture
```

Both backends tokenize text before model invocation and validate that every input token has exactly one output segment. The web API remains useful for hosted deployments. The Tauri backend allows a signed desktop build to run without a bundled Node runtime.

Document text extraction happens in the frontend so it works in both surfaces. Preserving the layout of an edited source document is intentionally a separate export subsystem.

Secrets must never be compiled into frontend assets. A user-supplied cloud API key is held in page memory; production shared credentials require a separately authenticated backend.
