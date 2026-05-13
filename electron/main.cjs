const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");

const isDev = Boolean(process.env.ELECTRON_START_URL);
let nerService = null;
let mainWindow = null;

function log(message) {
  console.log(`[main] ${message}`);
}

function createWindow() {
  log("Creating BrowserWindow");
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 960,
    minHeight: 700,
    show: true,
    backgroundColor: "#f5f1e8",
    title: "Qualitative Text Anonymizer",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    log("BrowserWindow ready-to-show");
    mainWindow.show();
    mainWindow.focus();
    app.focus({ steal: true });
  });

  setTimeout(() => {
    if (mainWindow) {
      log(`Window visibility after timeout: ${mainWindow.isVisible()}`);
      mainWindow.show();
      mainWindow.focus();
      mainWindow.moveTop();
      app.focus({ steal: true });
    }
  }, 1500);

  mainWindow.on("closed", () => {
    log("BrowserWindow closed");
    mainWindow = null;
  });

  mainWindow.webContents.on("did-finish-load", () => {
    log("Renderer finished loading");
  });

  mainWindow.webContents.on("did-fail-load", (_event, code, description, url) => {
    console.error(`Renderer failed to load ${url}: ${code} ${description}`);
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error(`Renderer process gone: ${details.reason}`);
  });

  const rendererPath = path.join(__dirname, "../dist/index.html");
  if (isDev) {
    log(`Loading dev renderer from ${process.env.ELECTRON_START_URL}`);
    mainWindow.loadURL(process.env.ELECTRON_START_URL);
  } else {
    log(`Loading renderer from ${rendererPath}`);
    mainWindow.loadFile(rendererPath);
  }
}

ipcMain.handle("ner:detect", async (_event, text) => {
  if (typeof text !== "string") {
    throw new Error("Expected text input for NER detection.");
  }

  return getNerService().detect(text);
});

app.whenReady().then(() => {
  app.setActivationPolicy("regular");
  log("Electron app ready");
  createWindow();
  getNerService().start().catch((error) => {
    console.error("Failed to warm local NER service:", error);
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  log("All windows closed");
  if (nerService) nerService.stop();
  if (process.platform !== "darwin") app.quit();
});

function getNerService() {
  if (!nerService) nerService = new NerService();
  return nerService;
}

class NerService {
  constructor() {
    this.child = null;
    this.readyPromise = null;
    this.stdoutBuffer = "";
    this.pending = new Map();
    this.nextRequestId = 1;
  }

  start() {
    if (this.readyPromise) return this.readyPromise;

    const { command, args } = getNerCommand();
    this.child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.child.stdout.on("data", (chunk) => {
      this.handleStdout(chunk.toString());
    });

    this.child.stderr.on("data", (chunk) => {
      console.error(`NER service: ${chunk.toString()}`);
    });

    this.child.on("error", (error) => {
      this.rejectAll(
        new Error(`Could not start the local NER service. ${error.message}`),
      );
      this.readyPromise = null;
    });

    this.child.on("close", (code) => {
      if (code !== 0 && this.pending.size > 0) {
        this.rejectAll(new Error(`Local NER service exited with code ${code}.`));
      }
      this.child = null;
      this.readyPromise = null;
    });

    this.readyPromise = new Promise((resolve, reject) => {
      this.pending.set("ready", {
        resolve,
        reject,
        timeout: setTimeout(() => {
          this.pending.delete("ready");
          reject(new Error("Local NER service took too long to start."));
        }, 90000),
      });
    });

    return this.readyPromise;
  }

  async detect(text) {
    await this.start();

    const id = String(this.nextRequestId++);
    const request = new Promise((resolve, reject) => {
      this.pending.set(id, {
        resolve,
        reject,
        timeout: setTimeout(() => {
          this.pending.delete(id);
          reject(new Error("Local NER detection timed out."));
        }, 90000),
      });
    });

    this.child.stdin.write(`${JSON.stringify({ id, text })}\n`);
    return request;
  }

  handleStdout(output) {
    this.stdoutBuffer += output;
    const lines = this.stdoutBuffer.split("\n");
    this.stdoutBuffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      this.handleMessage(JSON.parse(line));
    }
  }

  handleMessage(message) {
    if (message.type === "ready") {
      const ready = this.pending.get("ready");
      if (ready) {
        clearTimeout(ready.timeout);
        this.pending.delete("ready");
        ready.resolve(message);
      }
      return;
    }

    const request = this.pending.get(String(message.id));
    if (!request) return;

    clearTimeout(request.timeout);
    this.pending.delete(String(message.id));

    if (message.type === "error") {
      request.reject(new Error(message.error || "NER service failed."));
      return;
    }

    request.resolve(message.result);
  }

  rejectAll(error) {
    for (const [, request] of this.pending) {
      clearTimeout(request.timeout);
      request.reject(error);
    }
    this.pending.clear();
  }

  stop() {
    if (!this.child) return;
    this.child.kill();
    this.child = null;
    this.readyPromise = null;
  }
}

function getNerCommand() {
  const resourceRoot = app.isPackaged ? process.resourcesPath : path.join(__dirname, "..");
  const scriptPath = path.join(resourceRoot, "scripts/ner.py");
  const bundledNer = path.join(
    resourceRoot,
    "bin/ner-service",
    process.platform === "win32" ? "ner-service.exe" : "ner-service",
  );
  const localPython = path.join(
    resourceRoot,
    process.platform === "win32" ? ".venv/Scripts/python.exe" : ".venv/bin/python",
  );

  if (fs.existsSync(bundledNer)) return { command: bundledNer, args: ["--server"] };

  return {
    command: process.env.PYTHON || (fs.existsSync(localPython) ? localPython : "python3"),
    args: [scriptPath, "--server"],
  };
}
