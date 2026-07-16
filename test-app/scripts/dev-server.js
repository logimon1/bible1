const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { handleApiRequest } = require("../server/api");

const projectRoot = path.resolve(__dirname, "..");
const defaultPort = Number(process.env.PORT || 8765);
const defaultHost = process.env.HOST || "127.0.0.1";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml; charset=utf-8",
  ".ico": "image/x-icon"
};

const publicRootFiles = new Set(["index.html", "app.js", "styles.css", "favicon.ico"]);

function sendText(res, status, message) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(message);
}

function safeRequestPath(req) {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    return decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
}

function isInsideProject(filePath) {
  const relative = path.relative(projectRoot, filePath);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function staticFilePath(pathname) {
  if (pathname === "/") return path.join(projectRoot, "index.html");

  const relativePath = pathname.replace(/^\/+/, "").replace(/\//g, path.sep);
  const filePath = path.resolve(projectRoot, relativePath);
  if (!isInsideProject(filePath)) return null;

  if (publicRootFiles.has(relativePath)) return filePath;
  if (relativePath === "assets" || relativePath.startsWith(`assets${path.sep}`)) return filePath;

  if (!path.extname(pathname)) return path.join(projectRoot, "index.html");
  return null;
}

function sendStatic(req, res) {
  const pathname = safeRequestPath(req);
  if (!pathname) {
    sendText(res, 400, "잘못된 URL입니다.");
    return;
  }

  const filePath = staticFilePath(pathname);
  if (!filePath) {
    sendText(res, 404, "Not found");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendText(res, 404, "Not found");
      return;
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", contentTypes[path.extname(filePath)] || "application/octet-stream");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.end(data);
  });
}

function createAppServer() {
  const server = http.createServer(async (req, res) => {
    const pathname = safeRequestPath(req);
    if (pathname === "/api/app") {
      try {
        await handleApiRequest(req, res);
      } catch (error) {
        if (!res.headersSent) sendText(res, 500, error.message || "서버 처리 중 오류가 발생했습니다.");
        else if (!res.writableEnded) res.end();
      }
      return;
    }
    sendStatic(req, res);
  });
  server.requestTimeout = 20000;
  server.headersTimeout = 15000;
  server.keepAliveTimeout = 5000;
  server.on("clientError", (_error, socket) => {
    if (socket.writable) {
      socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
    } else {
      socket.destroy();
    }
  });
  return server;
}

function lanUrls(port) {
  const urls = [];
  for (const rows of Object.values(os.networkInterfaces())) {
    for (const address of rows || []) {
      if (address.family === "IPv4" && !address.internal) urls.push(`http://${address.address}:${port}/`);
    }
  }
  return [...new Set(urls)];
}

function printReadyMessage(host, port) {
  const localUrl = `http://127.0.0.1:${port}/`;
  const urls = host === "0.0.0.0" || host === "::" ? lanUrls(port) : [];
  console.log("");
  console.log("수련회 앱 서버가 준비되었습니다.");
  console.log(`PC 접속: ${localUrl}`);
  for (const url of urls) console.log(`같은 Wi-Fi 휴대폰 접속: ${url}`);
  console.log(`서버 상태 확인: ${localUrl}api/app?action=health`);
  console.log("종료: Ctrl+C");
  console.log("");
  return { localUrl, lanUrls: urls, port, host };
}

function startServer(options = {}) {
  const host = options.host || defaultHost;
  const initialPort = Number(options.port || defaultPort);
  const allowPortFallback = options.allowPortFallback ?? !process.env.PORT;
  const maxAttempts = Math.max(1, Number(options.maxAttempts || 20));
  const server = createAppServer();
  let port = initialPort;
  let attempts = 0;

  function listen() {
    attempts += 1;
    const onListening = () => {
      server.removeListener("error", onError);
      const details = printReadyMessage(host, port);
      if (typeof options.onListening === "function") options.onListening(details);
    };
    const onError = (error) => {
      server.removeListener("listening", onListening);
      if (error.code === "EADDRINUSE" && allowPortFallback && attempts < maxAttempts) {
        console.warn(`포트 ${port}는 다른 프로그램이 사용 중입니다. ${port + 1} 포트로 다시 시도합니다.`);
        port += 1;
        listen();
        return;
      }
      if (error.code === "EADDRINUSE") {
        console.error(`포트 ${port}가 이미 사용 중입니다. 해당 프로그램을 종료하거나 다른 PORT를 지정하세요.`);
      } else {
        console.error(`수련회 앱 서버를 시작하지 못했습니다: ${error.message}`);
      }
      process.exitCode = 1;
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  }

  listen();
  return server;
}

if (require.main === module) startServer();

module.exports = {
  createAppServer,
  projectRoot,
  startServer
};
