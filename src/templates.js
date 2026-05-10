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
import jakarta.servlet.ServletException;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

@WebServlet("/hello")
public class HelloServlet extends HttpServlet {
    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
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
Ephemeral dev files (\`*.json\` state, embedded worker/dashboard stubs, PID files under \`.jwebgen/\`) may appear at runtime — root \`.gitignore\` lists common patterns; see \`.jwebgen/DEV.md\`.
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
- \`jwebgen --dev\` / \`./.jwebgen/scripts/dev.mjs\` run the dev proxy + LiveReload WebSocket (HTML injection via the proxy, not servlet code under \`src/\`).
- If the target server is down, the dashboard shows hints; use \`[f] refresh\` after starting Tomcat/WildFly.
- Install and start Tomcat/WildFly yourself; set \`TOMCAT_HOME\`/\`CATALINA_HOME\` and \`WILDFLY_HOME\` (or \`WILDFLY_DEPLOYMENTS\`) in env or \`.jwebgen/.jwebgenrc\` when paths are non-standard (Linux package and macOS Homebrew layouts are often auto-detected).
- To drop jwebgen from the project, remove the \`.jwebgen/\` directory at the repository root (tooling is kept there only).
`;
}

export function gitignore() {
  return `target/
.vscode/
.idea/
*.iml

# jwebgen — dev session/generated files (versioned tooling: scripts/, README, .jwebgenrc as you prefer)
.jwebgen/*.json
.jwebgen/*.jsonl
.jwebgen/.jwebgen-ui-pause
.jwebgen/.jwebgen-*.mjs
.jwebgen/.jwebgen-dev.pid
`;
}
