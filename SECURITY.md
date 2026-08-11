# Security Policy

## Supported versions

Only the latest beta and latest stable release receive security fixes before version 1.0.

## Reporting

Do not open a public issue for credential exposure, arbitrary file access, selection capture without consent, or remote code execution. Use the repository's private security advisory feature.

Never include API keys, selected private text, documents, or full request logs in a report. A minimal redacted reproduction is sufficient.

## Data handling

- Basic dictionary translation is offline.
- Ollama requests go to the configured local endpoint.
- Cloud translation sends the selected text to the endpoint configured by the user.
- API keys are kept in memory unless a future secure keychain integration is explicitly enabled.
