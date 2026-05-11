# Contributing to jwebgen

## Setup

```bash
git clone https://github.com/Mourtalla-8/jwebgen
cd jwebgen
nvm use || nvm install
npm ci
```

Optional global install for manual tries:

```bash
npm i -g .
jwebgen --help
```

## Verify before a PR

```bash
npm run check
```

Optional:

```bash
npm run smoke:global-install
```

## Manual checks

After changes to CLI, deploy, or dev flows, exercise `jwebgen --new`, `--build`, `--deploy`, `--dev`, `--watch`, and `--status` on your OS (Linux, macOS, or Windows) with a real or stub Tomcat/WildFly layout as appropriate.

## Branches and releases

- Use pull requests against the integration branch configured for this repository (typically `develop`).
- Releases: bump `package.json` and `CHANGELOG.md`, tag SemVer on `main`, and follow the repository’s release workflow.

## npm publish

Publishing from CI may require an `NPM_TOKEN` secret; without it, GitHub releases can still ship the packed tarball.

The package tarball is runtime-only (`bin/`, `src/`, top-level docs). Automated tests stay in the repository, not in `npm pack` output.
