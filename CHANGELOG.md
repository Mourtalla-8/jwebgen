# Changelog

All notable changes to this project should be documented in this file.

This project follows Semantic Versioning.

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
