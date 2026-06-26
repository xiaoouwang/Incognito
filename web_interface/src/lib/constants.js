export const SAMPLE_TEXT = `Claire, ingénieure agronome de formation, doctorat en écologie appliquée, travaille au sein d'un laboratoire commun entre INRAE et l'Université de Montpellier situé sur le campus de Baillarguet. Impliquée dans le projet AgroResilience depuis 2022. Recrutée comme chargée de recherche sur le volet analyse des systèmes agricoles afin d'évaluer les stratégies de réduction des intrants chimiques à l'échelle territoriale.

Julien…

Interviewé : 5 ans chez AgroNova, responsable expérimentation terrain sur les cultures maraîchères (tomate, courgette, poivron), puis coordinateur technique chez Floralis. Travaille avec des coopératives agricoles dans le sud de la France et en Espagne. Assure le suivi des itinéraires techniques et la traçabilité des interventions culturales depuis les semis jusqu'à la commercialisation des produits. Très forte diversité d'exploitations partenaires. Responsable d'une équipe de trois techniciens.`;

export const CATEGORY_LABELS = {
  person: "People",
  location: "Locations",
  organization: "Organizations",
  date: "Dates",
  email: "Emails",
  phone: "Phone numbers",
  url: "URLs",
  misc: "Other entities",
};

export const CATEGORY_PREFIXES = {
  person: "PERSON",
  location: "LOCATION",
  organization: "ORG",
  date: "DATE",
  email: "EMAIL",
  phone: "PHONE",
  url: "URL",
  misc: "ENTITY",
};

export const NER_BACKENDS = {
  "camembert-dates": "French — CamemBERT NER + dates (Xenova/camembert-ner-with-dates)",
  camembert: "French — CamemBERT NER (Xenova/camembert-ner)",
  "bert-en": "English — BERT NER (Xenova/bert-base-NER)",
  custom: "Custom Hugging Face model (ONNX token-classification)",
};

export const CUSTOM_BACKEND_ID = "custom";

export const CUSTOM_MODEL_EXAMPLE = "Xenova/bert-base-NER";

export const NER_MODEL_IDS = {
  camembert: "Xenova/camembert-ner",
  "camembert-dates": "Xenova/camembert-ner-with-dates",
  "bert-en": "Xenova/bert-base-NER",
};

// Browser Transformers.js defaults to quantized ONNX; pin a dtype that exists for each model.
export const NER_MODEL_PIPELINE_OPTIONS = {
  camembert: { dtype: "q8" },
  "camembert-dates": { dtype: "q8" },
  "bert-en": { dtype: "q8" },
};

export const CAMEMBERT_TO_APP_LABEL = {
  PER: "person",
  LOC: "location",
  ORG: "organization",
  MISC: "misc",
  DATE: "date",
};

export const BUILTIN_CATEGORY_IDS = new Set(Object.keys(CATEGORY_LABELS));
