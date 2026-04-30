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
# fast + deferred server choice:
jwebgen --new mon-webapp --yes
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
