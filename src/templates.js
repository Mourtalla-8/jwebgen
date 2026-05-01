function xmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function htmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function mdInline(value) {
  return String(value).replace(/`/g, '\\`');
}

export function pomXml({ projectName, groupId, artifactId, javaRelease, finalName }) {
  const servlet = {
    groupId: 'jakarta.servlet',
    artifactId: 'jakarta.servlet-api',
    version: '6.0.0'
  };

  return `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0
                             https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>

  <groupId>${xmlEscape(groupId)}</groupId>
  <artifactId>${xmlEscape(artifactId)}</artifactId>
  <version>1.0.0-SNAPSHOT</version>
  <name>${xmlEscape(projectName)}</name>
  <description>${xmlEscape(projectName)} generated with jwebgen</description>
  <packaging>war</packaging>

  <properties>
    <maven.compiler.release>${javaRelease}</maven.compiler.release>
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
    <maven.compiler.source>${javaRelease}</maven.compiler.source>
    <maven.compiler.target>${javaRelease}</maven.compiler.target>
  </properties>

  <dependencies>
    <dependency>
      <groupId>${servlet.groupId}</groupId>
      <artifactId>${servlet.artifactId}</artifactId>
      <version>${servlet.version}</version>
      <scope>provided</scope>
    </dependency>
  </dependencies>

  <build>
    <finalName>${xmlEscape(finalName)}</finalName>
    <plugins>
      <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-compiler-plugin</artifactId>
        <version>3.13.0</version>
        <configuration>
          <release>\${maven.compiler.release}</release>
        </configuration>
      </plugin>
    </plugins>
  </build>
</project>
`;
}

export function helloServlet({ basePackage }) {
  return `package ${basePackage};

import java.io.IOException;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

@WebServlet("/hello")
public class HelloServlet extends HttpServlet {
    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        resp.setContentType("text/html; charset=UTF-8");
        try (var out = resp.getWriter()) {
            out.println("<!DOCTYPE html>");
            out.println("<html lang=\\\"fr\\\">");
            out.println("<head>");
            out.println("  <meta charset=\\\"UTF-8\\\">");
            out.println("  <title>Hello Servlet</title>");
            out.println("</head>");
            out.println("<body>");
            out.println("<h1>Hello from Jakarta Servlet!</h1>");
            out.println("<p>LiveReload is active in dev mode.</p>");
            out.println("<script>");
            out.println("(function() {");
            out.println("  if (typeof window === 'undefined') return;");
            out.println("  var protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';");
            out.println("  var preferred = Number(window.__JWEBGEN_LIVE_PORT || 35729);");
            out.println("  var livePorts = [preferred, 35729, 35730, 35731, 35732, 35733, 35734, 35735, 35736, 35737, 35738, 35739]");
            out.println("  var attempt = 0;");
            out.println("  var maxAttempts = 10;");
            out.println("  var backoffMs = 500;");
            out.println("");
            out.println("  function connect() {");
            out.println("    if (attempt >= maxAttempts) {");
            out.println("      console.log(\\'[LiveReload] Connection failed\\');");
            out.println("      return;");
            out.println("    }");
            out.println("    attempt++;");
            out.println("");
            out.println("    try {");
            out.println("      var port = livePorts[(attempt - 1) % livePorts.length];");
            out.println("      var wsUri = protocol + '//' + window.location.hostname + ':' + port;");
            out.println("      var ws = new WebSocket(wsUri);");
            out.println("      ws.onopen = function() {");
            out.println("        console.log(\\'[LiveReload] Connected\\');");
            out.println("        attempt = 0;");
            out.println("      };");
            out.println("      ws.onmessage = function(event) {");
            out.println("        var data = JSON.parse(event.data);");
            out.println("        if (data.command === \\'reload\\') {");
            out.println("          console.log(\\'[LiveReload] Reloading...\\');");
            out.println("          var url = window.location.href;");
            out.println("          url += (url.indexOf('?') === -1 ? '?' : '&') + '_lr=' + Date.now();");
            out.println("          window.location.replace(url);");
            out.println("        }");
            out.println("      };");
            out.println("      ws.onclose = function() {");
            out.println("        setTimeout(connect, backoffMs * attempt);");
            out.println("      };");
            out.println("      ws.onerror = function() {");
            out.println("        ws.close();");
            out.println("      };");
            out.println("    } catch (error) {");
            out.println("      setTimeout(connect, backoffMs * attempt);");
            out.println("    }");
            out.println("  }");
            out.println("");
            out.println("  connect();");
            out.println("})();");
            out.println("</script>");
            out.println("</body>");
            out.println("</html>");
        }
    }
}
`;
}

export function indexJsp({ projectName, artifactId, hasServlet }) {
  const servletLink = hasServlet
    ? `    <p><a href="\${pageContext.request.contextPath}/hello">Go to the servlet</a></p>`
    : `    <p>JSP project is ready.</p>`;

  const liveReloadSnippet = `
  <!-- LiveReload for dev mode -->
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
          console.log('[LiveReload] Connection failed');
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
              console.log('[LiveReload] Reloading...');
              var url = window.location.href;
              url += (url.indexOf('?') === -1 ? '?' : '&') + '_lr=' + Date.now();
              window.location.replace(url);
            }
          };
          ws.onclose = function() {
            setTimeout(connect, backoffMs * attempt);
          };
          ws.onerror = function(error) {
            ws.close();
          };
        } catch (error) {
          setTimeout(connect, backoffMs * attempt);
        }
      }

      connect();
    })();
  </script>`;

  return `<%@ page contentType="text/html; charset=UTF-8" pageEncoding="UTF-8" %>
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>${htmlEscape(artifactId)}</title>
</head>
<body>
  <h1>${htmlEscape(projectName)}</h1>
  <p>WebApp generated with jwebgen.</p>
${servletLink}
${liveReloadSnippet}
</body>
</html>
`;
}

export function tomcatContextXmlDev() {
  // Tomcat-specific: allows context reload on class changes.
  // Useful in dev mode with exploded deployment.
  return `<?xml version="1.0" encoding="UTF-8"?>
<Context reloadable="true">
</Context>
`;
}

export function webXml({ projectName }) {
  const meta = {
    xmlns: 'https://jakarta.ee/xml/ns/jakartaee',
    version: '6.0',
    schema: 'https://jakarta.ee/xml/ns/jakartaee/web-app_6_0.xsd'
  };

  return `<web-app xmlns="${meta.xmlns}"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="${meta.xmlns} ${meta.schema}"
         version="${meta.version}">
  <display-name>${xmlEscape(projectName)}</display-name>
</web-app>
`;
}

export function readmeMd({
  projectName,
  artifactId,
  groupId,
  basePackage,
  location,
  stackMode,
  serverTarget,
  javaRelease,
  hasServlet,
  hasJsp
}) {
  const deployHelp =
    serverTarget === 'tomcat'
      ? `- Tomcat: deployment via \`./.jwebgen/scripts/deploy.sh\` (WAR or exploded mode in dev)`
      : serverTarget === 'wildfly'
        ? `- WildFly: deployment via \`./.jwebgen/scripts/deploy.sh\` (copy to deployments + .dodeploy)`
        : `- Unknown server: check project configuration.`;

  return `# ${mdInline(projectName)}

Project generated by jwebgen (tooling documentation is in \`.jwebgen/\`).
This generator targets Jakarta stack only (Servlet API 6+).

## Information
- ArtifactId: ${mdInline(artifactId)}
- GroupId: ${mdInline(groupId)}
- Package: ${mdInline(basePackage)}
- Location: \`${mdInline(location)}\`
- Stack: ${mdInline(stackMode)}
- Target server: ${mdInline(serverTarget)}
- Java: ${javaRelease}

## Content
- Example servlet: ${hasServlet ? 'yes' : 'no'}
- JSP: ${hasJsp ? 'yes' : 'no'}

## Useful commands
\`\`\`bash
mvn clean package
\`\`\`

## Deployment
${deployHelp}

## Dev mode
- \`./.jwebgen/scripts/dev.sh\` runs watch/build/deploy + LiveReload WebSocket.
- If the target server is down, an interactive prompt offers \`Retry / Help / Quit\` with diagnostics.
- Deployment/dev scripts prioritize Linux (systemd); on non-Linux systems, adapt server setup manually.
`;
}

export function gitignore() {
  return `target/
.vscode/
.idea/
*.iml

# jwebgen — dev session/generated files (excluding versioned scripts)
.jwebgen/.jwebgen-dev-state.json
.jwebgen/.jwebgen-dev-events.jsonl
.jwebgen/.jwebgen-ui-pause
.jwebgen/.jwebgen-worker.mjs
.jwebgen/.jwebgen-dashboard.mjs
.jwebgen/.jwebgen-dev.pid
`;
}
