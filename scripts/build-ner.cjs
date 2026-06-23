const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const isWin = process.platform === "win32";
const python = path.join(root, isWin ? ".venv/Scripts/python.exe" : ".venv/bin/python");
const pyinstaller = path.join(root, isWin ? ".venv/Scripts/pyinstaller.exe" : ".venv/bin/pyinstaller");
const withCamembert = process.argv.includes("--with-camembert");

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", cwd: root });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function pythonCanImport(moduleName) {
  const result = spawnSync(python, ["-c", `import ${moduleName}`], { cwd: root });
  return result.status === 0;
}

if (!fs.existsSync(python)) {
  console.error("Python venv not found. Create it with: python3.12 -m venv .venv");
  process.exit(1);
}

if (!fs.existsSync(pyinstaller)) {
  console.log("Installing PyInstaller into the local venv...");
  run(python, ["-m", "pip", "install", "pyinstaller"]);
}

if (withCamembert) {
  if (!pythonCanImport("torch") || !pythonCanImport("transformers")) {
    console.error(
      "CamemBERT bundle requested, but torch/transformers are missing from .venv.\n" +
        "Install them first with: pip install -r requirements-camembert.txt",
    );
    process.exit(1);
  }
}

const pyinstallerArgs = [
  "--noconfirm",
  "--clean",
  "--onedir",
  "--name",
  "ner-service",
  "--distpath",
  "python-dist",
  "--workpath",
  "python-build",
  "--collect-all",
  "spacy",
  "--collect-all",
  "fr_core_news_sm",
  "--collect-all",
  "fr_core_news_lg",
];

if (withCamembert) {
  console.log("Building full NER bundle (spaCy + CamemBERT / PyTorch)...");
  pyinstallerArgs.push("--collect-all", "transformers", "--collect-all", "torch");
} else {
  console.log("Building spaCy-only NER bundle...");
  pyinstallerArgs.push("--exclude-module", "torch", "--exclude-module", "transformers");
}

pyinstallerArgs.push(path.join("scripts", "ner.py"));

run(pyinstaller, pyinstallerArgs);

const bundleMeta = {
  platform: process.platform,
  arch: process.arch,
  builtAt: new Date().toISOString(),
  camembertBundled: withCamembert,
  backends: withCamembert ? ["spacy-sm", "spacy-lg", "camembert"] : ["spacy-sm", "spacy-lg"],
};
fs.writeFileSync(
  path.join(root, "python-dist/ner-service/.bundle-meta.json"),
  JSON.stringify(bundleMeta, null, 2),
);
console.log(
  `NER bundle ready: ${bundleMeta.platform} ${bundleMeta.arch}, CamemBERT ${withCamembert ? "included" : "excluded"}.`,
);
