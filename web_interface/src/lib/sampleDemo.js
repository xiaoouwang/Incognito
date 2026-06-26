import { SAMPLE_TEXT } from "./constants.js";
import {
  createCategorySelectionFromEntities,
  expandEntityValueOccurrences,
  normalizeEntities,
} from "./entityUtils.js";

export const DEMO_MODEL_LABEL = "Sample demo (preloaded)";

/** Pre-annotated spans for the default interview excerpt (no model download required). */
const DEMO_ENTITY_SPECS = [
  { label: "person", text: "Claire", start: 0, end: 6 },
  { label: "organization", text: "INRAE", start: 122, end: 127 },
  { label: "organization", text: "Université de Montpellier", start: 133, end: 158 },
  { label: "location", text: "Baillarguet", start: 182, end: 193 },
  { label: "organization", text: "AgroResilience", start: 220, end: 234 },
  { label: "date", text: "2022", start: 242, end: 246 },
  { label: "person", text: "Julien", start: 421, end: 427 },
  { label: "organization", text: "AgroNova", start: 454, end: 462 },
  { label: "organization", text: "Floralis", start: 592, end: 600 },
  { label: "location", text: "France", start: 662, end: 668 },
  { label: "location", text: "Espagne", start: 675, end: 682 },
];

export function buildSampleDemoState() {
  const seeded = DEMO_ENTITY_SPECS.map((entity) => ({ ...entity, source: "demo" }));
  const expanded = expandEntityValueOccurrences(SAMPLE_TEXT, seeded);
  const entities = normalizeEntities(expanded, SAMPLE_TEXT);

  return {
    text: SAMPLE_TEXT,
    entities,
    selectedCategories: createCategorySelectionFromEntities(entities),
    excludedEntityKeys: {},
    modelName: DEMO_MODEL_LABEL,
  };
}

export function isSampleDemoText(value) {
  return value === SAMPLE_TEXT;
}
