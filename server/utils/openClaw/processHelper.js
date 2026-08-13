const net = require("net");
const { spawn } = require("child_process");

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);
    socket
      .once("connect", () => {
        socket.destroy();
        resolve(true);
      })
      .once("error", () => {
        socket.destroy();
        resolve(false);
      })
      .once("timeout", () => {
        socket.destroy();
        resolve(false);
      })
      .connect(port, "127.0.0.1");
  });
}

async function waitForPort(
  port,
  { maxWaitMs = 30000, intervalMs = 1000 } = {}
) {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    if (await isPortOpen(port)) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

function spawnProcess(cmd, args = [], options = {}) {
  return spawn(cmd, args, {
    detached: false,
    stdio: ["ignore", "pipe", "pipe"],
    env: options.env || process.env,
    cwd: options.cwd,
  });
}

function killProcess(child) {
  if (!child) return;
  try {
    let exited = false;
    child.once("exit", () => {
      exited = true;
    });
    child.kill("SIGTERM");
    setTimeout(() => {
      if (!exited) {
        try {
          child.kill("SIGKILL");
        } catch {
          // 进程已不存在
        }
      }
    }, 3000);
  } catch {
    // 进程已不存在
  }
}

module.exports = { isPortOpen, waitForPort, spawnProcess, killProcess };
