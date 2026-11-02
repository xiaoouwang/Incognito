import { createLabelStudioExport } from "../labelStudioExport.js";
import { createAuditReport } from "./auditReport.js";
import { buildCorrespondenceCsv } from "./correspondenceExport.js";
import { groupEntities, isEntityActive } from "./entityUtils.js";
import { GLINER_MODEL_ID } from "./glinerConstants.js";
import { buildPersonGraphFromRelex } from "./glinerRelexPersonGraph.js";
import { replaceGlinerSelectedLabels } from "./glinerUtils.js";
import {
  buildPersonGraphByPersonCsv,
  buildPersonGraphCsv,
} from "./personGraphCsv.js";

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
  persons = null,
  relations = [],
  excludedPlaceholders = {},
  excludedSurfaces = {},
  surfaceOverrides = {},
  includePersonGraph = true,
}) {
  const grouped = groupEntities(entities);
  const anonymizedText = replaceGlinerSelectedLabels(
    fileText,
    entities,
    selectedCategories,
    excludedEntityKeys,
    {
      style: replacementStyle,
      categoryMethods,
      salt: fileText,
      generalizationLadders,
      persons,
      surfaceOverrides,
    },
  );
  const activeEntities = entities.filter((entity) =>
    isEntityActive(entity, selectedCategories, excludedEntityKeys),
  );
  const resolvedPersons =
    Array.isArray(persons) && persons.length
      ? persons
      : includePersonGraph && (relations?.length || entities?.length)
        ? buildPersonGraphFromRelex(fileText, entities, relations || [], {
            fillProximity: true,
          }).persons || []
        : [];

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
    persons: resolvedPersons,
    surfaceOverrides,
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
  const correspondenceCsv = buildCorrespondenceCsv({
    text: fileText,
    entities,
    groupedEntities: grouped,
    selectedCategories,
    excludedEntityKeys,
    customCategories,
    categoryMethods,
    replacementStyle,
    generalizationLadders,
    persons: resolvedPersons,
    surfaceOverrides,
  });

  let personGraphCsv = "";
  let personGraphByPersonCsv = "";
  if (includePersonGraph && resolvedPersons.length) {
    const graphOptions = { excludedPlaceholders, excludedSurfaces };
    personGraphCsv = buildPersonGraphCsv(resolvedPersons, graphOptions);
    personGraphByPersonCsv = buildPersonGraphByPersonCsv(resolvedPersons, graphOptions);
  }

  return {
    originalText: fileText,
    anonymizedText,
    auditReport,
    labelStudioJson,
    correspondenceCsv,
    personGraphCsv,
    personGraphByPersonCsv,
  };
}
