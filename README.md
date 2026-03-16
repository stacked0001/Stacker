# Stacker

```
███████╗████████╗ █████╗  ██████╗██╗  ██╗███████╗██████╗
██╔════╝╚══██╔══╝██╔══██╗██╔════╝██║ ██╔╝██╔════╝██╔══██╗
███████╗   ██║   ███████║██║     █████╔╝ █████╗  ██████╔╝
╚════██║   ██║   ██╔══██║██║     ██╔═██╗ ██╔══╝  ██╔══██╗
███████║   ██║   ██║  ██║╚██████╗██║  ██╗███████╗██║  ██║
╚══════╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝
```

**AI-powered codebase analyzer. Point it at any repo and get a full report on tech stack, security vulnerabilities, deployment gaps, and code complexity — in seconds. No API keys. No setup.**

[![npm version](https://img.shields.io/npm/v/stacked-cli?color=blue&label=npm)](https://www.npmjs.com/package/stacked-cli)
[![CI](https://github.com/vivaan0001/Stacker/actions/workflows/ci.yml/badge.svg)](https://github.com/vivaan0001/Stacker/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)

---

## Install

```bash
npm install -g stacked-cli
```

That's it. No API keys. No accounts. No config files.

---

## Commands

```
stacker                           Show all commands
stacker analyze <repo>            Tech stack analysis + AI recommendations
stacker security <repo>           Security audit — CVEs, secrets, OWASP risks
stacker deployment <repo>         Deployment recommendations — CI/CD, Docker, cloud
stacker codebase <repo>           Full analysis — everything combined
```

`<repo>` can be a GitHub URL or a local path:

```bash
stacker analyze https://github.com/user/repo
stacker security ./my-project
stacker codebase .
```

---

## What it detects

### `stacker analyze`
- Full tech stack (language, frameworks, DB, styling, testing, build tools, package manager)
- Project type (Web App, CLI Tool, VS Code Extension, Claude Code Plugin, etc.)
- Scored recommendations with problem, outcome, tradeoffs, alternatives, and migration steps
- Stack strengths

### `stacker security`
- **Real CVE scanning** — runs `npm audit` against actual vulnerability databases
- **Secret detection** — scans source files for hardcoded API keys, tokens, passwords, private keys
- **OWASP risk analysis** — XSS sinks, SQL injection patterns, command injection risks, security misconfigurations
- Security score + AI-synthesized findings

### `stacker deployment`
- CI/CD pipeline gaps
- Containerization recommendations
- Cloud provider fit (Vercel, Railway, Fly.io, AWS, etc.)
- Environment config, health checks, monitoring, secrets management

### `stacker codebase`
- Everything above in one report
- Code complexity metrics — cyclomatic complexity per file, high-risk files flagged
- Duplication risk assessment

---

## Example output

```
  Stacker — Stack Analysis Pipeline

  ✔ Repository resolved: my-app
  ✔ Static analysis complete  (151 files, 13,843 lines)
  ✔ Architecture mapped  (Serverless, JAMstack)
  ✔ Rule engine complete  (0 critical, 0 warnings)
  ✔ Analysis model complete
  ✔ Reasoning model complete

  ── DETECTED STACK ──────────────────────────────────────

  Language              TypeScript
  Project Type          Web App
  Frontend              React
  Styling               Tailwind CSS
  Testing               Vitest
  Build Tools           Vite
  Package Manager       bun

  ── DEPENDENCY VULNERABILITIES ──────────────────────────

  7 high  5 moderate  3 low

  • @remix-run/router  high   React Router vulnerable to XSS via Open Redirects
  • esbuild            moderate  dev server exposes requests to any origin
  • flatted            high   unbounded recursion DoS in parse()
  ... and 7 more

  ── SECRETS FOUND ───────────────────────────────────────

  ⚠ 3 potential secrets detected

  • src/components/ui/chart.tsx:70  —  dangerouslySetInnerHTML
  • src/pages/BlogPost.tsx:73       —  dangerouslySetInnerHTML
  • src/pages/BlogPost.tsx:81       —  dangerouslySetInnerHTML

  ── CODE COMPLEXITY ─────────────────────────────────────

  Average complexity    11.1
  Max complexity        92
  Total functions       854
  Avg lines/function    16
  Duplication risk      high

  High complexity files:
    • src/pages/Search.tsx    complexity: 92
    • src/pages/Submit.tsx    complexity: 86
    • src/lib/blogPosts.ts    complexity: 85

  ── STACK SCORES ────────────────────────────────────────

  Overall               8.0/10  →  9.0/10  +1.0  ████████░░
  Performance           8.0/10  →  9.0/10  +1.0  ████████░░
  Developer Experience  9.0/10  →  9.0/10   0    █████████░
  Maintainability       8.0/10  →  9.0/10  +1.0  ████████░░
  Scalability           7.0/10  →  8.0/10  +1.0  ███████░░░

  ── STACK STRENGTHS ─────────────────────────────────────

  ✓ Well-structured React codebase
  ✓ Error monitoring with @sentry/react
  ✓ Type safety with TypeScript
  ✓ Accessible UI with Radix components
```

---

## How it works

Your source code never leaves your machine. Stacker only sends structured metadata (detected stack, file counts, rule findings) to an AI proxy — never raw source files.

```
Your Machine              Proxy (Cloudflare Worker)        AI Providers
─────────────             ─────────────────────────        ────────────
stacker analyze .  ──▶   validate token + rate limit  ──▶  Groq / OpenAI
                          forward structured metadata
                   ◀──   return AI recommendations    ◀──
```

On first use, Stacker silently registers your machine and stores an AES-256-GCM encrypted token locally. No sign-up required.

---

## Options

```bash
--format terminal|json|markdown   Output format (default: terminal)
--output <file>                   Save report to file
--skip-ai                         Rule-based analysis only, no AI calls
--verbose                         Show debug output
```

```bash
# Save a full markdown report
stacker codebase https://github.com/user/repo --output report.md

# Skip AI, just run static rules
stacker security . --skip-ai
```

---

## Other commands

```bash
stacker compare <repo1> <repo2>   Side-by-side stack comparison
stacker report <repo>             Analyze and save to markdown automatically
stacker cache clear               Clear cached results
stacker cache status              Show cache size
stacker config                    Show current configuration
stacker login                     Manual authentication
stacker logout                    Remove stored token
```

---

## Configuration

No configuration needed. Override with environment variables if required:

| Variable | Description | Default |
|---|---|---|
| `STACKER_TIMEOUT` | Request timeout (ms) | `30000` |
| `STACKER_CACHE` | Enable/disable caching | `true` |
| `STACKER_FORMAT` | Output format | `terminal` |
| `STACKER_VERBOSE` | Verbose logging | `false` |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Security

See [SECURITY.md](SECURITY.md) for responsible disclosure.

## License

MIT — see [LICENSE](LICENSE).

---

<p align="center">Free to use. Open source. No API keys required.</p>
