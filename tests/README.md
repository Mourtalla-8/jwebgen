# Internal Test Harness

Ce dossier contient le harness interne de validation du générateur, indépendant de `projectTest`.

## Scripts

- `tests/golden-check.sh`  
  Vérifie les snapshots “golden” des fichiers générés.

- `tests/integration/run-matrix.sh`  
  Exécute une matrice déterministe avec shims système.

## Fixtures attendues

- `tests/fixtures-current/tomcat/`
- `tests/fixtures-current/wildfly/`

Chaque fixture contient au minimum:
- `.jwebgen/DEV.md`
- `.jwebgen/scripts/build.sh`
- `.jwebgen/scripts/deploy.sh`
- `.jwebgen/scripts/dev.sh`
- `.jwebgen/scripts/watch.sh`

