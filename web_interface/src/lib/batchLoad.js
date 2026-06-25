import mammoth from "mammoth";

export const BATCH_FILE_ACCEPT = ".txt,.text,.docx";

const SUPPORTED_NAME_PATTERN = /\.(txt|text|docx)$/i;

export function isSupportedBatchFileName(name) {
  return SUPPORTED_NAME_PATTERN.test(name);
}

async function extractTextFromFile(file) {
  if (/\.docx$/i.test(file.name)) {
    const arrayBuffer = await file.arrayBuffer();
    const { value } = await mammoth.extractRawText({ arrayBuffer });
    return value;
  }

  return file.text();
}

async function fileToBatchEntry(file, relativePath) {
  return {
    id: relativePath,
    name: file.name,
    path: relativePath,
    text: await extractTextFromFile(file),
  };
}

function sortBatchFiles(files) {
  return [...files].sort((left, right) => left.path.localeCompare(right.path));
}

function reportProgress(onProgress, phase, current, total, fileName) {
  onProgress?.({ phase, current, total, fileName });
}

async function readEntriesWithProgress(entries, onProgress) {
  const files = [];

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    reportProgress(onProgress, "loading", index + 1, entries.length, entry.name);

    files.push(
      await fileToBatchEntry(entry.file, entry.relativePath),
    );
  }

  return sortBatchFiles(files);
}

async function collectDirectoryEntries(directoryHandle, prefix = "") {
  const entries = [];

  for await (const handle of directoryHandle.values()) {
    const relativePath = `${prefix}${handle.name}`;

    if (handle.kind === "directory") {
      entries.push(...(await collectDirectoryEntries(handle, `${relativePath}/`)));
      continue;
    }

    if (handle.kind !== "file" || !isSupportedBatchFileName(handle.name)) {
      continue;
    }

    entries.push({
      name: handle.name,
      relativePath,
      file: await handle.getFile(),
    });
  }

  return entries;
}

export async function readDocumentsFromDirectoryPicker(onProgress) {
  if (!window.showDirectoryPicker) {
    return null;
  }

  reportProgress(onProgress, "loading", 0, 0, "");
  const directoryHandle = await window.showDirectoryPicker();
  const entries = await collectDirectoryEntries(directoryHandle);
  const files = await readEntriesWithProgress(entries, onProgress);

  return {
    files,
    folderLabel: directoryHandle.name,
  };
}

export async function readDocumentsFromFolderInput(fileList, onProgress) {
  const candidates = Array.from(fileList).filter((file) => isSupportedBatchFileName(file.name));
  const entries = candidates.map((file) => ({
    name: file.name,
    relativePath: file.webkitRelativePath || file.name,
    file,
  }));

  return readEntriesWithProgress(entries, onProgress);
}

export async function readDocumentsFromFilePicker(fileList, onProgress) {
  const candidates = Array.from(fileList).filter((file) => isSupportedBatchFileName(file.name));
  const entries = candidates.map((file) => ({
    name: file.name,
    relativePath: file.name,
    file,
  }));

  return readEntriesWithProgress(entries, onProgress);
}

export function batchSourceLabel(files, explicitLabel) {
  if (explicitLabel) {
    return explicitLabel;
  }

  if (files.length === 1) {
    return files[0].name;
  }

  return `${files.length} selected files`;
}

export const BATCH_EMPTY_MESSAGE =
  "No supported documents found. Choose .txt or .docx files (Word .doc is not supported).";
