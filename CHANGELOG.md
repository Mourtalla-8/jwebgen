# Changelog

All notable changes to this project should be documented in this file.

This project follows Semantic Versioning.

## [2.2.1] - 2026-05-04

### Changed (generated projects)

- **Dev worker:** `build`/`deploy` steps prefer `*.mjs` when present; Tomcat engine checks use `systemctl` on Linux only (no `bash`); non-Linux hosts skip `systemctl` and rely on HTTP / port diagnostics.
- **Deploy (Node):** Tomcat and WildFly Linux convenience defaults apply only on `process.platform === 'linux'`; WildFly deploy uses a resolved deployments directory for `mkdir` and WAR paths.

### Changed (CLI)

- **`--status`:** Application URLs honor `JWEBGEN_HTTP_PORT` (env, then `.jwebgen/.jwebgenrc`) instead of always `8080`; server running/stopped uses `pgrep` on Unix and a Java command-line probe on Windows where possible.
- **Defaults:** Tomcat/WildFly implicit path hints match deploy scripts (Linux-only defaults; macOS/Windows require explicit `TOMCAT_HOME` / `WILDFLY_HOME` or deployments path).

### Changed (tooling)

- **CI:** macOS and Windows run golden fixture checks, template assertions, and `node --check` on generated `*.mjs` entrypoints in addition to lint and unit tests.

## [2.2.0] - 2026-05-04

### Changed (generated projects)

- **Dev / watch:** LiveReload tooling and scripts remain under `.jwebgen/`; the dev proxy preserves the browser `Host` header (`accept-encoding` still forced to `identity`); injected HTML drops restrictive CSP in dev; HEAD / 204 / 304 responses are streamed without injection; injected HTML is marked non-cacheable; worker restart grace (`JWEBGEN_WORKER_RESTART_GRACE_MS`) accepts only positive integers (invalid values fall back to 900 ms).
- **Deploy:** Tomcat deployment refreshes `META-INF/context.xml` reload semantics (`reloadable`, flexible quoting); WildFly respects `JWEBGEN_HTTP_PORT` for probes and URLs; unchanged-WAR fast path skips redundant `.dodeploy` when the app is healthy; WildFly `--cleanup-dev` removes and verifies the full set of deployment marker files.
- **CLI:** Application name from `pom.xml` ignores `<profiles>` blocks when resolving the top-level `<build>` / `<finalName>` and primary `<artifactId>`; `--cleanup-dev` failures surface captured stderr unless the deploy script explicitly signals `deploy_sudo_required`.

### Changed (LiveReload client template)

- Reload via URL refresh uses `_jwg` query cache-busting without relying on `Date.now()` in the published client string.

### Fixed

- Cleanup/deploy diagnostics (sudo hints gated on marker output); Tomcat context.xml sed escaping in generated scripts; assorted WildFly and proxy edge cases from review.

## [2.1.0] - 2026-04-30

### Changed (generated projects)

- **Layout:** Maven project root contains only standard WAR app files (`src/`, `pom.xml`, optional `.gitignore`, and `target/` after a build). Everything jwebgen-specific (shell scripts, generated `README.md` / `DEV.md`, `.jwebgenrc`, dev session files) lives under **`.jwebgen/`** — scripts in `.jwebgen/scripts/`, server config in `.jwebgen/.jwebgenrc`.
- **CLI detection:** `findProjectRoot` requires `pom.xml` and `.jwebgen/scripts/watch.sh`. Projects that still keep `scripts/` at the repository root are no longer picked up as jwebgen projects.

## [2.0.0] - 2026-04-30

### Breaking

- Switch to a flags-only CLI (subcommands removed). `jwebgen` with no args now prints help.
- Project creation moved to `--new/--create` (with optional `--yes` fast mode).

### Added

- Per-project server configuration file: `.jwebgenrc` (`JWEBGEN_SERVER_TARGET=tomcat|wildfly`).
- Server selection prompt on `--dev/--deploy` when target isn’t configured (interactive terminals only).
- `deploy.sh` is now a selector that dispatches to:
  - `.jwebgen/scripts/deploy-tomcat.sh`
  - `.jwebgen/scripts/deploy-wildfly.sh`

### Migration

- `jwebgen --dev` (or `--watch`)
- `jwebgen --new <name>` (fast: `--yes`)
- `jwebgen --help` (or `jwebgen`)
- For existing projects, run `jwebgen --migrate` to regenerate scripts and create `.jwebgenrc`.

## [1.0.4] - 2026-04-29

- Expand CLI regression coverage for dispatch, root discovery, and unknown-command exit behavior.
- Remove deprecated `runCli.impl` shim and simplify CLI deprecation path.
- Consolidate final hardening wave with stable lint/test/CI gates.

## [1.0.3] - 2026-04-29

- Add ESLint static checks into the default quality gate and CI workflow.
- Extend unit coverage for Java/tooling input validation edge cases.
- Document official compatibility matrix and new-machine onboarding checklist.

## [1.0.2] - 2026-04-29

- Align package metadata with the next patch release tag.
- Keep release process consistent across version, changelog, and GitHub release flow.

## [1.0.1] - 2026-04-29

- Stabilize GitHub Actions for CI and release workflows.
- Make test tooling portable on GitHub runners (remove hard dependency on `rg`).
- Improve release pipeline behavior when `NPM_TOKEN` is not configured.

## [1.0.0] - 2026-04-29

- Baseline CLI generator and template/test harness.
