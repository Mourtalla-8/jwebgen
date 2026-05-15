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
| Daily work | PRs → `develop` | CI runs (no npm release). |
| Prerelease | PR `develop` → `next` | On merge to `next`, **semantic-release** publishes to npm with dist-tag **`next`** and creates a GitHub **prerelease**. |
| Stable | PR `next` → `main` | On merge to `main`, **semantic-release** publishes to npm as **`latest`** and creates a GitHub **release**. |

Do not push release tags manually; versions and `CHANGELOG.md` are updated by the release bot.

## Conventional Commits (required for releases)

Releases are driven by [semantic-release](https://semantic-release.gitbook.io/) from commit messages ([Conventional Commits](https://www.conventionalcommits.org/)). Examples:

- `fix: correct WildFly probe on Linux` → patch bump on `0.x` (e.g. `0.1.0` → `0.1.1`)
- `feat: add --foo flag` → minor bump on `0.x` (e.g. `0.1.0` → `0.2.0`)
- `feat!: remove old flag` or body `BREAKING CHANGE:` → minor bump on `0.x` (per SemVer for 0.y.z)
- `chore(release): ...` → used by the bot only; other `chore:` / `docs:` / `test:` commits often produce **no** release unless they include a releasable type

Squash merges: set the **squash commit title** to a valid conventional message so the merged commit is analyzable.

## GitHub settings (maintainers)

semantic-release pushes a version commit (`package.json`, `package-lock.json`, `CHANGELOG.md`) with `[skip ci]` in the message.

On **protected** `main` and `next`, allow **GitHub Actions** (or `github-actions[bot]`) to **bypass** rules for those branches, or the npm publish may succeed while the git push of the release commit fails. Alternatively use a PAT with `contents: write` as `GITHUB_TOKEN` / `GH_TOKEN` in a custom setup (not configured in this repo by default).

Ensure **Actions** repository secret **`NPM_TOKEN`** is set (npm automation or publish token) so the Release workflow can run `npm publish`.

## npm package layout

The npm tarball is only `bin/`, `src/`, `LICENSE`, and the top-level Markdown docs listed in `package.json` → `files`—tests stay in git, not in `npm pack`.
