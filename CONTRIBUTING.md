# Contributing

```bash
git clone https://github.com/Mourtalla-8/jwebgen
cd jwebgen
nvm use || nvm install
npm ci
```

Before opening a PR:

```bash
npm run check
```

`npm run smoke:global-install` is useful if you've touched install or global CLI behavior.

Touching deploy/dev flows? Run `--new`, `--build`, `--deploy`, `--dev`, `--status` on a machine you have (Linux, macOS, or Windows) with a real or fake server layout.

## Branch flow

| Stage | Branch | What happens |
|-------|--------|----------------|
| Daily work | PRs → `develop` | CI only. |
| Prerelease | PR `develop` → `next` | **semantic-release** → npm dist-tag **`next`**, GitHub prerelease. |
| Stable | PR `next` → `main` | **semantic-release** → npm dist-tag **`latest`**, GitHub release. |

Releases run on push to **`main`** and **`next`** ([`.github/workflows/release.yml`](.github/workflows/release.yml)). Do not push version tags manually.

Use [Conventional Commits](https://www.conventionalcommits.org/) (`fix:`, `feat:`, `feat!:` / `BREAKING CHANGE:`). Squash-merge titles must stay conventional so semantic-release can parse them.

## Maintainers

- **npm publish:** [Trusted Publisher](https://docs.npmjs.com/trusted-publishers) on package `jwebgen` (GitHub Actions, workflow `release.yml`, repo `Mourtalla-8/jwebgen`). Optional fallback: repository secret **`NPM_TOKEN`** (Granular **Automation** token).
- **Version files on `main`:** `package.json` / `CHANGELOG.md` in git may lag behind npm until a maintainer syncs them after a release (no `@semantic-release/git` on protected branches).

## Package layout

Published tarball: `bin/`, `src/`, `LICENSE`, and top-level Markdown listed in `package.json` → `files`. Tests stay in git only.
