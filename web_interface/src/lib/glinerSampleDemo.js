import { GLINER_SAMPLE_TEXT } from "./glinerConstants.js";
import { createCategorySelectionFromEntities, normalizeEntities } from "./entityUtils.js";

export const GLINER_DEMO_MODEL_LABEL = "Sample demo (preloaded)";

const DEMO_ENTITY_SPECS = [
  { label: "person", text: "Jean Dupont" },
  { label: "person", text: "Marie Dupont" },
  { label: "person", text: "Paul" },
  { label: "organization", text: "Université Côte d'Azur" },
  { label: "organization", text: "Université Paris-Saclay" },
  { label: "organization", text: "CNRS" },
  { label: "organization", text: "INRIA\nSophia Antipolis" },
  { label: "organization", text: "Orange" },
  { label: "organization", text: "INSERM" },
  { label: "location", text: "Nice" },
  { label: "location", text: "France" },
  { label: "location", text: "Paris" },
  { label: "location", text: "Marseille" },
  { label: "address", text: "15 avenue Jean Médecin, 06000 Nice" },
  { label: "email", text: "jean.dupont@univ-cotedazur.fr" },
  { label: "phone number", text: "06 12 34 56 78" },
  { label: "date", text: "septembre 2018" },
  { label: "date", text: "12 mai 2023" },
  { label: "profession", text: "professeur d'informatique" },
  { label: "profession", text: "médecin" },
  { label: "profession", text: "chercheuse" },
  { label: "job title or project role", text: "responsable scientifique du\nprojet CampusNum" },
  { label: "job title or project role", text: "chef de projet réseau 5G" },
  { label: "job title or project role", text: "investigatrice principale sur l'étude OncoSud" },
  { label: "school", text: "lycée Masséna" },
  { label: "hospital", text: "CHU de Nice" },
  { label: "family member", text: "Ma femme" },
  { label: "family member", text: "Notre fils" },
  { label: "family member", text: "ma mère" },
  { label: "family member", text: "Mon frère" },
  { label: "family member", text: "ma sœur" },
  { label: "nationality", text: "française" },
  { label: "nationality", text: "italienne" },
  { label: "disease", text: "diabète de type 2" },
  { label: "disease", text: "hypertension artérielle" },
  { label: "disease", text: "asthme légère" },
  { label: "disease", text: "maladie d'Alzheimer" },
  { label: "disease", text: "cancer du sein" },
  { label: "disease", text: "sclérose en plaques" },
  { label: "diploma", text: "doctorat en informatique" },
  { label: "diploma", text: "agrégation de\nmathématiques" },
  { label: "diploma", text: "diplôme\nde médecine générale" },
  { label: "diploma", text: "baccalauréat scientifique" },
  { label: "diploma", text: "doctorat en biologie" },
];

function findDemoEntity(text, spec, score = 0.85) {
  const start = text.indexOf(spec.text);
  if (start === -1) {
    throw new Error(`GLiNER demo span not found: ${spec.label} "${spec.text}"`);
  }

  return {
    text: spec.text,
    label: spec.label,
    start,
    end: start + spec.text.length,
    score,
    source: "demo",
  };
}

export function buildGlinerSampleDemoState() {
  const seeded = DEMO_ENTITY_SPECS.map((spec) => findDemoEntity(GLINER_SAMPLE_TEXT, spec));
  const entities = normalizeEntities(seeded, GLINER_SAMPLE_TEXT);

  return {
    text: GLINER_SAMPLE_TEXT,
    entities,
    selectedCategories: createCategorySelectionFromEntities(entities),
    excludedEntityKeys: {},
    modelName: GLINER_DEMO_MODEL_LABEL,
  };
}

export function isGlinerSampleDemoText(value) {
  return value === GLINER_SAMPLE_TEXT;
}
