# Troubleshooting

## `jwebgen: command not found`

- Ensure global install succeeded:
  - `npm i -g .`
- Check npm global bin is on `PATH`:
  - `npm bin -g`

## Node version error

- `jwebgen` requires Node 18.19+.
- Check:
  - `node -v`
- Upgrade and retry.

## Java or Maven missing

- Check:
  - `javac -version`
  - `mvn -version`
- Install missing tool and rerun.

## Deploy/dev scripts fail on non-Linux

- Generated scripts target Linux/systemd primarily.
- On macOS/Windows, run app server manually and adapt server paths/env vars.

## Permission denied during deploy

- Some deploy operations require writing to system paths.
- Refresh sudo session:
  - `sudo -v`
- Retry deployment.

## Port already in use (`8080`, `9990`, live reload ports)

- Check process owners:
  - `ss -lntp`
- Stop conflicting process or change environment ports (`JWEBGEN_HTTP_PORT`, `JWEBGEN_LIVE_PORT`).
