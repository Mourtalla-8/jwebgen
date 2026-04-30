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

## Release process

1. Ensure `package.json` version and `CHANGELOG.md` are aligned.
2. Push changes to `main`.
3. Create and push a SemVer tag:

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

4. GitHub Release workflow runs automatically on tag push.

## Optional npm publication

- Configure repository secret `NPM_TOKEN` to enable automatic `npm publish`.
- Without `NPM_TOKEN`, release still succeeds with GitHub release assets only.
