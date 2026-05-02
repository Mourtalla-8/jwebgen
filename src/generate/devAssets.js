import { packageToPath } from '../project/inputUtils.js';

export function makeLiveReloadServerScript() {
  return `#!/usr/bin/env node
import { createServer } from 'livereload';
import { watch } from 'fs';
import { resolve } from 'path';

const port = 35729;
const server = createServer({ port });

// Watch for changes in src and target directories
const watchDirs = [
  resolve('.', 'src'),
  resolve('.', 'target')
];

watchDirs.forEach(dir => {
  try {
    watch(dir, { recursive: true }, () => {
      server.refresh(resolve('.'));
    });
  } catch {
    // Directory may not exist yet
  }
});

server.listen(() => {
  console.log(\`[LiveReload] Server listening on port \${port}\`);
});
`;
}

export function makeLiveReloadSnippet() {
  return `<!-- LiveReload for dev mode -->
<script>
  (function() {
    if (typeof window === 'undefined') return;
    var protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    var preferred = Number(window.__JWEBGEN_LIVE_PORT || 35729);
    var livePorts = [preferred, 35729, 35730, 35731, 35732, 35733, 35734, 35735, 35736, 35737, 35738, 35739];
    var attempt = 0;
    var maxAttempts = 10;
    var backoffMs = 500;

    function connect() {
      if (attempt >= maxAttempts) {
        console.log('[LiveReload] Connection failed after ' + maxAttempts + ' attempts');
        return;
      }
      attempt++;

      try {
        var port = livePorts[(attempt - 1) % livePorts.length];
        var wsUri = protocol + '//' + window.location.hostname + ':' + port;
        var ws = new WebSocket(wsUri);
        ws.onopen = function() {
          console.log('[LiveReload] Connected');
          attempt = 0;
        };
        ws.onmessage = function(event) {
          var data = JSON.parse(event.data);
          if (data.command === 'reload') {
            console.log('[LiveReload] Reloading page...');
            var url = window.location.href;
            url += (url.indexOf('?') === -1 ? '?' : '&') + '_lr=' + Date.now();
            window.location.replace(url);
          }
        };
        ws.onclose = function() {
          console.log('[LiveReload] Reconnecting in ' + (backoffMs * attempt) + 'ms...');
          setTimeout(connect, backoffMs * attempt);
        };
        ws.onerror = function(error) {
          console.log('[LiveReload] Error:', error.message);
          ws.close();
        };
      } catch (error) {
        console.log('[LiveReload] Connection error:', error.message);
        setTimeout(connect, backoffMs * attempt);
      }
    }

    connect();
  })();
</script>`;
}

export function makeLiveReloadClientScript() {
  return `(function() {
  if (typeof window === 'undefined') return;
  var protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  var preferred = Number(window.__JWEBGEN_LIVE_PORT || 35729);
  var livePorts = [preferred, 35729, 35730, 35731, 35732, 35733, 35734, 35735, 35736, 35737, 35738, 35739];
  var attempt = 0;
  var maxAttempts = 10;
  var backoffMs = 500;

  function connect() {
    if (attempt >= maxAttempts) {
      console.log('[LiveReload] Connection failed after ' + maxAttempts + ' attempts');
      return;
    }
    attempt++;

    try {
      var port = livePorts[(attempt - 1) % livePorts.length];
      var wsUri = protocol + '//' + window.location.hostname + ':' + port;
      var ws = new WebSocket(wsUri);
      ws.onopen = function() {
        console.log('[LiveReload] Connected');
        attempt = 0;
      };
      ws.onmessage = function(event) {
        var data = JSON.parse(event.data);
        if (data.command === 'reload') {
          console.log('[LiveReload] Reloading page...');
          var url = window.location.href;
          url += (url.indexOf('?') === -1 ? '?' : '&') + '_lr=' + Date.now();
          window.location.replace(url);
        }
      };
      ws.onclose = function() {
        console.log('[LiveReload] Reconnecting in ' + (backoffMs * attempt) + 'ms...');
        setTimeout(connect, backoffMs * attempt);
      };
      ws.onerror = function(error) {
        console.log('[LiveReload] Error:', error.message);
        ws.close();
      };
    } catch (error) {
      console.log('[LiveReload] Connection error:', error.message);
      setTimeout(connect, backoffMs * attempt);
    }
  }

  connect();
})();`;
}

export function makeAddServletScript({ basePackage, appName }) {
  const servletImport = 'jakarta.servlet';
  const httpImport = 'jakarta.servlet.http';
  const annotationImport = 'jakarta.servlet.annotation';
  const defaultWebPackage = `${basePackage}.web`;
  const packagePath = packageToPath(defaultWebPackage);

  return `#!/usr/bin/env bash
set -euo pipefail

CLASS_NAME="\${1:-HelloServlet}"
BASE_NAME="$(printf '%s' "$CLASS_NAME" | sed -E 's/Servlet$//')"
URL_SLUG="$(printf '%s' "$BASE_NAME" | sed -E 's/([A-Z])/-\\1/g' | tr '[:upper:]' '[:lower:]' | sed -E 's/^-+//; s/-+/-/g')"
URL_PATTERN="/\${URL_SLUG:-hello}"

if [[ ! "$CLASS_NAME" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
  echo "Invalid class name. Example: HelloServlet"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
PACKAGE_DIR="$ROOT_DIR/src/main/java/${packagePath}"
TARGET_FILE="$PACKAGE_DIR/$CLASS_NAME.java"

mkdir -p "$PACKAGE_DIR"

cat > "$TARGET_FILE" <<EOF
package ${defaultWebPackage};

import ${annotationImport}.WebServlet;
import ${httpImport}.HttpServlet;
import ${httpImport}.HttpServletRequest;
import ${httpImport}.HttpServletResponse;
import java.io.IOException;
import java.io.PrintWriter;

@WebServlet(name = "$CLASS_NAME", urlPatterns = "$URL_PATTERN")
public class $CLASS_NAME extends HttpServlet {
  @Override
  protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
    resp.setContentType("text/html; charset=UTF-8");
    try (PrintWriter out = resp.getWriter()) {
      out.println("<!DOCTYPE html>");
      out.println("<html lang=\\"fr\\">");
      out.println("<head><meta charset=\\"UTF-8\\"><title>$CLASS_NAME</title></head>");
      out.println("<body>");
      out.println("<h1>$CLASS_NAME</h1>");
      out.println("<p>Servlet generated with ${appName}.</p>");
      out.println("<p>URL: $URL_PATTERN</p>");
      out.println("<p>LiveReload is injected automatically in dev mode.</p>");
      out.println("</body>");
      out.println("</html>");
    }
  }
}
EOF

echo "Servlet created: $TARGET_FILE"
echo "Next steps:"
echo "  jwebgen --build"
echo "  jwebgen --deploy"
echo "Or run continuous mode:"
echo "  jwebgen --dev"
`;
}

export function makeDevMd({ appName, serverTarget }) {
  const prereqServer =
    serverTarget === 'tomcat'
      ? `## Prerequisites (Tomcat)

- Tomcat installed + started
- Optional variable: \`TOMCAT10\` (default: \`/var/lib/tomcat10\`)

Commands (depending on your distro):

\`\`\`bash
# Debian/Ubuntu
sudo apt install tomcat10
sudo systemctl start tomcat10
\`\`\`

Sur Arch :

\`\`\`bash
sudo pacman -S tomcat10
sudo systemctl start tomcat10
\`\`\``
      : serverTarget === 'wildfly'
        ? `## Prerequisites (WildFly)

- WildFly installed and started
- Useful variables:
  - \`WILDFLY_HOME\` (default: \`/opt/wildfly\`)
  - \`WILDFLY_DEPLOYMENTS\` (default: \`$WILDFLY_HOME/standalone/deployments\`)`
        : `## Prerequisites (server to choose)

- No server was selected during quick project creation.
- On first \`jwebgen --dev\` or \`jwebgen --deploy\`, jwebgen will ask for Tomcat or WildFly and save the choice.`;

  const devNotes =
    serverTarget === 'tomcat'
      ? `- In dev mode, deployment is **exploded** + incremental sync (rsync when available), without restarting Tomcat.
- \`src/main/webapp/META-INF/context.xml\` enables \`reloadable="true"\` to help Tomcat reload context changes.`
        : serverTarget === 'wildfly'
        ? `- In dev mode, the script deploys the WAR to the deployments directory and triggers \`.dodeploy\`.`
        : `- In dev mode, target server is selected at first run and stored in \`.jwebgen/.jwebgenrc\`.`;

  return `# Quick Development

URL de dev stable :

\`\`\`
http://localhost:8080/${appName}/
\`\`\`

${prereqServer}

Ce template est Jakarta-only (Servlet API 6+).

## Required tools

- Java (JDK) 11+
- Maven (\`mvn\`)
- Node.js (**uniquement** pour \`./.jwebgen/scripts/dev.sh\` et le reload navigateur)

Generated scripts:

- \`./.jwebgen/scripts/build.sh\` : compile le WAR
- \`./.jwebgen/scripts/deploy.sh\` : deploys to the target server
- \`./.jwebgen/scripts/dev.sh\` : mode dev continu (watch + rebuild + deploy + reload navigateur)
- \`./.jwebgen/scripts/watch.sh\` : rebuild + redeploy automatique
- \`jwebgen --servlet [ClassName]\` : creates a servlet

Contexte du projet :

- stack : modern jakarta
- target server: ${serverTarget}

Notes :

- ${devNotes}
- If the target server is unavailable, dev mode offers \`Retry / Help / Quit\` with diagnostics.
- LiveReload in dev mode uses a local WebSocket server (auto-fallback on port conflict, starts at \`35729\`, configurable via \`JWEBGEN_LIVE_PORT\`).
- The \`target/\` directory can be removed/recreated at any time
`;
}
