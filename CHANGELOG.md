# Changelog

SemVer. Newest first. While on `0.x`, minor releases may include breaking CLI changes.

## [0.1.1] - 2026-05-16

- Automated releases with [semantic-release](https://semantic-release.gitbook.io/) on `main` / `next`.
- npm publish via Trusted Publisher and/or `NPM_TOKEN` in GitHub Actions.

## [0.1.0] - 2026-05-15

First public release.

- CLI (flags-only): `--new` / `--create`, `--build`, `--deploy`, `--dev` / `--watch`, `--status`, `--setup`, `--install`, `--migrate`, `--help`.
- Scaffold Jakarta Servlet/JSP WAR projects; tooling under `.jwebgen/` (`.jwebgenrc`, deploy/dev/watch scripts, Node `.mjs` first).
- Tomcat and WildFly deploy paths; LiveReload dev proxy; portable Windows installs for Maven, Tomcat, WildFly.
- CI on Linux, macOS, Windows (Node 22/24); `release:verify` and global-install smoke test.
