## [0.1.1-next.1](https://github.com/Mourtalla-8/jwebgen/compare/v0.1.0...v0.1.1-next.1) (2026-05-15)


### Bug Fixes

* **ci:** automate npm releases with semantic-release ([c1f5e7e](https://github.com/Mourtalla-8/jwebgen/commit/c1f5e7eb4c6c8b416ca55a5a529daa4c9c48f684))

# Changelog

SemVer. Newest first. While on `0.x`, minor releases may include breaking CLI changes.

## [0.1.0] - 2026-05-15

First public release.

- CLI (flags-only): `--new` / `--create`, `--build`, `--deploy`, `--dev` / `--watch`, `--status`, `--setup`, `--install`, `--migrate`, `--help`.
- Scaffold Jakarta Servlet/JSP WAR projects; tooling under `.jwebgen/` (`.jwebgenrc`, deploy/dev/watch scripts, Node `.mjs` first).
- Tomcat and WildFly deploy paths; LiveReload dev proxy; portable Windows installs for Maven, Tomcat, WildFly.
- CI on Linux, macOS, Windows (Node 22/24); `release:verify` and global-install smoke test.
