const http = require("http");
const fs = require("fs");
const path = require("path");
const { handleApiRequest } = require("../server/api");

const root = process.cwd();
const port = Number(process.env.PORT || 8765);
const host = process.env.HOST || "127.0.0.1";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".ico": "image/x-icon"
};

function sendStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const filePath = path.resolve(root, `.${pathname}`);
  if (!filePath.startsWith(root)) {
    res.statusCode = 403;
    res.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error && path.extname(filePath) === "") {
      const indexPath = path.join(root, "index.html");
      fs.readFile(indexPath, (indexError, indexData) => {
        if (indexError) {
          res.statusCode = 404;
          res.end("Not found");
          return;
        }
        res.setHeader("Content-Type", contentTypes[".html"]);
        res.setHeader("Cache-Control", "no-store");
        res.end(indexData);
      });
      return;
    }
    if (error) {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }
    res.setHeader("Content-Type", contentTypes[path.extname(filePath)] || "application/octet-stream");
    res.setHeader("Cache-Control", "no-store");
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.url.startsWith("/api/app")) {
    await handleApiRequest(req, res);
    return;
  }
  sendStatic(req, res);
});

server.listen(port, host, () => {
  console.log(`Armor RPG dev server running at http://${host}:${port}/`);
});
