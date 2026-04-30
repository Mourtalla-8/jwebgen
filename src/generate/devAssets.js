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
  console.log(\`[LiveReload] Serveur actif sur port \${port}\`);
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
        console.log('[LiveReload] Connexion \u00e9chou\u00e9e apr\u00e8s ' + maxAttempts + ' tentatives');
        return;
      }
      attempt++;

      try {
        var port = livePorts[(attempt - 1) % livePorts.length];
        var wsUri = protocol + '//' + window.location.hostname + ':' + port;
        var ws = new WebSocket(wsUri);
        ws.onopen = function() {
          console.log('[LiveReload] Connect\u00e9');
          attempt = 0;
        };
        ws.onmessage = function(event) {
          var data = JSON.parse(event.data);
          if (data.command === 'reload') {
            console.log('[LiveReload] Rechargement de la page...');
            var url = window.location.href;
            url += (url.indexOf('?') === -1 ? '?' : '&') + '_lr=' + Date.now();
            window.location.replace(url);
          }
        };
        ws.onclose = function() {
          console.log('[LiveReload] Reconnexion dans ' + (backoffMs * attempt) + 'ms...');
          setTimeout(connect, backoffMs * attempt);
        };
        ws.onerror = function(error) {
          console.log('[LiveReload] Erreur:', error.message);
          ws.close();
        };
      } catch (error) {
        console.log('[LiveReload] Erreur de connexion:', error.message);
        setTimeout(connect, backoffMs * attempt);
      }
    }

    connect();
  })();
</script>`;
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
  echo "Nom de classe invalide. Exemple: HelloServlet"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
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
      out.println("<p>Servlet générée avec ${appName}.</p>");
      out.println("<p>URL : $URL_PATTERN</p>");
      out.println("<script>");
      out.println("(function() {\\n  if (typeof window === 'undefined') return;\\n  var protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';\\n  var preferred = Number(window.__JWEBGEN_LIVE_PORT || 35729);\\n  var livePorts = [preferred, 35729, 35730, 35731, 35732, 35733, 35734, 35735, 35736, 35737, 35738, 35739];\\n  var attempt = 0;\\n  var maxAttempts = 10;\\n  var backoffMs = 500;\\n\\n  function connect() {\\n    if (attempt >= maxAttempts) {\\n      console.log('[LiveReload] Connexion échouée');\\n      return;\\n    }\\n    attempt++;\\n\\n    try {\\n      var port = livePorts[(attempt - 1) % livePorts.length];\\n      var wsUri = protocol + '//' + window.location.hostname + ':' + port;\\n      var ws = new WebSocket(wsUri);\\n      ws.onopen = function() {\\n        console.log('[LiveReload] Connecté');\\n        attempt = 0;\\n      };\\n      ws.onmessage = function(event) {\\n        var data = JSON.parse(event.data);\\n        if (data.command === 'reload') {\\n          console.log('[LiveReload] Rechargement...');\\n          var url = window.location.href;\\n          url += (url.indexOf('?') === -1 ? '?' : '&') + '_lr=' + Date.now();\\n          window.location.replace(url);\\n        }\\n      };\\n      ws.onclose = function() {\\n        setTimeout(connect, backoffMs * attempt);\\n      };\\n      ws.onerror = function() {\\n        ws.close();\\n      };\\n    } catch (error) {\\n      setTimeout(connect, backoffMs * attempt);\\n    }\\n  }\\n\\n  connect();\\n})();");
      out.println("</script>");
      out.println("</body>");
      out.println("</html>");
    }
  }
}
EOF

echo "Servlet créée : $TARGET_FILE"
echo "Pense à reconstruire puis redéployer : ./scripts/dev.sh"
`;
}

export function makeDevMd({ appName, serverTarget }) {
  const prereqServer =
    serverTarget === 'tomcat'
      ? `## Prérequis (Tomcat)

- Tomcat installé + démarré
- Variable optionnelle : \`TOMCAT10\` (par défaut \`/var/lib/tomcat10\`)

Commandes (selon ta distro) :

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
      : `## Prérequis (WildFly)

- WildFly installé et démarré
- Variables utiles :
  - \`WILDFLY_HOME\` (par défaut \`/opt/wildfly\`)
  - \`WILDFLY_DEPLOYMENTS\` (par défaut \`$WILDFLY_HOME/standalone/deployments\`)`;

  const devNotes =
    serverTarget === 'tomcat'
      ? `- En dev, le déploiement est **explosé** + sync incrémental (rsync si dispo), sans redémarrage Tomcat.
- \`src/main/webapp/META-INF/context.xml\` active \`reloadable="true"\` pour aider Tomcat à recharger le contexte.`
      : `- En dev, le script déploie le WAR vers le dossier deployments et déclenche \`.dodeploy\`.`;

  return `# Développement rapide

URL de dev stable :

\`\`\`
http://localhost:8080/${appName}/
\`\`\`

${prereqServer}

Ce template est Jakarta-only (Servlet API 6+).

## Outils requis

- Java (JDK) 11+
- Maven (\`mvn\`)
- Node.js (**uniquement** pour \`./scripts/dev.sh\` et le reload navigateur)

Scripts générés :

- \`./scripts/build.sh\` : compile le WAR
- \`./scripts/deploy.sh\` : déploiement vers le serveur cible
- \`./scripts/dev.sh\` : mode dev continu (watch + rebuild + deploy + reload navigateur)
- \`./scripts/watch.sh\` : rebuild + redeploy automatique
- \`jwebgen servlet [NomClasse]\` : crée une servlet

Contexte du projet :

- stack : modern jakarta
- serveur cible : ${serverTarget}

Notes :

- ${devNotes}
- Si le serveur cible est indisponible, le mode dev propose \`Retry / Aide / Quit\` avec diagnostics.
- LiveReload en dev utilise un serveur WebSocket local (port auto si conflit, départ \`35729\`, configurable via \`JWEBGEN_LIVE_PORT\`).
- le dossier \`target/\` peut être supprimé/recréé à tout moment
`;
}
