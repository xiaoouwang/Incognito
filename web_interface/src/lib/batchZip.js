import JSZip from "jszip";
import { buildBatchFileOutputs, LABEL_STUDIO_NER_CONFIG } from "./batchOutputs.js";
import {
  buildBatchOutputFileNames,
  downloadFile,
  formatBatchOutputTimestamp,
} from "./entityUtils.js";

function writeOutputFiles(root, names, outputs) {
  if (outputs.originalText != null) {
    root.file(names.original, outputs.originalText);
  }
  root.file(names.anonymized, outputs.anonymizedText);
  root.file(names.report, outputs.auditReport);
  root.file(names.labelStudio, outputs.labelStudioJson);
  if (outputs.correspondenceCsv) {
    root.file(names.correspondence, outputs.correspondenceCsv);
  }
  if (outputs.personGraphCsv) {
    root.file(names.personGraph, outputs.personGraphCsv);
  }
  if (outputs.personGraphByPersonCsv) {
    root.file(names.personGraphByPerson, outputs.personGraphByPersonCsv);
  }
}

export async function downloadBatchZip({
  files,
  fileStates,
  nerBackend,
  outputLabel,
  buildFileOutputs,
  replacementStyle,
  categoryMethods,
  generalizationLadders = {},
  includePersonGraph = true,
  surfaceOverrides = {},
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
    const relations = savedState?.relations || [];
    const excludedPlaceholders = savedState?.excludedPlaceholders || {};
    const excludedSurfaces = savedState?.excludedSurfaces || {};
    const fileSurfaceOverrides = savedState?.surfaceOverrides || surfaceOverrides;

    const buildOutputs =
      buildFileOutputs ||
      ((params) =>
        buildBatchFileOutputs({
          ...params,
          nerBackend,
          replacementStyle,
          categoryMethods,
          generalizationLadders,
          includePersonGraph,
        }));

    const outputs = buildOutputs({
      sourceFileName: file.name,
      fileText,
      entities: fileEntities,
      selectedCategories,
      excludedEntityKeys,
      customCategories,
      modelName,
      replacementStyle,
      categoryMethods,
      generalizationLadders,
      relations,
      excludedPlaceholders,
      excludedSurfaces,
      surfaceOverrides: fileSurfaceOverrides,
      includePersonGraph,
    });

    const names = buildBatchOutputFileNames(file.name, modified);
    writeOutputFiles(root, names, outputs);
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${folderName}.zip`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Single-document export package (non-batch): anonymized text, audit report,
 * correspondence CSV, original text, and person-graph CSVs when available.
 */
export async function downloadSingleExportZip({
  baseName,
  originalText,
  anonymizedText,
  auditReport,
  correspondenceCsv,
  personGraphCsv = "",
  personGraphByPersonCsv = "",
  labelStudioJson = null,
}) {
  const stamp = formatBatchOutputTimestamp();
  const folderName = `${baseName || "incognito-export"}-${stamp}`;
  const zip = new JSZip();
  const root = zip.folder(folderName);
  const names = buildBatchOutputFileNames(`${baseName || "document"}.txt`, false);

  writeOutputFiles(root, names, {
    originalText: originalText ?? "",
    anonymizedText: anonymizedText ?? "",
    auditReport: auditReport ?? "",
    labelStudioJson: labelStudioJson || "{}",
    correspondenceCsv,
    personGraphCsv,
    personGraphByPersonCsv,
  });
  root.file("label-studio-ner-config.xml", LABEL_STUDIO_NER_CONFIG);

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${folderName}.zip`;
  link.click();
  URL.revokeObjectURL(url);
  return folderName;
}

export function downloadLabelStudioBundle({ jsonContent, defaultBaseName }) {
  downloadFile(jsonContent, `${defaultBaseName}.json`, "application/json;charset=utf-8");
  downloadFile(LABEL_STUDIO_NER_CONFIG, `${defaultBaseName}-config.xml`, "application/xml;charset=utf-8");
}
