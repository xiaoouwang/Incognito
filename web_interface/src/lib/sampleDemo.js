import { SAMPLE_TEXT } from "./constants.js";
import {
  createCategorySelectionFromEntities,
  expandEntityValueOccurrences,
  normalizeEntities,
} from "./entityUtils.js";
import { buildPersonGraphFromRelex } from "./glinerRelexPersonGraph.js";
import sampleDemoRelexFixture from "./sampleDemoRelexFixture.json";

export const DEMO_MODEL_LABEL = "Sample demo (preloaded)";

/**
 * Captured GLiNER-ReLex relations for the Marie Dupont sample (no model download).
 * Shape matches `extractGlinerRelexRelations` / `buildPersonGraphFromRelex`.
 */
export function getSampleDemoRelexRelations() {
  return (sampleDemoRelexFixture.relations || []).map((relation) => ({
    head: {
      text: relation.head?.text || "",
      label: relation.head?.label || "",
      start: relation.head?.start,
      end: relation.head?.end,
      score: relation.head?.score,
    },
    tail: {
      text: relation.tail?.text || "",
      label: relation.tail?.label || "",
      start: relation.tail?.start,
      end: relation.tail?.end,
      score: relation.tail?.score,
    },
    relation: relation.relation,
    score: relation.score,
    source: "demo-fixture",
  }));
}

/** Pre-annotated spans for the default Marie Dupont excerpt (no model download required). */
const DEMO_ENTITY_SPECS = [
  { label: "person", text: "Marie Dupont" },
  { label: "person", text: "Marie" },
  { label: "person", text: "Pierre Martin" },
  { label: "person", text: "Lucas" },
  { label: "person", text: "Emma" },
  { label: "person", text: "Jean Dupont" },
  { label: "person", text: "Sophie" },
  { label: "address", text: "15 rue des Orangers" },
  { label: "location", text: "Nice" },
  { label: "location", text: "Lyon" },
  { label: "location", text: "Cimiez" },
  { label: "location", text: "Cannes" },
  { label: "location", text: "Pékin" },
  { label: "school", text: "lycée Masséna" },
  { label: "hospital", text: "hôpital Pasteur" },
  { label: "organization", text: "Université Côte d’Azur" },
  { label: "organization", text: "mairie de Cannes" },
  { label: "profession", text: "enseignante" },
  { label: "profession", text: "médecin" },
  { label: "profession", text: "professeur" },
  { label: "age", text: "43 ans" },
  { label: "age", text: "12 ans" },
  { label: "age", text: "8 ans" },
  { label: "date", text: "septembre 2018" },
  { label: "date", text: "14 mars 1983" },
  { label: "date", text: "5 octobre 2026" },
  { label: "date", text: "2020" },
  { label: "date", text: "2019" },
  { label: "email", text: "marie.dupont@example.com" },
  { label: "phone number", text: "06 12 34 56 78" },
  { label: "family member", text: "mari" },
  { label: "family member", text: "père" },
  { label: "family member", text: "sœur" },
  { label: "family member", text: "fils" },
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

/**
 * Prebuilt person graph for the sample demo (entities + captured ReLex fixture).
 * Synchronous — no model download — so "Show person graph" works immediately.
 */
export function buildSampleDemoPersonGraph() {
  const demo = buildSampleDemoState();
  const relations = getSampleDemoRelexRelations();
  const graph = buildPersonGraphFromRelex(demo.text, demo.entities, relations, {
    fillProximity: true,
  });
  return {
    ...demo,
    relations,
    persons: graph.persons || [],
    relexRelationCount: graph.relexRelationCount ?? relations.length,
  };
}

export function isSampleDemoText(value) {
  return value === SAMPLE_TEXT;
}
