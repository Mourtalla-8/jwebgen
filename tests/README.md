# Internal Test Harness

This directory contains the internal generator validation harness, independent from `projectTest`.

## Scripts

- `tests/golden-check.sh`  
  Verifies golden snapshots of generated files.

- `tests/integration/run-matrix.sh`  
  Runs a deterministic matrix with system shims.

## Cross-platform baseline protocol

Run this baseline before merging CLI/script changes:

1. `npm ci`
2. `npm run lint`
3. `npm run test:unit`
4. `bash ./tests/golden-check.sh`
5. `bash ./tests/integration/template-asserts.sh`
6. `bash ./tests/smoke-generated-project.sh`
7. `node bin/jwebgen.js --setup`
8. `node bin/jwebgen.js --setup --dry-run`

Setup/PATH safety expectations in baseline:

- non-interactive `--setup` remains diagnostics-only (no interactive prompt),
- `--setup --dry-run` previews actions without command execution,
- PATH guidance snippets are non-destructive and include rollback hints.

For Windows-specific regressions, also verify on Windows native shell:

- `jwebgen --new smokeapp --yes`
- `jwebgen --servlet HelloServlet`
- `jwebgen --jsp home`

## Expected fixtures

- `tests/fixtures-current/tomcat/`
- `tests/fixtures-current/wildfly/`

Each fixture contains at least:
- `.jwebgen/DEV.md`
- `.jwebgen/scripts/build.sh`
- `.jwebgen/scripts/deploy.sh`
- `.jwebgen/scripts/dev.sh`
- `.jwebgen/scripts/watch.sh`

