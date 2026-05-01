# Internal Test Harness

This directory contains the internal generator validation harness, independent from `projectTest`.

## Scripts

- `tests/golden-check.sh`  
  Verifies golden snapshots of generated files.

- `tests/integration/run-matrix.sh`  
  Runs a deterministic matrix with system shims.

## Expected fixtures

- `tests/fixtures-current/tomcat/`
- `tests/fixtures-current/wildfly/`

Each fixture contains at least:
- `.jwebgen/DEV.md`
- `.jwebgen/scripts/build.sh`
- `.jwebgen/scripts/deploy.sh`
- `.jwebgen/scripts/dev.sh`
- `.jwebgen/scripts/watch.sh`

