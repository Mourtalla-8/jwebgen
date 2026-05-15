# Tests

| Command | What it runs |
|---------|----------------|
| `npm run test:unit` | Unit tests |
| `npm run test` | Unit + golden + integration matrix |
| `bash ./tests/golden-check.sh` | Fixture shell syntax |
| `bash ./tests/integration/template-asserts.sh` | Template strings |
| `bash ./tests/smoke-generated-project.sh` | Create + smoke (needs JDK, Maven) |
| `npm run smoke:global-install` | Global `npm i -g .` smoke |

Fixtures: `tests/fixtures-current/tomcat/` and `wildfly/` (`.jwebgen/scripts/*.sh`, `.jwebgen/DEV.md`).
