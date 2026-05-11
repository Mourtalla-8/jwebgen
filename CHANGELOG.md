# Changelog

SemVer. Newest first.

## [2.2.1] - 2026-05-04

- Generated dev/deploy: Node `.mjs` first; Linux Tomcat checks use `systemctl` only on Linux.
- Deploy helpers: Linux default paths only on Linux; WildFly deploy paths follow resolved `deployments`.
- `--status`: URL respects `JWEBGEN_HTTP_PORT`; running/stopped via `pgrep` on Unix, Java process probe on Windows where possible.
- CI: macOS/Windows also run golden fixtures, template asserts, `node --check` on generated `.mjs`; all OS run `smoke-generated-project.sh`.
- Tests: `pgrep` exit codes covered for `--status`.

## [2.2.0] - 2026-05-04

- Dev/watch: LiveReload and state under `.jwebgen/`; proxy keeps `Host`, strips heavy CSP in dev, handles HEAD/204/304; worker grace from `JWEBGEN_WORKER_RESTART_GRACE_MS` (invalid → 900 ms).
- Deploy: Tomcat `context.xml` reload hints; WildFly honors `JWEBGEN_HTTP_PORT`; fewer redundant `.dodeploy` touches; cleanup removes marker set.
- CLI: `pom.xml` app name ignores `<profiles>` when reading top-level `<build>` / `<finalName>`; `--cleanup-dev` shows stderr when scripts don’t signal sudo.
- LiveReload client: cache-bust query without embedding `Date.now()` in the snippet.

## [2.1.0] - 2026-04-30

- Layout: jwebgen files under `.jwebgen/`; Maven root stays a normal WAR project.
- `findProjectRoot` requires `pom.xml` + `.jwebgen/scripts/watch.sh` (no more root `scripts/` fallback).

## [2.0.0] - 2026-04-30

- **Breaking:** flags-only CLI; bare `jwebgen` prints help. Create with `--new` / `--create` (`--yes` for non-interactive).
- `.jwebgen/.jwebgenrc` stores `JWEBGEN_SERVER_TARGET`; prompt on first `--dev` / `--deploy` if unset.
- `deploy.sh` delegates to `deploy-tomcat.sh` / `deploy-wildfly.sh`.
- Existing trees: `jwebgen --migrate`.

## [1.0.4] - 2026-04-29

- More CLI tests (dispatch, root discovery, unknown command).

## [1.0.3] - 2026-04-29

- ESLint in default checks and CI; more input-validation tests; compatibility docs.

## [1.0.2] - 2026-04-29

- Version metadata aligned for patch release.

## [1.0.1] - 2026-04-29

- CI/release hardening; tests run without relying on `rg`; npm publish optional without token.

## [1.0.0] - 2026-04-29

- First public shape of the generator and test harness.
