const { spawn } = require("child_process");

const lanMode = process.argv.includes("--lan");
const host = lanMode ? "0.0.0.0" : "127.0.0.1";
const port = Number(process.env.PORT || 8787);

if (lanMode && !String(process.env.ADMIN_PIN || "").trim()) {
  console.error("휴대폰/LAN 테스트에는 ADMIN_PIN이 필요합니다.");
  console.error("START_LAN_TEST.cmd를 사용하거나 ADMIN_PIN 환경변수를 설정하세요.");
  process.exit(1);
}

process.env.HOST = host;

const { startServer } = require("./dev-server");

function openBrowser(url) {
  if (process.env.OPEN_BROWSER === "0") return;
  let command;
  let args;
  if (process.platform === "win32") {
    command = "rundll32.exe";
    args = ["url.dll,FileProtocolHandler", url];
  } else if (process.platform === "darwin") {
    command = "open";
    args = [url];
  } else {
    command = "xdg-open";
    args = [url];
  }
  try {
    const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true });
    child.unref();
  } catch {}
}

startServer({
  host,
  port,
  allowPortFallback: !lanMode,
  onListening: ({ localUrl }) => openBrowser(localUrl)
});
