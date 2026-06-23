const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;

function readBundleMeta() {
  const metaPath = path.join(root, "python-dist/ner-service/.bundle-meta.json");
  if (!fs.existsSync(metaPath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(metaPath, "utf8"));
  } catch {
    return null;
  }
}

function hasNerBundleFor(platform) {
  const executableName = platform === "win32" ? "ner-service.exe" : "ner-service";
  const executablePath = path.join(root, "python-dist/ner-service", executableName);
  if (!fs.existsSync(executablePath)) {
    return false;
  }

  const meta = readBundleMeta();
  if (meta) {
    return meta.platform === platform;
  }

  const hostPlatformByTarget = {
    darwin: "darwin",
    win32: "win32",
    linux: "linux",
  };

  return hostPlatformByTarget[platform] === process.platform;
}

function nerBundleResource() {
  return {
    from: "python-dist/ner-service",
    to: "bin/ner-service",
  };
}

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: "com.frenchnlp.qualitative-text-anonymizer",
  productName: "Text Data Anonymizer",
  directories: {
    output: "release",
  },
  files: [
    "dist/**/*",
    "electron/**/*",
    "scripts/**/*",
    "package.json",
  ],
  extraResources: [
    {
      from: "scripts",
      to: "scripts",
    },
    {
      from: "requirements.txt",
      to: "requirements.txt",
    },
  ],
  mac: {
    target: ["dmg", "zip"],
    category: "public.app-category.productivity",
    extraResources: hasNerBundleFor("darwin") ? [nerBundleResource()] : [],
  },
  win: {
    target: [
      { target: "nsis", arch: ["x64", "arm64"] },
      { target: "zip", arch: ["x64", "arm64"] },
    ],
    extraResources: hasNerBundleFor("win32") ? [nerBundleResource()] : [],
  },
  linux: {
    target: [
      { target: "AppImage", arch: ["x64", "arm64"] },
      { target: "deb", arch: ["x64", "arm64"] },
    ],
    category: "Office",
    maintainer: "Xiaoou Wang <xiaoou.wang@univ-cotedazur.fr>",
    extraResources: hasNerBundleFor("linux") ? [nerBundleResource()] : [],
  },
};
