export const SAMPLE_TEXT = `Extrait d'entretien :

La docteure Marie Dupont a rencontré Jean Martin à Paris le 12 mars 2022.
Marie travaille avec l'Université de Lyon. Son email est marie.dupont@example.com.
La participante a aussi mentionné +33 6 12 34 56 78 et https://example.org/project.

Marie vient d'effectuer un stage de 3 mois à Paris, Hôpital Saint-Louis.`;

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
