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
- `jwebgen --setup` can also print PATH guidance snippets (non-destructive, no shell file edits).
- Rollback:
  - session changes: close/reopen terminal (or restore previous PATH value),
  - persistent changes: remove the PATH line you added manually in shell config.

No global setup alternative:
- `npx jwebgen --help`

## Node version error

- `jwebgen` requires Node 20.12+ (matches the current `@clack` UI stack).
- Check:
  - `node -v`
- Upgrade and retry.

## Java or Maven missing

- Check:
  - `javac -version`
  - `mvn -version`
- Install missing tool and rerun.
- Quick diagnostics:
  - `jwebgen --setup`
- Interactive setup assistant:
  - In TTY mode, `jwebgen --setup` can propose and run safe install commands only after explicit confirmation.
- Dry-run preview:
  - `jwebgen --setup --dry-run` previews actions without running install commands.
- Non-interactive mode (CI/scripts):
  - `jwebgen --setup` remains diagnostics-only.

## Deploy/dev scripts fail on non-Linux

- jwebgen uses generated Node entrypoints first (`*.mjs`) when present.
- On macOS/Windows, configure server paths explicitly:
  - Tomcat: `TOMCAT_HOME` / `TOMCAT10` / `CATALINA_HOME`
  - WildFly: `WILDFLY_HOME` or `WILDFLY_DEPLOYMENTS`
- Use `jwebgen --status` to confirm target resolution and app URL.

## Permission denied during deploy

- Some deploy operations require writing to system paths.
- Refresh sudo session:
  - `sudo -v`
- Retry deployment.

## Need to remove deployed app for current project

- Manual cleanup from project root:
  - `jwebgen --clean --deploy`
- Auto cleanup also runs when leaving `jwebgen --dev` (best effort).

## Update or uninstall jwebgen safely

- Update guidance:
  - `jwebgen --update`
- Uninstall guidance:
  - `jwebgen --uninstall`

## Port already in use (`8080`, `9990`, live reload ports)

- Typical case:
  - Tomcat + WildFly + another local HTTP service are active on the same machine.
  - More than one service tries to bind `:8080`.
- Check process owners:
  - `ss -lntp`
- Keep only one HTTP server active on `8080` for the current project.
- In `jwebgen --dev`, remediation now supports:
  - stopping the respawning systemd service that reclaims the port
  - validated HTTP port fallback (auto tries 8081..8090 and keeps it only if server/app become reachable)
- You can still force ports manually with:
  - `JWEBGEN_HTTP_PORT=8081 jwebgen --dev`
  - `JWEBGEN_LIVE_PORT=35731 jwebgen --dev`
