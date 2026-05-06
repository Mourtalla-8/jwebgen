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
            try {
              var u = new URL(window.location.href);
              u.searchParams.set('_jwg', String((typeof performance !== 'undefined' && performance.now) ? performance.now() : Math.random()));
              window.location.replace(u.toString());
            } catch (e) {
              window.location.reload();
            }
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
          try {
            var u = new URL(window.location.href);
            u.searchParams.set('_jwg', String((typeof performance !== 'undefined' && performance.now) ? performance.now() : Math.random()));
            window.location.replace(u.toString());
          } catch (e) {
            window.location.reload();
          }
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
import ${servletImport}.ServletException;
import ${httpImport}.HttpServlet;
import ${httpImport}.HttpServletRequest;
import ${httpImport}.HttpServletResponse;
import java.io.IOException;
import java.io.PrintWriter;

@WebServlet(name = "$CLASS_NAME", urlPatterns = "$URL_PATTERN")
public class $CLASS_NAME extends HttpServlet {
  @Override
  protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
    resp.setContentType("text/html; charset=UTF-8");
    try (PrintWriter out = resp.getWriter()) {
      out.println("<!DOCTYPE html>");
      out.println("<html lang=\\"fr\\">");
      out.println("<head><meta charset=\\"UTF-8\\"><title>$CLASS_NAME</title></head>");
      out.println("<body>");
      out.println("<h1>$CLASS_NAME</h1>");
      out.println("<p>Servlet generated with ${appName}.</p>");
      out.println("<p>URL: $URL_PATTERN</p>");
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

export function makeAddJspScript({ appName }) {
  return `#!/usr/bin/env bash
set -euo pipefail

JSP_NAME="\${1:-index}"
JSP_NAME="$(printf '%s' "$JSP_NAME" | xargs)"
if [[ -z "$JSP_NAME" ]]; then
  echo "Usage: jwebgen --jsp <name>"
  exit 1
fi
if [[ "$JSP_NAME" != *.jsp ]]; then
  JSP_NAME="\${JSP_NAME}.jsp"
fi
if [[ "$JSP_NAME" == */* || "$JSP_NAME" == *".."* ]]; then
  echo "Invalid JSP name: path segments are not allowed."
  exit 1
fi
if [[ ! "$JSP_NAME" =~ ^[A-Za-z0-9._-]+\\.jsp$ ]]; then
  echo "Invalid JSP name. Allowed: letters, digits, dot, dash, underscore."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
JSP_DIR="$ROOT_DIR/src/main/webapp/WEB-INF/jsp"
TARGET_FILE="$JSP_DIR/$JSP_NAME"
BASE_NAME="\${JSP_NAME%.jsp}"

mkdir -p "$JSP_DIR"
if [[ -e "$TARGET_FILE" ]]; then
  echo "JSP already exists: $TARGET_FILE"
  exit 1
fi

cat > "$TARGET_FILE" <<EOF
<%@ page contentType="text/html; charset=UTF-8" pageEncoding="UTF-8" %>
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>$BASE_NAME</title>
</head>
<body>
  <h1>$BASE_NAME</h1>
  <p>JSP generated with ${appName}.</p>
</body>
</html>
EOF

echo "JSP created: $TARGET_FILE"
echo "Next steps:"
echo "  jwebgen --build"
echo "  jwebgen --deploy"
echo "Or run continuous mode:"
echo "  jwebgen --dev"
`;
}

export function makeAddServletNodeScript({ basePackage, appName }) {
  const defaultWebPackage = `${basePackage}.web`;
  return `#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';

const CLASS_NAME = String(process.argv[2] || 'HelloServlet').trim();
if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(CLASS_NAME)) {
  console.error('Invalid class name. Example: HelloServlet');
  process.exit(1);
}

const BASE_NAME = CLASS_NAME.replace(/Servlet$/, '');
const URL_SLUG = BASE_NAME
  .replace(/([A-Z])/g, '-$1')
  .toLowerCase()
  .replace(/^-+/, '')
  .replace(/-+/g, '-');
const URL_PATTERN = '/' + (URL_SLUG || 'hello');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');
const PACKAGE_DIR = path.join(ROOT_DIR, 'src', 'main', 'java', ${JSON.stringify(packageToPath(defaultWebPackage))});
const TARGET_FILE = path.join(PACKAGE_DIR, CLASS_NAME + '.java');

const javaSource = [
  'package ${defaultWebPackage};',
  '',
  'import jakarta.servlet.annotation.WebServlet;',
  'import jakarta.servlet.ServletException;',
  'import jakarta.servlet.http.HttpServlet;',
  'import jakarta.servlet.http.HttpServletRequest;',
  'import jakarta.servlet.http.HttpServletResponse;',
  'import java.io.IOException;',
  'import java.io.PrintWriter;',
  '',
  '@WebServlet(name = "' + CLASS_NAME + '", urlPatterns = "' + URL_PATTERN + '")',
  'public class ' + CLASS_NAME + ' extends HttpServlet {',
  '  @Override',
  '  protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {',
  '    resp.setContentType("text/html; charset=UTF-8");',
  '    try (PrintWriter out = resp.getWriter()) {',
  '      out.println("<!DOCTYPE html>");',
  '      out.println("<html lang=\\"fr\\">");',
  '      out.println("<head><meta charset=\\"UTF-8\\"><title>' + CLASS_NAME + '</title></head>");',
  '      out.println("<body>");',
  '      out.println("<h1>' + CLASS_NAME + '</h1>");',
  '      out.println("<p>Servlet generated with ${appName}.</p>");',
  '      out.println("<p>URL: ' + URL_PATTERN + '</p>");',
  '      out.println("</body>");',
  '      out.println("</html>");',
  '    }',
  '  }',
  '}',
  ''
].join('\\n');

await mkdir(PACKAGE_DIR, { recursive: true });
await writeFile(TARGET_FILE, javaSource, 'utf8');
console.log('Servlet created: ' + TARGET_FILE);
console.log('Next steps:');
console.log('  jwebgen --build');
console.log('  jwebgen --deploy');
console.log('Or run continuous mode:');
console.log('  jwebgen --dev');
`;
}

export function makeAddJspNodeScript({ appName }) {
  return `#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile, access } from 'node:fs/promises';

let jspName = String(process.argv[2] || 'index').trim();
if (!jspName) {
  console.error('Usage: jwebgen --jsp <name>');
  process.exit(1);
}
if (!jspName.endsWith('.jsp')) jspName += '.jsp';
if (jspName.includes('/') || jspName.includes('\\\\') || jspName.includes('..')) {
  console.error('Invalid JSP name: path segments are not allowed.');
  process.exit(1);
}
if (!/^[A-Za-z0-9._-]+\\.jsp$/.test(jspName)) {
  console.error('Invalid JSP name. Allowed: letters, digits, dot, dash, underscore.');
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');
const JSP_DIR = path.join(ROOT_DIR, 'src', 'main', 'webapp', 'WEB-INF', 'jsp');
const TARGET_FILE = path.join(JSP_DIR, jspName);
const BASE_NAME = jspName.slice(0, -4);

await mkdir(JSP_DIR, { recursive: true });
try {
  await access(TARGET_FILE);
  console.error('JSP already exists: ' + TARGET_FILE);
  process.exit(1);
} catch {
  // target does not exist, continue
}

const content = [
  '<%@ page contentType="text/html; charset=UTF-8" pageEncoding="UTF-8" %>',
  '<!DOCTYPE html>',
  '<html lang="fr">',
  '<head>',
  '  <meta charset="UTF-8">',
  '  <title>' + BASE_NAME + '</title>',
  '</head>',
  '<body>',
  '  <h1>' + BASE_NAME + '</h1>',
  '  <p>JSP generated with ${appName}.</p>',
  '</body>',
  '</html>',
  ''
].join('\\n');

await writeFile(TARGET_FILE, content, 'utf8');
console.log('JSP created: ' + TARGET_FILE);
console.log('Next steps:');
console.log('  jwebgen --build');
console.log('  jwebgen --deploy');
console.log('Or run continuous mode:');
console.log('  jwebgen --dev');
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
- Under \`.jwebgen/\`, **ephemeral** files (e.g. \`.jwebgen-dev-state.json\`, events \`.jsonl\`, embedded \`.mjs\` stubs, \`.pid\`) are recreated by \`--dev\`/\`watch\`; you can ignore them in Git via the patterns in the project root \`.gitignore\`. Keep \`scripts/\` and README as needed.
- If the target server is unavailable, dev mode shows OS-aware hints on the dashboard; use \`[f] refresh\` after starting Tomcat/WildFly.
- LiveReload in dev mode uses a local WebSocket server (auto-fallback on port conflict, starts at \`35729\`, configurable via \`JWEBGEN_LIVE_PORT\`).
- The \`target/\` directory can be removed/recreated at any time
`;
}
