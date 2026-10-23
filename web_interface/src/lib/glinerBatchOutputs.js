import { createLabelStudioExport } from "../labelStudioExport.js";
import { createAuditReport } from "./auditReport.js";
import { groupEntities, isEntityActive } from "./entityUtils.js";
import { GLINER_MODEL_ID } from "./glinerConstants.js";
import { replaceGlinerSelectedLabels } from "./glinerUtils.js";

export function buildGlinerBatchFileOutputs({
  sourceFileName,
  fileText,
  entities,
  selectedCategories,
  excludedEntityKeys,
  customCategories,
  modelName,
  replacementStyle,
  categoryMethods,
  generalizationLadders = {},
}) {
  const grouped = groupEntities(entities);
  const anonymizedText = replaceGlinerSelectedLabels(
    fileText,
    entities,
    selectedCategories,
    excludedEntityKeys,
    { style: replacementStyle, categoryMethods, salt: fileText, generalizationLadders },
  );
  const activeEntities = entities.filter((entity) =>
    isEntityActive(entity, selectedCategories, excludedEntityKeys),
  );
  const auditReport = createAuditReport({
    text: fileText,
    entities,
    anonymizedText,
    groupedEntities: grouped,
    selectedCategories,
    excludedEntityKeys,
    modelName: modelName || GLINER_MODEL_ID,
    sourceFile: sourceFileName,
    nerBackend: "gliner",
    batchMode: true,
    customCategories,
    categoryMethods,
    replacementStyle,
    generalizationLadders,
  });
  const labelStudioJson = JSON.stringify(
    createLabelStudioExport({
      text: fileText,
      entities: activeEntities,
      modelName: modelName || GLINER_MODEL_ID,
      nerBackend: "gliner",
      sourceFile: sourceFileName,
      customCategories,
    }),
    null,
    2,
  );

  return { anonymizedText, auditReport, labelStudioJson };
}
