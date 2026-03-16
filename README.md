# Stacker

```
███████╗████████╗ █████╗  ██████╗██╗  ██╗███████╗██████╗
██╔════╝╚══██╔══╝██╔══██╗██╔════╝██║ ██╔╝██╔════╝██╔══██╗
███████╗   ██║   ███████║██║     █████╔╝ █████╗  ██████╔╝
╚════██║   ██║   ██╔══██║██║     ██╔═██╗ ██╔══╝  ██╔══██╗
███████║   ██║   ██║  ██║╚██████╗██║  ██╗███████╗██║  ██║
╚══════╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝
```

**AI-powered tech stack analysis and improvement recommendations for any repository.**

[![npm version](https://img.shields.io/npm/v/stacked-cli?color=blue&label=npm)](https://www.npmjs.com/package/stacked-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)

---

## What is Stacker?

Stacker scans any software repository — local or on GitHub — detects your full tech stack, and delivers AI-powered recommendations for improving it. No API keys. No configuration. Just point it at a repo and get a scored, actionable report in seconds.

---

## Features

- **Zero setup** — no API keys required; authentication is handled automatically on first use
- **Automatic stack detection** — identifies language, frameworks, databases, styling, testing tools, build systems, and package managers
- **Rule-based engine** — deterministic checks run instantly before any AI call
- **Dual AI analysis** — two AI models analyze your stack for depth and cross-validation
- **Scored recommendations** — every suggestion includes a 0–10 score, problem statement, expected outcome, tradeoffs, alternatives, and migration notes
- **Compare repos** — diff two repos side by side to benchmark stacks against each other
- **Saveable reports** — export the full analysis as a markdown file
- **Secure by design** — your source code never leaves your machine; AI requests route through a proxy with no keys stored in the CLI
- **Response caching** — repeated analysis of unchanged repos skips redundant work

---

## Installation

```bash
npm install -g stacked-cli
```

Requires **Node.js 18 or higher**.

---

## Quick Start

```bash
stacker analyze .
stacker analyze https://github.com/user/repo
stacker compare ./my-app https://github.com/user/other-app
```

---

## Commands

| Command | Description |
|---|---|
| `stacker analyze [repo]` | Analyze a repo and print recommendations. Defaults to current directory. |
| `stacker suggest [repo]` | Alias for `analyze`. |
| `stacker report [repo]` | Run analysis and save the full report to a markdown file. |
| `stacker compare <repo1> <repo2>` | Compare two repos side by side. Accepts local paths or GitHub URLs. |
| `stacker config` | Show current configuration (proxy URL, models, timeout). |
| `stacker cache clear` | Clear all cached analysis data. |
| `stacker cache status` | Show cache size and entry count. |
| `stacker login` | Manually trigger authentication. Usually handled automatically on first use. |
| `stacker logout` | Remove the stored authentication token from your machine. |

---

## How It Works

Stacker uses a **proxy architecture** so you never need to manage API keys.

```
Your Machine                   Proxy (Cloudflare Worker)         AI Providers
──────────────────             ──────────────────────────        ─────────────
stacker analyze .  ──────────▶  validate token + rate limit ──▶  Groq
                               forward structured metadata        OpenAI
                   ◀──────────  return AI response           ◀──  Anthropic
```

1. **First run** — Stacker auto-registers your machine with the proxy and stores a local token (AES-256-GCM encrypted, machine-bound).
2. **Analysis** — Stacker walks your repo files, detects the stack, and runs the rule engine for instant findings.
3. **AI requests** — Only structured metadata and rule findings (never your source code) are sent to `stacker-proxy.ptgeneral.workers.dev`, which forwards to AI providers on your behalf.
4. **Report** — Results are assembled locally and printed to your terminal or saved to a file.

You never see or manage any AI provider API keys. The CLI contains none.

---

## Example Output

```
╔══════════════════════════════════════════════════════════╗
║                 STACKER ANALYSIS REPORT                  ║
╚══════════════════════════════════════════════════════════╝

  Repository : ./my-nextjs-app
  Analyzed   : 2024-03-15 14:32:01

────────────────────────────────────────────────────────────
  DETECTED STACK
────────────────────────────────────────────────────────────
  Language      TypeScript
  Frontend      Next.js 14, React 18
  Backend       Next.js API Routes
  Database      PostgreSQL, Prisma ORM
  Styling       Tailwind CSS
  Testing       Jest, React Testing Library
  Build         Turbopack
  Package Mgr   pnpm

────────────────────────────────────────────────────────────
  REPO STATS
────────────────────────────────────────────────────────────
  Files           142
  Lines of Code   18,430
  Components      34
  API Routes      12

────────────────────────────────────────────────────────────
  STACK SCORES
────────────────────────────────────────────────────────────
  Current Score     7.2 / 10
  Optimized Score   9.1 / 10   (+1.9)

────────────────────────────────────────────────────────────
  SUGGESTIONS  (3 found)
────────────────────────────────────────────────────────────

  [1] Add end-to-end testing  ▲ HIGH IMPACT
  ──────────────────────────────────────────────
  Problem       No E2E tests detected. Unit tests alone won't catch
                integration failures across pages and API routes.
  Outcome       Catch regressions before they reach production.
  Tradeoffs     Adds CI time; requires maintaining test scenarios.
  Alternatives  Playwright (recommended), Cypress
  Getting started:
                pnpm add -D @playwright/test
                npx playwright install
                npx playwright test

  [2] Add error monitoring  ▲ MEDIUM IMPACT
  ──────────────────────────────────────────────
  Problem       No error tracking integration detected.
  Outcome       Catch and triage production errors in real time.
  Tradeoffs     Minor bundle size increase; requires account setup.
  Alternatives  Sentry (recommended), Highlight.io, Axiom
  ...

────────────────────────────────────────────────────────────
  STACK STRENGTHS
────────────────────────────────────────────────────────────
  ✔  TypeScript strict mode enabled
  ✔  Modern package manager (pnpm)
  ✔  ORM layer prevents raw SQL injection surface
  ✔  Tailwind eliminates dead CSS at build time

────────────────────────────────────────────────────────────
  AI SUMMARY
────────────────────────────────────────────────────────────
  Your stack is modern and well-chosen. The main gaps are test
  coverage depth and observability tooling. Adding E2E tests and
  an error tracking integration would bring this stack to
  production-grade reliability.
```

---

## Configuration

Stacker works without any configuration. Override defaults with environment variables if needed.

| Variable | Description | Default |
|---|---|---|
| `STACKER_PROXY_URL` | Override the proxy endpoint URL | `https://stacker-proxy.ptgeneral.workers.dev` |
| `STACKER_ANALYSIS_MODEL` | AI model used for the analysis pass | Proxy default |
| `STACKER_REASONING_MODEL` | AI model used for the reasoning pass | Proxy default |
| `STACKER_TIMEOUT` | Request timeout in milliseconds | `30000` |

Example:

```bash
STACKER_TIMEOUT=60000 stacker analyze https://github.com/user/large-repo
```

---

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions, project structure, and PR guidelines.

---

## Security

For responsible disclosure of security vulnerabilities, see [SECURITY.md](SECURITY.md).

---

## Terms of Service

By using Stacker, you agree to the [Terms of Service](TERMS.md).

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

<p align="center">Free to use. Open source. No API keys required.</p>
