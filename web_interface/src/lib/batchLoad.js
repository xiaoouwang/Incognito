function isTextFileName(name) {
  return /\.(txt|text)$/i.test(name);
}

async function readDirectoryHandle(directoryHandle, prefix = "") {
  const files = [];

  for await (const entry of directoryHandle.values()) {
    const relativePath = `${prefix}${entry.name}`;

    if (entry.kind === "directory") {
      files.push(...(await readDirectoryHandle(entry, `${relativePath}/`)));
      continue;
    }

    if (entry.kind !== "file" || !isTextFileName(entry.name)) {
      continue;
    }

    const file = await entry.getFile();
    files.push({
      id: relativePath,
      name: entry.name,
      path: relativePath,
      text: await file.text(),
    });
  }

  return files;
}

export async function readTextFilesFromDirectoryPicker() {
  if (!window.showDirectoryPicker) {
    return null;
  }

  const directoryHandle = await window.showDirectoryPicker();
  const files = await readDirectoryHandle(directoryHandle);
  files.sort((left, right) => left.path.localeCompare(right.path));

  return {
    files,
    folderLabel: directoryHandle.name,
  };
}

export async function readTextFilesFromInput(fileList) {
  const candidates = Array.from(fileList).filter((file) => isTextFileName(file.name));

  candidates.sort((left, right) => {
    const leftPath = left.webkitRelativePath || left.name;
    const rightPath = right.webkitRelativePath || right.name;
    return leftPath.localeCompare(rightPath);
  });

  return Promise.all(
    candidates.map(async (file) => {
      const relativePath = file.webkitRelativePath || file.name;
      return {
        id: relativePath,
        name: file.name,
        path: relativePath,
        text: await file.text(),
      };
    }),
  );
}
