# jwebgen

CLI generator for Java web projects (Servlet/JSP) with helper scripts for build, deploy and dev loops.

## Quickstart (5 minutes)

### Prerequisites

- Node.js 18.19+ (required to run the `jwebgen` CLI)
- Java JDK 11+
- Maven
- Linux is the primary supported runtime for generated deploy/dev scripts (systemd-based flow)

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
jwebgen --new mon-webapp
# fast (no prompts):
jwebgen --new mon-webapp --yes --tomcat
```

Inside generated project:

```bash
./scripts/build.sh
./scripts/deploy.sh
./scripts/dev.sh
```

## Supported usage model

- `create`, generation and project scaffolding: requires Node + Java + Maven.
- Generated `build.sh`: requires Java + Maven.
- Generated `dev.sh` and `watch.sh`: require Node and target app server tooling.

## Migration (v2 flags-only CLI)

- `jwebgen dev` → `jwebgen --dev` (or `--watch`)
- `jwebgen create` → `jwebgen --new <name>`
- `jwebgen help` → `jwebgen --help` (or `jwebgen`)
- Existing projects: run `jwebgen --migrate` to regenerate scripts and create `.jwebgenrc`.

## Machine compatibility

- Official target: Linux with systemd (best support for generated deploy/dev scripts).
- Best effort: macOS/Windows when manually adapting server setup and path conventions.
- Minimum toolchain:
  - Node.js 18.19+ for CLI and dev/watch
  - Java JDK 11+
  - Maven

## New machine checklist

```bash
node -v
javac -version
mvn -version
npm ci
npm i -g .
jwebgen help
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
