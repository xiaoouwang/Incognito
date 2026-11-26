#!/usr/bin/env node
/**
 * Assemble a static Pages tree that keeps previous app versions browsable.
 *
 * Layout written to --out:
 *   ./                 ← current build (latest)
 *   ./v{version}/      ← same build, frozen under its version path
 *   ./v{older}/        ← copied from --previous when present
 *   ./versions.json    ← list of available version folders
 *   ./versions.html    ← tiny human index of those links
 *
 * Usage:
 *   node scripts/assembleVersionedPages.mjs \
 *     --dist dist \
 *     --out ../public \
 *     --previous ../.previous-pages \
 *     --version 1.0.5
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..");

function readArg(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1]) {
    return process.argv[index + 1];
  }
  return fallback;
}

function rmrf(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true });
}

function copyDir(src, dest) {
  ensureDir(dest);
  fs.cpSync(src, dest, { recursive: true });
}

function listVersionDirs(root) {
  if (!fs.existsSync(root)) {
    return [];
  }
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^v\d+\.\d+\.\d+$/.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
}

function writeVersionsIndex(outDir, versions, currentVersion) {
  const payload = {
    current: currentVersion,
    versions,
    generatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(outDir, "versions.json"), `${JSON.stringify(payload, null, 2)}\n`);

  const links = versions
    .map((version) => {
      const currentMark = version === `v${currentVersion}` ? " (current build)" : "";
      return `<li><a href="./${version}/">${version}</a>${currentMark}</li>`;
    })
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Incognito — published versions</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 40rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; }
    a { color: #0b5fff; }
    .note { color: #444; font-size: 0.95rem; }
  </style>
</head>
<body>
  <h1>Incognito Web — versions</h1>
  <p class="note">
    Latest build also lives at the
    <a href="./">site root</a>.
    Version folders keep a frozen copy so you can fall back in the browser if a newer release misbehaves.
  </p>
  <ul>
${links || "    <li>No version folders yet.</li>"}
  </ul>
</body>
</html>
`;
  fs.writeFileSync(path.join(outDir, "versions.html"), html);
}

function main() {
  const distDir = path.resolve(webRoot, readArg("dist", "dist"));
  const outDir = path.resolve(webRoot, readArg("out", "../public"));
  const previousDir = path.resolve(webRoot, readArg("previous", "../.previous-pages"));
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(webRoot, "package.json"), "utf8"),
  );
  const version = readArg("version", packageJson.version);
  if (!version || !/^\d+\.\d+\.\d+/.test(version)) {
    throw new Error(`Invalid version: ${version}`);
  }
  const versionDirName = `v${version}`;

  if (!fs.existsSync(distDir)) {
    throw new Error(`Missing build output: ${distDir}`);
  }

  ensureDir(outDir);

  // Keep prior version snapshots when the previous Pages tree is available.
  const preserved = [];
  if (fs.existsSync(previousDir)) {
    for (const name of listVersionDirs(previousDir)) {
      if (name === versionDirName) {
        continue; // current version will be overwritten by this build
      }
      const from = path.join(previousDir, name);
      const to = path.join(outDir, name);
      rmrf(to);
      copyDir(from, to);
      preserved.push(name);
    }
  }

  // Latest at site root
  for (const entry of fs.readdirSync(outDir)) {
    if (/^v\d+\.\d+\.\d+$/.test(entry)) {
      continue;
    }
    rmrf(path.join(outDir, entry));
  }
  for (const entry of fs.readdirSync(distDir)) {
    const from = path.join(distDir, entry);
    const to = path.join(outDir, entry);
    fs.cpSync(from, to, { recursive: true });
  }

  // Frozen copy under /vX.Y.Z/
  const versionPath = path.join(outDir, versionDirName);
  rmrf(versionPath);
  copyDir(distDir, versionPath);

  const versions = listVersionDirs(outDir);
  writeVersionsIndex(outDir, versions, version);

  console.log(
    JSON.stringify(
      {
        version: versionDirName,
        outDir,
        preserved,
        versions,
      },
      null,
      2,
    ),
  );
}

main();
