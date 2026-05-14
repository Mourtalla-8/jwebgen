# Troubleshooting

## `jwebgen: command not found`

Install: `npm i -g .` from the repo (or your global package).

Find the binary: `npm config get prefix` → look in `bin/` (or the Windows equivalent). Add that folder to `PATH`, or for a quick try:

```bash
export PATH="$(npm config get prefix)/bin:$PATH"
```

PowerShell: `$env:Path = "$(npm config get prefix);$env:Path"`

No global install: `npx jwebgen …` from the checkout.

`jwebgen --setup` can print PATH hints; it never edits your shell files for you.

## Node too old

Need Node **22.x+** (LTS supported). Check with `node -v`.

## Java / Maven

`javac -version` and `mvn --version` should work. Setup looks for a real **Apache Maven** on `PATH`, not a random `mvn` shim.

`jwebgen --setup` for a full check; `--setup --dry-run` to preview. In CI/non-interactive mode, setup stays diagnostics-only.

## Windows (PATH, JDK, winget)

Setup runs inside **Node** and only sees the environment of that process. After you change **user or system** `PATH`, `JAVA_HOME`, or `CATALINA_HOME`, fully **restart** the terminal, your IDE, or any parent app, then run `javac -version` in the same place you run `jwebgen`.

A **JDK** is required (`javac` must work), not a JRE-only install. If `JAVA_HOME` points at a JDK but `javac` is not on `PATH`, set `JAVA_HOME` anyway: diagnostics also look under `%JAVA_HOME%\bin\javac.exe`.

Tomcat and WildFly checks run `catalina.bat` / `jboss-cli.bat`, which need **Java** available the same way your manual installs do (typically `JAVA_HOME` and/or JDK `bin` on `PATH`).

If `winget install …` fails on the **msstore** source with a certificate error (`0x8a15005e`), install from the **winget** source only, for example: `winget install --source winget --id EclipseAdoptium.Temurin.21.JDK`. The guided setup suggests commands in that form.

## Deploy / dev on macOS or Windows

Prefer the generated `*.mjs` scripts. Point env at real installs:

- Tomcat: directory with `lib/catalina.jar` and a working `catalina` script.
- WildFly: root with `jboss-modules.jar`, or set `WILDFLY_DEPLOYMENTS` to `…/standalone/deployments`.

`jwebgen --status` shows what path it resolved.

## “Server missing” but something is installed

Empty `webapps/` trees don’t count. Tomcat must answer a version probe; WildFly needs CLI + layout checks. Packaged servers often need sudo or ACL tweaks to let your user write `webapps` or `standalone/deployments`.

## Permission errors on deploy

Try `sudo -v`, then deploy again. Some paths are root-owned by design.

## Remove deployed app for this project

`jwebgen --clean --deploy`. Leaving `--dev` also tries to clean up (best effort).

## Update / uninstall CLI

`jwebgen --update` and `jwebgen --uninstall` print safe steps. From a clone without PATH: `node bin/jwebgen.js --update`.

## Port busy (8080, 9990, LiveReload)

See what listens: `ss -lntp` (Linux) or your OS equivalent. Run one HTTP server for the app port, or set `JWEBGEN_HTTP_PORT`. LiveReload defaults to `35729`; override with `JWEBGEN_LIVE_PORT` if needed.
