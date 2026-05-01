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

## Quality gate

Before opening a PR:

```bash
npm run check
```

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
