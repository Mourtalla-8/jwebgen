# Troubleshooting

## `jwebgen: command not found`

- Ensure global install succeeded:
  - `npm i -g .`
- Check npm global prefix and bin:
  - `npm config get prefix`
  - `ls "$(npm config get prefix)/bin" | grep jwebgen`

If `jwebgen` exists there, add this bin directory to your shell `PATH`:

- zsh:
  - `echo 'export PATH="$(npm config get prefix)/bin:$PATH"' >> ~/.zshrc`
  - `source ~/.zshrc`
- bash:
  - `echo 'export PATH="$(npm config get prefix)/bin:$PATH"' >> ~/.bashrc`
  - `source ~/.bashrc`
- fish:
  - `set -Ux fish_user_paths (npm config get prefix)/bin $fish_user_paths`

No global setup alternative:
- `npx jwebgen --help`

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

## Need to remove deployed app for current project

- Manual cleanup from project root:
  - `jwebgen --clean --deploy`
- Auto cleanup also runs when leaving `jwebgen --dev` (best effort).

## Port already in use (`8080`, `9990`, live reload ports)

- Check process owners:
  - `ss -lntp`
- In `jwebgen --dev`, remediation now supports:
  - stopping the respawning systemd service that reclaims the port
  - validated HTTP port fallback (auto tries 8081..8090 and keeps it only if server/app become reachable)
- You can still force ports manually with:
  - `JWEBGEN_HTTP_PORT=8081 jwebgen --dev`
  - `JWEBGEN_LIVE_PORT=35731 jwebgen --dev`
