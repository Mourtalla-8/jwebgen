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

semantic-release runs on push to **`main`** / **`next`** only (see `.github/workflows/release.yml`). Tags and GitHub Releases are created from CI; **do not push version tags manually.** The checkout used for publishing gets an updated `CHANGELOG.md` and `package.json` **inside the npm tarball only**—the copy on the default branch may lag until someone merges doc updates.

## Conventional Commits (required for releases)

Releases are driven by [semantic-release](https://semantic-release.gitbook.io/) from commit messages ([Conventional Commits](https://www.conventionalcommits.org/)). Examples:

- `fix: correct WildFly probe on Linux` → patch bump on `0.x` (e.g. `0.1.0` → `0.1.1`)
- `feat: add --foo flag` → minor bump on `0.x` (e.g. `0.1.0` → `0.2.0`)
- `feat!: remove old flag` or body `BREAKING CHANGE:` → minor bump on `0.x` (per SemVer for 0.y.z)
- `chore(release): ...` → used by the bot only; other `chore:` / `docs:` / `test:` commits often produce **no** release unless they include a releasable type

Squash merges: set the **squash commit title** to a valid conventional message so the merged commit is analyzable.

## GitHub Actions secrets (maintainers)

### `NPM_TOKEN` (required)

CI publishes with **npm CLI**. npm requires either **2FA** on your account plus a capable token, or a token that can publish without an interactive OTP.

- **Recommended:** create a **Granular Access Token** on [npmjs.com](https://www.npmjs.com/) → *Access tokens* → *Generate new token* → type **Automation**, with **Read and write** on package `jwebgen` (or all packages). Automation tokens can publish when 2FA is enabled on the account.
- **Classic:** token type **Automation** (legacy) also works for non-interactive publish.

If the workflow logs show `403 ... Two-factor authentication or granular access token with bypass 2fa`, replace `NPM_TOKEN` with an **Automation**-class token.

If the logs show `403 ... You may not perform that action with these credentials`:

- Granular token: confirm **Packages and scopes** includes **`jwebgen`** with **Read and write** (not read-only).
- Confirm the npm **user/org** tied to this token **owns or can publish** `jwebgen`. For the **first** npm publish, connect with `npm login` locally as that user once, or publish manually so the name is associated with your account (`npm publish --access public` from a clean checkout). Tokens cannot claim a package name on behalf of a user who lacks publish rights.

### Optional: version commits on the branch

This repository does **not** use `@semantic-release/git`, so Actions do **not** push a `chore(release)` commit to `main` / `next` (avoids failures on **protected branches** that require PRs). If you want release commits on the branch, add `@semantic-release/git` back in [`.releaserc.json`](.releaserc.json) and grant the releaser permission to bypass branch rules (e.g. allow **GitHub Actions** to bypass for `main` and `next`, or use a PAT with `contents: write` as `GITHUB_TOKEN` for the Release job).

## npm package layout

The npm tarball is only `bin/`, `src/`, `LICENSE`, and the top-level Markdown docs listed in `package.json` → `files`—tests stay in git, not in `npm pack`.
