# Troubleshooting

## `jwebgen: command not found`

- Ensure global install succeeded:
  - `npm i -g .`
- Check npm global prefix and bin:
  - `npm config get prefix`
  - `ls "$(npm config get prefix)/bin" | grep jwebgen`

If `jwebgen` exists there, add this bin directory to your shell `PATH`:

- Session-only (safe preview):
  - `export PATH="$(npm config get prefix)/bin:$PATH"`
  - PowerShell: `$env:Path = "$(npm config get prefix);$env:Path"`
- Persistent:
  - add the same line manually in your shell startup file (`~/.zshrc`, `~/.bashrc`, etc.),
  - PowerShell profile option: add the same `$env:Path = ...` line to your PowerShell profile,
  - Windows persistent (PowerShell/.NET): `[Environment]::SetEnvironmentVariable("Path", "$(npm config get prefix);" + [Environment]::GetEnvironmentVariable("Path","User"), "User")`,
  - then open a new terminal session.
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
  - `mvn --version` (setup expects a real **Apache Maven** install; a different `mvn` on `PATH` will fail the check)
- Install missing tool and rerun.
- Quick diagnostics:
  - `jwebgen --setup`
- Interactive setup assistant:
  - In TTY mode, `jwebgen --setup` can propose and run safe install commands only after explicit confirmation.
- Dry-run preview:
  - `jwebgen --setup --dry-run` previews actions without running install commands.
- Non-interactive mode (CI/scripts):
  - `jwebgen --setup` remains diagnostics-only.
- Full disposable global-install validation:
  - `npm run smoke:global-install`

## Deploy/dev scripts fail on non-Linux

- jwebgen uses generated Node entrypoints first (`*.mjs`) when present.
- Configure server paths when not using defaults:
  - Tomcat: `TOMCAT_HOME` / `TOMCAT10` / `CATALINA_HOME` must point at the **real** install (directory with `lib/catalina.jar`, runnable `bin/catalina.*`).
  - WildFly: `WILDFLY_HOME` or `WILDFLY_DEPLOYMENTS` (must include `jboss-modules.jar` at the product root when using `WILDFLY_HOME`).
- **macOS:** if you install **Tomcat** / **WildFly** via Homebrew (`tomcat@10`, `wildfly-as`), jwebgen may auto-detect typical `libexec` paths when env vars are unset.
- **Windows:** align env vars with what you use for `jwebgen server` and deploy scripts; portable installs are supported via `--install` where documented.
- Use `jwebgen --status` to confirm target resolution and app URL.

## Setup reports Tomcat/WildFly missing but “something” is installed

- Empty directories (e.g. only `webapps/`) are **not** treated as installs.
- Tomcat must pass a `catalina version`-style check from the resolved `CATALINA_HOME` (needs working Java).
- WildFly must expose `jboss-modules.jar` and a working `jboss-cli` for version probing.
- Packaged servers often keep `webapps` or `standalone/deployments` **not writable** by your user; setup prints a hint when that happens (you may need `sudo` or ACL changes for deploy).

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
- If global `jwebgen` is not on PATH but the local checkout exists:
  - `npx jwebgen --update`
  - `node bin/jwebgen.js --update`

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
