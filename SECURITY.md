# Security Policy

---

## Reporting a Vulnerability

If you discover a security vulnerability in Stacker (the CLI or the proxy worker), please report it responsibly.

**Do not open a public GitHub issue for security vulnerabilities.**

Email us directly at:

**security@ptgeneral.ai**

Please include:
- A description of the vulnerability
- Steps to reproduce it
- The potential impact (what an attacker could achieve)
- Any proof-of-concept code if applicable

We will acknowledge your report within **48 hours** and aim to provide a resolution timeline within **5 business days**.

---

## Scope

### In Scope

- **CLI (`stacked-cli`)** — authentication logic, token storage, request signing, local encryption
- **Proxy worker (`worker/`)** — token validation, rate limiting, HMAC verification, request forwarding

### Out of Scope

- Third-party AI providers (Groq, OpenAI, Anthropic) — report vulnerabilities in those services directly to them
- Vulnerabilities that require physical access to the user's machine
- Social engineering attacks
- Theoretical vulnerabilities without a realistic attack path
- Issues in `node_modules` dependencies not directly exploitable through Stacker's attack surface

---

## Response Timeline

| Stage | Target |
|---|---|
| Acknowledgement | Within 48 hours |
| Initial assessment | Within 5 business days |
| Fix or mitigation | Depends on severity (critical: ASAP, high: 2 weeks, medium/low: next release) |
| Public disclosure | Coordinated with reporter after fix is released |

We follow a coordinated disclosure model. We ask that you give us reasonable time to patch before public disclosure.

---

## Security Architecture

Here is how Stacker is designed to keep both users and the proxy safe.

### No API Keys in the CLI

The CLI contains zero AI provider API keys. All AI requests are forwarded through the proxy, which holds credentials server-side. A compromised CLI installation cannot leak AI provider credentials.

### Machine-Bound Tokens

On first use, Stacker registers the current machine with the proxy and receives a token. That token is:

- **Machine-bound** — derived from a hardware fingerprint; it cannot be copied to another machine and used
- **Encrypted at rest** — stored locally with AES-256-GCM encryption
- **Signed** — each request includes an HMAC-SHA256 signature so the proxy can verify the request has not been tampered with

### No Source Code Transmitted

Stacker never sends your source code or file contents to the proxy. Only structured metadata (framework names, file counts, rule findings) is transmitted. This limits the blast radius of any proxy-side breach — there is no code to expose.

### Proxy Validation

Every request to the proxy is validated for:

1. Token presence and validity
2. HMAC-SHA256 request signature
3. Rate limit compliance (60 requests/minute per machine)

Requests failing any check are rejected before reaching AI providers.

### Transport Security

All communication between the CLI and proxy uses HTTPS (TLS 1.2+). The proxy runs on Cloudflare Workers, which enforces modern TLS by default.

---

## Supported Versions

Security fixes are applied to the latest published version on npm. We do not backport fixes to older versions. Please keep `stacked-cli` up to date.

```bash
npm install -g stacked-cli@latest
```
