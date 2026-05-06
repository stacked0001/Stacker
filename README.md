# Stacker

Codebase health reports for teams that want to know what is blocking a repo from being production-ready.

Run one command to inspect a local repo or GitHub repo for stack risks, security issues, deployment gaps, and complexity hotspots. Stacker sends only structured metadata to its AI proxy by default. Raw source files stay on your machine.

[![npm version](https://img.shields.io/npm/v/stacked-cli?color=blue&label=npm)](https://www.npmjs.com/package/stacked-cli)
[![CI](https://github.com/stacked0001/Stacker/actions/workflows/ci.yml/badge.svg)](https://github.com/stacked0001/Stacker/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)

## Quick Start

```bash
npx stacked-cli codebase .
```

Or install it globally:

```bash
npm install -g stacked-cli
stacker codebase .
```

Preview the output without scanning a repo:

```bash
stacker demo
stacker demo --format markdown
```

## Commands

```bash
stacker analyze <repo>       Tech stack analysis and recommendations
stacker security <repo>      Dependency, secret, and OWASP-oriented security scan
stacker deployment <repo>    Deployment, CI/CD, runtime, and release-readiness report
stacker codebase <repo>      Full report: stack + security + deployment + complexity
stacker report <repo>        Save a markdown report
stacker compare <a> <b>      Compare two repository stacks
stacker demo                 Show a sample report
stacker cache status         Show cache status
stacker cache clear          Clear cached AI responses
stacker config               Show local configuration
stacker login                Manually store an access token
stacker logout               Remove the stored token
```

`<repo>` can be a local path or GitHub URL:

```bash
stacker codebase .
stacker security ./my-project
stacker analyze https://github.com/user/repo
```

## CI Usage

Add Stacker to pull requests with the bundled GitHub Action:

```yaml
name: Stacker

on:
  pull_request:

permissions:
  contents: read
  pull-requests: write

jobs:
  report:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: stacked0001/Stacker@main
        with:
          target: .
          skip-ai: "true"
          comment: "true"
```

Use `skip-ai: "false"` if your hosted Stacker proxy quota is available for AI recommendations. The static report still works without AI.

## Output Formats

```bash
stacker codebase . --format terminal
stacker codebase . --format json
stacker codebase . --format markdown
stacker codebase . --format markdown --output stacker-report.md
```

`json` and `markdown` stdout are designed for automation. Terminal progress output is only printed for `--format terminal` without `--output`.

## What Stacker Checks

- Tech stack: language, frameworks, database, styling, testing, build tools, package manager
- Project shape: app type, architecture signals, API surface, CI/CD, Docker, serverless config
- Security: `npm audit`, hardcoded secret patterns, risky sink patterns, dependency summaries
- Deployment: CI/CD gaps, runtime fit, health checks, environment config, release readiness
- Complexity: approximate cyclomatic complexity, high-risk files, function counts, duplication risk
- Recommendations: rule-based findings plus optional AI synthesis, each with evidence and effort

## Privacy Model

Stacker is designed to be private by default:

- Raw source files are scanned locally.
- The AI proxy receives structured metadata such as detected frameworks, counts, rule findings, and complexity summaries.
- Secret findings are redacted before display or report export.
- A machine-bound token is created automatically on first AI use and stored locally.
- Use `--skip-ai` to avoid proxy calls entirely.

## Configuration

No configuration is required for normal use. Optional environment variables:

| Variable | Description | Default |
|---|---|---|
| `STACKER_TIMEOUT` | Request timeout in milliseconds | `30000` |
| `STACKER_CACHE` | Enable or disable caching | `true` |
| `STACKER_FORMAT` | Output format | `terminal` |
| `STACKER_VERBOSE` | Verbose logging | `false` |
| `STACKER_SKIP_AI` | Rule-based analysis only | `false` |

See [.env.example](.env.example) for all optional overrides.

## Development

```bash
npm install
npm test
npm run build
```

Worker development:

```bash
cd worker
npm install
npm run type-check
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Security

See [SECURITY.md](SECURITY.md) for responsible disclosure.

## License

MIT. See [LICENSE](LICENSE).
