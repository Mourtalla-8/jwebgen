# Contributing to jwebgen

## Local setup

```bash
git clone https://github.com/Mourtalla-8/jwebgen
cd jwebgen
nvm use || nvm install
npm ci
```

Optional global CLI for local manual testing:

```bash
npm i -g .
jwebgen --help
```

Recommended reproducible global-install validation (all OS):

```bash
npm run smoke:global-install
```

## Quality gate

Before opening a PR:

```bash
npm run check
```

## Cross-platform manual validation

After behavioral changes around CLI scripts, deployments, or dev mode, sanity-check when you have access:

- **Linux** — `jwebgen --new` (or migrate an older tree), `--build`, `--deploy` (Tomcat/WildFly with and without write access to server dirs), `--dev`, `--watch`, `--status`.
- **Windows** — Same commands where applicable; confirm `--status` and dev dashboard hints mention Windows-oriented steps (no `systemctl`). Verify clear errors when Maven or Tomcat/WildFly paths are unset.
- **Windows checklist subset (non-flaky, PR-ready)** — `jwebgen --setup --dry-run`, `jwebgen --new --yes`, `jwebgen --servlet`, `jwebgen --jsp`, `jwebgen --status` with fake `TOMCAT_HOME`.
- **macOS** — Same minimal subset as Linux where you use Tomcat/WildFly locally; systemd-specific messages should not appear as the primary hint.

Automated checks cover templates and core logic; the above is intentionally short-lived manual coverage.

## Branch model (GitFlow)

- Long-lived branches:
  - `main`: production-ready history only
  - `develop`: integration branch for upcoming release
- Working branches:
  - `feature/<topic>` from `develop`
  - `hotfix/<topic>` from `main`
  - `release/<x.y.z>` from `develop`
- Branch protections are enabled on `main` and `develop`:
  - direct pushes disabled
  - pull request required
  - at least 1 approval required

Typical feature flow:

```bash
git checkout develop
git pull
git checkout -b feature/my-change
# ...work...
npm run check
git push -u origin feature/my-change
# open PR: feature/my-change -> develop
```

## Release process

1. Ensure `package.json` version and `CHANGELOG.md` are aligned on `develop`.
2. Create `release/<x.y.z>` from `develop` and run final checks.
3. Open PR `release/<x.y.z>` -> `main` and merge.
4. Tag the merge commit on `main` and push the SemVer tag:

```bash
git checkout main
git pull
git tag vX.Y.Z
git push origin vX.Y.Z
```

5. GitHub Release workflow runs automatically on tag push.

## Optional npm publication

- Configure repository secret `NPM_TOKEN` to enable automatic `npm publish`.
- Without `NPM_TOKEN`, release still succeeds with GitHub release assets only.
