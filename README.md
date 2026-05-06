# jwebgen

CLI generator for Java web projects (Servlet/JSP) with helper scripts for build, deploy and dev loops.

## Quickstart (5 minutes)

### Prerequisites

- Node.js 20.12+ (required to run the `jwebgen` CLI and the generated `*.mjs` scripts)
- Java JDK 11+
- Maven
- Tier-1 targets: Linux, macOS, and Windows — generated projects use **Node-first** scripts (`build.mjs`, `deploy.mjs`, `dev.mjs`, `watch.mjs`); optional `.sh` files remain convenience wrappers where applicable

### Install globally from source

```bash
git clone https://github.com/Mourtalla-8/jwebgen
cd jwebgen
npm ci
npm i -g .
```

Then verify:

```bash
jwebgen --help
jwebgen --version
jwebgen --setup
# or just:
jwebgen
```

### Quick test without global install (recommended first run)

Use this mode if you want zero shell/PATH setup:

```bash
git clone https://github.com/Mourtalla-8/jwebgen
cd jwebgen
npm ci
npx jwebgen --help
```

### First project

```bash
jwebgen --new my-webapp
# fast (no prompts):
jwebgen --new my-webapp --yes --tomcat
# fast + deferred server choice:
jwebgen --new my-webapp --yes
```

With `--yes` and no server flag, jwebgen does not choose Tomcat/WildFly automatically.
The first `jwebgen --dev` or `jwebgen --deploy` will prompt once and save your choice.

Inside a generated project, jwebgen tooling lives under `.jwebgen/` (scripts in `.jwebgen/scripts/`). The Maven root stays a normal webapp layout (`src/`, `pom.xml`, optional `.gitignore`, `target/` after build).

```bash
./.jwebgen/scripts/build.sh
./.jwebgen/scripts/deploy.sh
./.jwebgen/scripts/dev.sh
jwebgen --clean --deploy
```

`jwebgen --dev` now auto-cleans the deployed app for the current project when dev stops.

## Supported usage model

- `create`, generation and project scaffolding: requires Node + Java + Maven.
- Generated `.jwebgen/scripts/build.sh`: requires Java + Maven.
- Generated `.jwebgen/scripts/dev.sh` and `watch.sh`: require Node and target app server tooling.

## Supported commands (current baseline)

- Lifecycle:
  - `jwebgen --help`
  - `jwebgen --version`
  - `jwebgen --setup`
  - `jwebgen --update` (prints safe update guidance)
  - `jwebgen --uninstall` (prints safe uninstall guidance)
- Project:
  - `jwebgen --new <name> [--yes] [--tomcat|--wildfly]`
  - `jwebgen --status`
  - `jwebgen --build`
  - `jwebgen --deploy`
  - `jwebgen --dev` / `jwebgen --watch`
  - `jwebgen --clean` and `jwebgen --clean --deploy`
  - `jwebgen --servlet <Name>`
  - `jwebgen --jsp <name>`
  - `jwebgen --migrate`

`--servlet` and `--jsp` are Node-first on all tier-1 OS when generated `.mjs` scripts are present.

## Setup assistant behavior

- `jwebgen --setup` in interactive terminals (TTY):
  - runs diagnostics,
  - proposes safe actions per OS,
  - asks for explicit confirmation before running any suggested install command.
- `jwebgen --setup --dry-run`:
  - previews setup actions without executing commands,
  - keeps PATH handling as guidance-only.
- `jwebgen --setup` in non-interactive mode (CI/script):
  - diagnostics only (no prompt, no command execution).
- PATH management stays non-destructive:
  - jwebgen only proposes shell/PowerShell snippets,
  - it does not edit your shell config files automatically.
  - rollback guidance is printed for session-scoped PATH changes.

## Cross-platform install validation protocol

Use this protocol to validate the documented global install flow on Linux/macOS/Windows:

```bash
npm ci
npm run smoke:global-install
```

This validates:

- global install (`npm i -g .`) in an isolated npm prefix,
- global shim execution (`jwebgen --help`),
- setup diagnostics preview (`jwebgen --setup --dry-run`),
- CLI generation/status smoke (`--new`, `--servlet`, `--jsp`, `--status`).

## Port conflicts on the same machine

If Tomcat, WildFly, or another HTTP service is active on port `8080` at the same time, dev/deploy can fail.

- Keep only one HTTP server active on `8080` for the current project.
- Or run with another app port:
  - `JWEBGEN_HTTP_PORT=8081 jwebgen --dev`
- Use `jwebgen --status` to confirm the selected target server before starting dev.

## Migration (v2 flags-only CLI)

- `jwebgen --dev` (or `--watch`)
- `jwebgen --new <name>`
- `jwebgen --help` (or `jwebgen`)
- Projects using the current layout: run `jwebgen --migrate` to regenerate `.jwebgen/scripts` and refresh `.jwebgen/.jwebgenrc` as needed.

## Machine compatibility

- **Tier-1:** Linux, macOS, and Windows for CLI + generated Node entrypoints.
- Set Tomcat/WildFly paths yourself when not using Linux distro defaults (`jwebgen --status` reflects configured paths and `JWEBGEN_HTTP_PORT` for URLs).
- Minimum toolchain:
  - Node.js 20.12+ for CLI and dev/watch
  - Java JDK 11+
  - Maven

## New machine checklist

```bash
node -v
javac -version
mvn -version
npm ci
npm i -g .
jwebgen --setup
jwebgen --help
```

## Global install alternatives

- Local dev global link:
  - `npm i -g .`
- Direct from GitHub (once public):
  - `npm i -g github.com/Mourtalla-8/jwebgen`

If `jwebgen` is not found after global install, your npm global bin is not in `PATH` yet.
See `TROUBLESHOOTING.md` for shell-specific fixes.

## CI and releases

- CI workflow: `.github/workflows/ci.yml`
- Release workflow: `.github/workflows/release.yml`
- Tag format for release: `vX.Y.Z`
- Optional npm publish secret: `NPM_TOKEN` (if absent, release still succeeds on GitHub assets only)

### Release checklist

```bash
npm run check
git tag vX.Y.Z
git push origin vX.Y.Z
```

## Troubleshooting

See `TROUBLESHOOTING.md`.

## Contributing

See `CONTRIBUTING.md`.
