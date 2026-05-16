# jwebgen

Small CLI to scaffold Servlet/JSP (Jakarta) web apps and wire up build, deploy, and dev scripts.

**You need:** Node 22.x+ (LTS supported), JDK 11+, Maven. Works on Linux, macOS, Windows. Generated projects lean on Node scripts (`.mjs`); `.sh` wrappers are optional.

## Install

From npm (Node 22.x+):

```bash
npm install -g jwebgen@latest
# prereleases from branch next:
npm install -g jwebgen@next
# or: npx jwebgen@latest --help
```

`npx jwebgen` (without a path) resolves the published package from the registry, not a local clone.

From a clone:

```bash
git clone https://github.com/Mourtalla-8/jwebgen
cd jwebgen
npm ci
npm i -g .
```

Without global install, run the local CLI from the repo root, for example `node bin/jwebgen.js --help` or `npx . --help`.

## New project

```bash
jwebgen --new myapp              # interactive
jwebgen --new myapp --yes        # no prompts (server chosen on first --dev / --deploy)
jwebgen --new myapp --yes --tomcat
```

Tooling sits in `.jwebgen/`; the Maven tree stays normal (`src/`, `pom.xml`, `target/`).

```bash
jwebgen --build
jwebgen --deploy
jwebgen --dev          # or --watch
jwebgen --status
```

Full flag list: `jwebgen --help`.

## Setup / installs

`jwebgen --setup` checks Java, Maven, Tomcat/WildFly (real probes where it can). `--setup --dry-run` only prints what it would do. Java installs go through `--setup`, not `--install`.

`jwebgen --install maven|tomcat|wildfly` is for non-interactive tooling installs (mainly Windows portable flows).

## Paths and ports

Set `TOMCAT_HOME` / `CATALINA_HOME` and `WILDFLY_HOME` (or `WILDFLY_DEPLOYMENTS`) if your layout isn’t the usual package or Homebrew paths. `JWEBGEN_HTTP_PORT` changes the app URL in `--status` and scripts.

Two services on `:8080` will bite you—stop one or change the port.

## Smoke test (from repo)

```bash
npm ci
npm run smoke:global-install
```

## Troubleshooting & contributing

[TROUBLESHOOTING.md](TROUBLESHOOTING.md) · [CONTRIBUTING.md](CONTRIBUTING.md)

Releases are automated with [semantic-release](https://semantic-release.gitbook.io/) on push to **`main`** (stable, npm `latest`) and **`next`** (prereleases, npm `next`). Use [Conventional Commits](https://www.conventionalcommits.org/); workflow: `develop` → PR → `next` → PR → `main`. See [CONTRIBUTING.md](CONTRIBUTING.md). Workflows live under `.github/workflows/`.
