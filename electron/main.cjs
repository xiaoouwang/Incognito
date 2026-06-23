const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");

const isDev = Boolean(process.env.ELECTRON_START_URL);
let nerService = null;
let mainWindow = null;

function log(message) {
  console.log(`[main] ${message}`);
}

function isAllowedAppUrl(url) {
  try {
    const parsed = new URL(url);

    if (parsed.protocol === "file:") {
      return true;
    }

    if (isDev && process.env.ELECTRON_START_URL) {
      const devUrl = new URL(process.env.ELECTRON_START_URL);
      return parsed.origin === devUrl.origin;
    }
  } catch {
    return false;
  }

  return false;
}

function openExternalLink(url) {
  if (typeof url === "string" && /^https?:\/\//i.test(url)) {
    void shell.openExternal(url);
  }
}

function attachExternalLinkHandlers(webContents) {
  webContents.setWindowOpenHandler(({ url }) => {
    openExternalLink(url);
    return { action: "deny" };
  });

  webContents.on("will-navigate", (event, url) => {
    if (!isAllowedAppUrl(url)) {
      event.preventDefault();
      openExternalLink(url);
    }
  });
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
    title: "Text Data Anonymizer",
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

  attachExternalLinkHandlers(mainWindow.webContents);

  const rendererPath = path.join(__dirname, "../dist/index.html");
  if (isDev) {
    log(`Loading dev renderer from ${process.env.ELECTRON_START_URL}`);
    mainWindow.loadURL(process.env.ELECTRON_START_URL);
  } else {
    log(`Loading renderer from ${rendererPath}`);
    mainWindow.loadFile(rendererPath);
  }
}

ipcMain.handle("ner:detect", async (_event, text, backend = "spacy") => {
  if (typeof text !== "string") {
    throw new Error("Expected text input for NER detection.");
  }

  return getNerService().detect(text, backend);
});

ipcMain.handle("export:labelStudio", async (_event, { jsonContent, configContent, defaultBaseName }) => {
  if (typeof jsonContent !== "string" || typeof configContent !== "string") {
    throw new Error("Expected JSON and labeling config content for export.");
  }

  const { canceled, filePath } = await dialog.showSaveDialog({
    title: "Export Label Studio annotations",
    defaultPath: `${defaultBaseName || "label-studio-ner"}.json`,
    filters: [{ name: "Label Studio JSON", extensions: ["json"] }],
  });

  if (canceled || !filePath) {
    return { canceled: true };
  }

  const configPath = path.join(path.dirname(filePath), "label-studio-ner-config.xml");
  fs.writeFileSync(filePath, jsonContent, "utf8");
  fs.writeFileSync(configPath, configContent, "utf8");

  return {
    canceled: false,
    jsonPath: filePath,
    configPath,
  };
});

ipcMain.handle("batch:anonymizeLabelStudio", async () => {
  const inputDialog = await dialog.showOpenDialog({
    title: "Select folder with Label Studio JSON exports",
    properties: ["openDirectory"],
  });

  if (inputDialog.canceled || !inputDialog.filePaths[0]) {
    return { canceled: true };
  }

  const outputDialog = await dialog.showOpenDialog({
    title: "Select output folder for reports and anonymized text",
    properties: ["openDirectory", "createDirectory"],
  });

  if (outputDialog.canceled || !outputDialog.filePaths[0]) {
    return { canceled: true };
  }

  const scriptPath = getAnonymizationScriptPath();
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Anonymization script not found at ${scriptPath}`);
  }

  return runAnonymizationBatch(
    scriptPath,
    inputDialog.filePaths[0],
    outputDialog.filePaths[0],
  );
});

const TEXT_EXTENSIONS = new Set([".txt", ".text"]);
const OUTPUT_ARTIFACT_STEMS = ["-anonymized", "-report", "-label-studio"];
const OUTPUT_ARTIFACT_NAMES = new Set([
  "batch-summary.json",
  "label-studio-ner-config.xml",
]);

function isSourceTextFile(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (!TEXT_EXTENSIONS.has(extension)) return false;
  if (OUTPUT_ARTIFACT_NAMES.has(path.basename(filePath))) return false;

  const stem = path.basename(filePath, extension);
  return !OUTPUT_ARTIFACT_STEMS.some((suffix) => stem.endsWith(suffix));
}

function discoverTextFiles(folderPath) {
  const entries = fs.readdirSync(folderPath, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && isSourceTextFile(path.join(folderPath, entry.name)))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right))
    .map((name) => {
      const filePath = path.join(folderPath, name);
      const extension = path.extname(name);
      const stem = path.basename(name, extension);
      return {
        path: filePath,
        name,
        stem,
        text: fs.readFileSync(filePath, "utf8"),
      };
    });
}

ipcMain.handle("batch:loadTextFolder", async () => {
  const folderDialog = await dialog.showOpenDialog({
    title: "Select folder with text files",
    properties: ["openDirectory"],
  });

  if (folderDialog.canceled || !folderDialog.filePaths[0]) {
    return { canceled: true };
  }

  const folderPath = folderDialog.filePaths[0];
  const files = discoverTextFiles(folderPath);

  if (!files.length) {
    throw new Error(
      "No source text files found. Use plain .txt or .text files and exclude prior anonymized outputs.",
    );
  }

  return {
    canceled: false,
    folderPath,
    files,
  };
});

ipcMain.handle(
  "batch:writeOutputs",
  async (_event, { sourcePath, anonymizedText, auditReport, labelStudioJson, labelStudioConfig }) => {
    if (typeof sourcePath !== "string" || !sourcePath.trim()) {
      throw new Error("Expected a source file path for batch output.");
    }
    if (typeof anonymizedText !== "string" || typeof auditReport !== "string") {
      throw new Error("Expected anonymized text and audit report content.");
    }
    if (typeof labelStudioJson !== "string") {
      throw new Error("Expected Label Studio JSON content.");
    }

    const extension = path.extname(sourcePath);
    const stem = path.basename(sourcePath, extension);
    const outputDir = path.dirname(sourcePath);
    const anonymizedPath = path.join(outputDir, `${stem}-anonymized.txt`);
    const reportPath = path.join(outputDir, `${stem}-report.md`);
    const labelStudioPath = path.join(outputDir, `${stem}-label-studio.json`);
    const labelStudioConfigPath = path.join(outputDir, "label-studio-ner-config.xml");

    fs.writeFileSync(anonymizedPath, anonymizedText, "utf8");
    fs.writeFileSync(reportPath, auditReport, "utf8");
    fs.writeFileSync(labelStudioPath, labelStudioJson, "utf8");

    if (typeof labelStudioConfig === "string" && !fs.existsSync(labelStudioConfigPath)) {
      fs.writeFileSync(labelStudioConfigPath, labelStudioConfig, "utf8");
    }

    return {
      anonymizedPath,
      reportPath,
      labelStudioPath,
      labelStudioConfigPath: fs.existsSync(labelStudioConfigPath) ? labelStudioConfigPath : null,
    };
  },
);

ipcMain.handle("batch:processTextFolder", async (_event, options = {}) => {
  const { backend = "spacy-lg", categories = [] } = options;

  if (!Array.isArray(categories) || categories.length === 0) {
    throw new Error("Select at least one entity category to anonymize.");
  }

  const inputDialog = await dialog.showOpenDialog({
    title: "Select folder with text files to anonymize",
    properties: ["openDirectory"],
  });

  if (inputDialog.canceled || !inputDialog.filePaths[0]) {
    return { canceled: true };
  }

  const outputDialog = await dialog.showOpenDialog({
    title: "Select output folder for anonymized files and reports",
    properties: ["openDirectory", "createDirectory"],
  });

  if (outputDialog.canceled || !outputDialog.filePaths[0]) {
    return { canceled: true };
  }

  let outputDir = outputDialog.filePaths[0];
  const inputDir = inputDialog.filePaths[0];
  let outputRedirected = false;

  if (path.resolve(outputDir) === path.resolve(inputDir)) {
    outputDir = path.join(inputDir, "anonymized-results");
    outputRedirected = true;
  }

  const scriptPath = getBatchTextScriptPath();
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Batch text script not found at ${scriptPath}`);
  }

  return runPythonJsonScript(scriptPath, [
    "--input-dir",
    inputDir,
    "--output-dir",
    outputDir,
    "--backend",
    backend,
    "--categories",
    categories.join(","),
  ]).then((summary) => ({
    ...summary,
    output_redirected: outputRedirected,
  }));
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

  async detect(text, backend = "spacy") {
    await this.start();

    const id = String(this.nextRequestId++);
    const request = new Promise((resolve, reject) => {
      this.pending.set(id, {
        resolve,
        reject,
        timeout: setTimeout(() => {
          this.pending.delete(id);
          reject(new Error("Local NER detection timed out."));
        }, 180000),
      });
    });

    this.child.stdin.write(`${JSON.stringify({ id, text, backend })}\n`);
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

function getPythonCommand() {
  const resourceRoot = app.isPackaged ? process.resourcesPath : path.join(__dirname, "..");
  const localPython = path.join(
    resourceRoot,
    process.platform === "win32" ? ".venv/Scripts/python.exe" : ".venv/bin/python",
  );

  return process.env.PYTHON || (fs.existsSync(localPython) ? localPython : "python3");
}

function getAnonymizationScriptPath() {
  const resourceRoot = app.isPackaged ? process.resourcesPath : path.join(__dirname, "..");
  return path.join(resourceRoot, "scripts/anonymization_report.py");
}

function getBatchTextScriptPath() {
  const resourceRoot = app.isPackaged ? process.resourcesPath : path.join(__dirname, "..");
  return path.join(resourceRoot, "scripts/batch_anonymize_texts.py");
}

function runPythonJsonScript(scriptPath, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(getPythonCommand(), [scriptPath, ...args]);

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(new Error(`Could not run Python script. ${error.message}`));
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(stderr.trim() || stdout.trim() || `Python script exited with code ${code}.`),
        );
        return;
      }

      try {
        const summary = JSON.parse(stdout.trim());
        resolve({ canceled: false, ...summary });
      } catch (error) {
        reject(new Error(`Could not parse Python script result. ${error.message}`));
      }
    });
  });
}

function runAnonymizationBatch(scriptPath, inputDir, outputDir) {
  return runPythonJsonScript(scriptPath, ["--input-dir", inputDir, "--output-dir", outputDir]);
}
