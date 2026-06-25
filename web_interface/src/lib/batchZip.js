import JSZip from "jszip";
import { buildBatchFileOutputs, LABEL_STUDIO_NER_CONFIG } from "./batchOutputs.js";
import {
  buildBatchOutputFileNames,
  downloadFile,
  formatBatchOutputTimestamp,
} from "./entityUtils.js";

export async function downloadBatchZip({
  files,
  fileStates,
  nerBackend,
  outputLabel,
}) {
  const folderName = outputLabel || `outputs-${formatBatchOutputTimestamp()}`;
  const zip = new JSZip();
  const root = zip.folder(folderName);

  root.file("label-studio-ner-config.xml", LABEL_STUDIO_NER_CONFIG);

  for (const file of files) {
    const savedState = fileStates[file.id];
    const fileText = savedState?.text ?? file.text;
    const fileEntities = savedState?.entities ?? [];
    const selectedCategories = savedState?.selectedCategories ?? {};
    const excludedEntityKeys = savedState?.excludedEntityKeys ?? {};
    const customCategories = savedState?.customCategories ?? {};
    const modelName = savedState?.modelName ?? null;
    const modified = savedState?.outputsModified ?? false;

    const { anonymizedText, auditReport, labelStudioJson } = buildBatchFileOutputs({
      sourceFileName: file.name,
      fileText,
      entities: fileEntities,
      selectedCategories,
      excludedEntityKeys,
      customCategories,
      modelName,
      nerBackend,
    });

    const names = buildBatchOutputFileNames(file.name, modified);
    root.file(names.anonymized, anonymizedText);
    root.file(names.report, auditReport);
    root.file(names.labelStudio, labelStudioJson);
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${folderName}.zip`;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadLabelStudioBundle({ jsonContent, defaultBaseName }) {
  downloadFile(jsonContent, `${defaultBaseName}.json`, "application/json;charset=utf-8");
  downloadFile(LABEL_STUDIO_NER_CONFIG, `${defaultBaseName}-config.xml`, "application/xml;charset=utf-8");
}
