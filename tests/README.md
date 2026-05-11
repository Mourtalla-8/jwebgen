# Tests

Automated checks for the CLI and generated scripts.

## Commands

| Command | Role |
|--------|------|
| `npm run test:unit` | Unit tests |
| `npm run test` | Unit + golden fixtures + integration matrix |
| `bash ./tests/golden-check.sh` | Syntax checks on fixture trees |
| `bash ./tests/integration/template-asserts.sh` | Template string assertions |
| `bash ./tests/smoke-generated-project.sh` | End-to-end smoke (needs Java, Maven, Node) |
| `npm run smoke:global-install` | Global `npm i -g .` smoke |

## Fixtures

Golden snapshots live under `tests/fixtures-current/tomcat/` and `tests/fixtures-current/wildfly/` (each includes `.jwebgen/scripts/*.sh` and `.jwebgen/DEV.md`).
