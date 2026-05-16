# 🚨 @kimuson/npm-fw

[![CI](https://img.shields.io/github/actions/workflow/status/d-kimuson/npm-fw/ci.yml?branch=main&style=for-the-badge)](https://github.com/d-kimuson/npm-fw/actions/workflows/ci.yml?branch=main)
[![GitHub release](https://img.shields.io/github/v/release/d-kimuson/npm-fw?include_prereleases&style=for-the-badge)](https://github.com/d-kimuson/npm-fw/releases)
[![npm version](https://img.shields.io/npm/v/%40kimuson%2Fnpm-fw?color=yellow&style=for-the-badge)](https://www.npmjs.com/package/@kimuson/npm-fw)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](https://github.com/d-kimuson/npm-fw/blob/main/LICENSE)

npm registry proxy firewall. Fall back of blocks vulnerable packages — including transitive dependencies — before they reach `node_modules`.

## Quick Start

```bash
npm install -g @kimuson/npm-fw
```

### Per-command wrapper

Prefix any package manager command with `npm-fw`:

```bash
npm-fw npm install axios
npm-fw pnpm add react
npm-fw yarn add lodash
```

The first run automatically starts a background daemon and routes the command through it. No configuration needed.

### Standalone mode

Set npm-fw as your persistent registry so every install goes through it:

```bash
npm-fw setup-standalone
```

This starts the daemon and runs `npm config set registry` for you. All subsequent `npm install` / `pnpm add` / `yarn add` commands are automatically protected.

> **Note:** The daemon runs as a background process and won't survive a reboot. If installs suddenly fail with connection errors, run `npm-fw doctor` to check and `npm-fw setup-standalone` to restart.

To go back to the default registry:

```bash
npm-fw clean
```

This stops the daemon, removes the registry from `.npmrc`, and clears `~/.yarnrc.yml`.

## How it works

npm-fw runs a local HTTP proxy daemon between your package manager and the npm registry:

```
npm install axios
  → npm client resolves http://localhost:42424/axios
    → npm-fw proxies to https://registry.npmjs.org/axios
      → checks advisories, filters metadata
        → returns safe response
```

**Tarball requests** (`/axios/-/axios-1.0.0.tgz`) — checks the [npm advisory API](https://docs.npmjs.com/cli/v11/commands/npm-audit#bulk-advisory-endpoint) for the specific version. If a known vulnerability exists at or above the configured severity, the download is blocked with a `403` response.

**Metadata requests** (`/axios`) — fetches the full metadata from the upstream registry, then queries the advisory API for all available versions. Versions matching any advisory's vulnerable range are removed from the response. If `latest` is affected, it is recalculated to the newest safe version — so package managers naturally resolve to a safe version instead.

Advisory results are cached in-memory per `package@version`, so repeated requests do not cause additional API calls.

npm-fw uses npm's public Bulk Advisory Endpoint — the same endpoint that `npm audit` and `pnpm audit` use. Under npm's [Open Source Terms](https://docs.npmjs.com/policies/open-source-terms/), use of this API for your own internal security purposes is permitted. Keep total requests under 5 million per month per individual as per [Acceptable Use](https://docs.npmjs.com/policies/open-source-terms/#acceptable-use).

## Features

- **Vulnerability-based blocking** — checks every package against npm's security advisory database before download, including transitive dependencies
- **Metadata filtering** — hides vulnerable versions from registry responses and recalculates `latest` to the newest safe version
- **Severity threshold** — blocks only at or above the configured level (default: `high`)
- **Static blocklist** — block specific packages or versions regardless of advisories
- **Drop-in** — works with npm, pnpm, yarn, and any npm-registry-compatible client
- **Multi-registry** — sets the correct environment variable per package manager, including Yarn Berry's YAML config
- **Zero external service dependencies** — only talks to the public npm registry API

## Supported Package Managers

npm-fw injects the right configuration for each package manager so you don't have to configure anything manually.

| Package manager | Per-command (env var)               | Standalone (persisted config) |
| --------------- | ----------------------------------- | ----------------------------- |
| npm             | `npm_config_registry`               | `.npmrc` (`npm config set`)   |
| pnpm            | `pnpm_config_registry`              | `.npmrc` (`npm config set`)   |
| Yarn v1         | `YARN_REGISTRY`                     | `.npmrc` (`npm config set`)   |
| Yarn Berry (v2+)| `YARN_NPM_REGISTRY_SERVER`          | `~/.yarnrc.yml` (`npmRegistryServer`) |

> **Note:** npm (`npm_config_*`) and pnpm (`pnpm_config_*`) use separate environment variable prefixes since pnpm v11. npm-fw sets both automatically.

Bun and Deno read `.npmrc` natively, so they work out of the box in standalone mode.

## CLI Reference

```
$ npm-fw --help

Usage: npm-fw [options] [command] [command...]

npm registry proxy firewall

Options:
  -V, --version     output the version number
  -h, --help        display help for command

Commands:
  setup-standalone  Set up npm-fw as a persistent registry proxy
  clean             Remove standalone configuration and stop the daemon
  doctor            Check daemon status and npm registry configuration
  daemon-reload     Restart the proxy daemon
  daemon-start      Start the proxy daemon directly (for systemd/launchd)
  daemon-stop       Stop the proxy daemon
```

## Scope and limitations

npm-fw blocks packages with **known security advisories** (CVEs/GHSAs) registered in the [GitHub Advisory Database](https://github.com/advisories).

Advisories typically appear in the npm API within hours of publication, but there is no documented SLA — the delay depends on the advisory source (GitHub-reviewed vs. NVD auto-import) and review pipeline timing. This means a window exists between a malicious package being published and npm-fw being able to block it.

For defense in depth, use pnpm's [`minimalReleaseAge`](https://pnpm.io/npmrc#minimalreleaseage) alongside npm-fw. Advisories generally appear within hours, so setting it to 1440 (24 hours, pnpm's default) or higher covers the gap.

npm-fw does **not**:

- Detect novel/zero-day malware — for that, consider hosted threat intel services
- Perform static analysis of package code

## Similar projects

| Project                                                                       | Approach              | Key difference                                                                                             |
| ----------------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------- |
| [Takumi Guard](https://shisho.dev/docs/t/guard/)                              | Hosted registry proxy | Proprietary threat intelligence with real-time malware detection (GMO Flatt Security). Free for basic use. |
| [Aikido Safe Chain](https://github.com/AikidoSec/safe-chain)                  | Local MITM proxy      | Aikido Intel feed for malware blocking + minimum package age filter. Free, no account needed.              |
| [Socket Firewall](https://github.com/SocketDev/sfw-free)                      | Local wrapper         | Socket's proprietary threat detection. Free tier available.                                                |
| **npm-fw** ([@kimuson/npm-fw](https://www.npmjs.com/package/@kimuson/npm-fw)) | Local HTTP proxy      | Advisory API only. No external service, no telemetry, no API key. MIT licensed.                            |

npm-fw is the lightest option: it relies solely on npm's public advisory database, requires no third-party service, and collects no data. If you need real-time malware detection beyond published advisories, the other projects fill that gap.

## License

MIT
