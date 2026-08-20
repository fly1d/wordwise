# Architecture

The project has two user surfaces and one translation contract.

```text
Web UI ---- HTTP ---- Node API ---- Ollama / cloud model
   |
Desktop UI - invoke --- Tauri ---- Ollama / cloud model
   |
   +--- macOS Accessibility selection capture
   +--- Native NSPasteboard snapshot + System Events copy fallback
```

Both backends tokenize text before model invocation and validate that every input token has exactly one output segment. The web API remains useful for hosted deployments. The Tauri backend allows a signed desktop build to run without a bundled Node runtime.

Document text extraction happens in the frontend so it works in both surfaces. Preserving the layout of an edited source document is intentionally a separate export subsystem.

Secrets must never be compiled into frontend assets. A user-supplied cloud API key is held in page memory; production shared credentials require a separately authenticated backend.

The copy fallback materializes every declared pasteboard representation on the macOS main thread before sending Command+C. The external System Events process is waited on away from the UI thread and is terminated and reaped after a 15-second watchdog; pasteboard observation and restoration then return to the main thread. The completion task survives cancellation of the originating frontend invoke so it can still finish the guarded restoration. Once Copy has been dispatched, only a stable candidate followed by successful restoration permits another fallback transaction. A forced stop, no-selection timeout, generation anomaly, native read or restore failure, or abandoned request quarantines copy fallback until the app restarts, because terminating `osascript` cannot retract an event already delivered to System Events and a successful send does not prove that the target application has processed it. The in-memory snapshot is still released on the main thread when that attempt ends. Candidate text is returned only after its generation remains stable and the original snapshot has been restored with `NSPasteboardContentsCurrentHostOnly`. `NSPasteboard` exposes neither writer identity, the original host-only option, nor an atomic conditional replacement, so the first post-command generation cannot be attributed with certainty and a check-to-write TOCTOU boundary remains. A delayed copy may still change the current clipboard after an error, even though quarantine prevents it from entering a newer Wordwise transaction. These are signed-release test and disclosure obligations, not absolute safety guarantees.
