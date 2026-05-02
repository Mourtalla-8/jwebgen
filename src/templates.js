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
            out.println("<p>LiveReload is injected by DevLiveReloadFilter in dev mode.</p>");
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
  <p>LiveReload is injected by DevLiveReloadFilter in dev mode.</p>
</body>
</html>
`;
}

export function devLiveReloadFilter({ basePackage }) {
  return `package ${basePackage};

import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletOutputStream;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.WriteListener;
import jakarta.servlet.annotation.WebFilter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpServletResponseWrapper;
import java.io.ByteArrayOutputStream;
import java.io.CharArrayWriter;
import java.io.IOException;
import java.io.OutputStreamWriter;
import java.io.PrintWriter;

// @WebFilter("/*") — disabled by default; register via web.xml or programmatically in dev mode only
public class DevLiveReloadFilter implements Filter {
    private static final String SCRIPT_TAG = "<script src=\\\"%s/.jwebgen/live-reload.js\\\"></script>";

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        if (!(request instanceof HttpServletRequest req) || !(response instanceof HttpServletResponse res)) {
            chain.doFilter(request, response);
            return;
        }

        String uri = req.getRequestURI();
        if (uri != null && uri.contains("/.jwebgen/live-reload.js")) {
            chain.doFilter(request, response);
            return;
        }

        BufferingResponseWrapper wrapped = new BufferingResponseWrapper(res);
        chain.doFilter(request, wrapped);

        String contentType = wrapped.getContentType();
        if (contentType == null || !contentType.toLowerCase().contains("text/html")) {
            wrapped.commitToOriginal();
            return;
        }

        String body = wrapped.getCapturedBody();
        String contextPath = req.getContextPath() == null ? "" : req.getContextPath();
        String tag = String.format(SCRIPT_TAG, contextPath);
        if (body.contains(tag)) {
            wrapped.commitToOriginal();
            return;
        }

        String updated = injectBeforeBodyClose(body, tag);
        wrapped.commitInjected(updated);
    }

    private static String injectBeforeBodyClose(String html, String tag) {
        String lower = html.toLowerCase();
        int idx = lower.lastIndexOf("</body>");
        if (idx < 0) return html + tag;
        return html.substring(0, idx) + tag + html.substring(idx);
    }

    private static class BufferingResponseWrapper extends HttpServletResponseWrapper {
        private final CharArrayWriter charCapture = new CharArrayWriter();
        private final ByteArrayOutputStream byteCapture = new ByteArrayOutputStream();
        private PrintWriter writer;
        private ServletOutputStream outputStream;
        private boolean writerUsed = false;
        private boolean streamUsed = false;

        BufferingResponseWrapper(HttpServletResponse response) {
            super(response);
        }

        @Override
        public PrintWriter getWriter() throws IOException {
            if (streamUsed) {
                throw new IllegalStateException("getOutputStream() has already been called on this response");
            }
            if (writer == null) {
                writerUsed = true;
                String encoding = getCharacterEncoding();
                if (encoding == null) encoding = "UTF-8";
                writer = new PrintWriter(new OutputStreamWriter(byteCapture, encoding));
            }
            return writer;
        }

        @Override
        public ServletOutputStream getOutputStream() throws IOException {
            if (writerUsed) {
                throw new IllegalStateException("getWriter() has already been called on this response");
            }
            if (outputStream == null) {
                streamUsed = true;
                outputStream = new ServletOutputStream() {
                    @Override
                    public void write(int b) throws IOException {
                        byteCapture.write(b);
                    }

                    @Override
                    public boolean isReady() {
                        return true;
                    }

                    @Override
                    public void setWriteListener(WriteListener writeListener) {
                        throw new UnsupportedOperationException("Async not supported");
                    }
                };
            }
            return outputStream;
        }

        String getCapturedBody() throws IOException {
            if (writer != null) {
                writer.flush();
            }
            String encoding = getCharacterEncoding();
            if (encoding == null) encoding = "UTF-8";
            return byteCapture.toString(encoding);
        }

        void commitToOriginal() throws IOException {
            String body = getCapturedBody();
            HttpServletResponse original = (HttpServletResponse) getResponse();
            String encoding = original.getCharacterEncoding();
            if (encoding == null) encoding = "UTF-8";
            byte[] bytes = body.getBytes(encoding);
            original.setContentLength(bytes.length);
            original.getOutputStream().write(bytes);
        }

        void commitInjected(String injectedBody) throws IOException {
            HttpServletResponse original = (HttpServletResponse) getResponse();
            String encoding = original.getCharacterEncoding();
            if (encoding == null) encoding = "UTF-8";
            byte[] bytes = injectedBody.getBytes(encoding);
            original.setContentLength(bytes.length);
            original.getOutputStream().write(bytes);
        }
    }
}
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
