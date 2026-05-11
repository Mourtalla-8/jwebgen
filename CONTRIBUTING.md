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

`npm run smoke:global-install` is useful if you touched install or global CLI behavior.

Touching deploy/dev flows? Run `--new`, `--build`, `--deploy`, `--dev`, `--status` on a machine you have (Linux, macOS, or Windows) with a real or fake server layout.

Target branch is usually `develop`; follow whatever branch rules the repo uses. Release: bump version + `CHANGELOG.md`, tag on `main` when that’s the project convention.

The npm tarball is only `bin/`, `src/`, and the top-level markdown docs—tests stay in git, not in `npm pack`.
