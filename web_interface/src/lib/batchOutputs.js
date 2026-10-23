import {
  createLabelStudioExport,
  LABEL_STUDIO_NER_CONFIG,
} from "../labelStudioExport.js";
import { createAuditReport } from "./auditReport.js";
import { replaceSelectedCategories, groupEntities, isEntityActive } from "./entityUtils.js";

export { LABEL_STUDIO_NER_CONFIG };

export function buildBatchFileOutputs({
  sourceFileName,
  fileText,
  entities,
  selectedCategories,
  excludedEntityKeys,
  customCategories,
  modelName,
  nerBackend,
  replacementStyle,
  categoryMethods,
  generalizationLadders = {},
}) {
  const grouped = groupEntities(entities);
  const anonymizedText = replaceSelectedCategories(
    fileText,
    entities,
    grouped,
    selectedCategories,
    excludedEntityKeys,
    customCategories,
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
    modelName,
    sourceFile: sourceFileName,
    nerBackend,
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
      modelName,
      nerBackend,
      sourceFile: sourceFileName,
      customCategories,
    }),
    null,
    2,
  );

  return { anonymizedText, auditReport, labelStudioJson };
}
