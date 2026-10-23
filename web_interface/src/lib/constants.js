export const SAMPLE_TEXT = `Marie Dupont, âgée de 43 ans, habite au 15 rue des Orangers à Nice. Elle travaille comme enseignante au lycée Masséna depuis septembre 2018. Son mari, Pierre Martin, est médecin à l’hôpital Pasteur. Ils ont deux enfants, Lucas, 12 ans, et Emma, 8 ans.

Marie est née le 14 mars 1983 à Lyon. Elle utilise l’adresse électronique marie.dupont@example.com et peut être contactée au 06 12 34 56 78.

Lors d’un entretien réalisé le 5 octobre 2026, Marie explique qu’elle a récemment déménagé dans le quartier de Cimiez. Elle précise que son mari travaille souvent de nuit et que leur fils Lucas est scolarisé dans le même établissement où elle enseigne.

Quelques minutes plus tard, elle ajoute : « Mon père, Jean Dupont, était professeur à l’Université Côte d’Azur. Il a pris sa retraite en 2020. Ma sœur Sophie travaille maintenant à la mairie de Cannes. »

Enfin, Marie indique qu’elle est la seule enseignante de chinois de son établissement à avoir participé à un programme d’échange universitaire avec Pékin en 2019.`;

export const CATEGORY_LABELS = {
  person: "People",
  location: "Locations",
  organization: "Organizations",
  date: "Dates",
  age: "Ages",
  email: "Emails",
  phone: "Phone numbers",
  "phone number": "Phone numbers",
  "identity document number": "Identity document numbers",
  address: "Addresses",
  url: "URLs",
  profession: "Professions",
  "job title or project role": "Job titles / roles",
  school: "Schools",
  hospital: "Hospitals",
  "family member": "Family members",
  nationality: "Nationalities",
  disease: "Diseases",
  diploma: "Diplomas",
  misc: "Other entities",
};

export const CATEGORY_PREFIXES = {
  person: "PERSON",
  location: "LOCATION",
  organization: "ORG",
  date: "DATE",
  age: "AGE",
  email: "EMAIL",
  phone: "PHONE",
  "phone number": "PHONE",
  "identity document number": "IDDOC",
  address: "ADDRESS",
  url: "URL",
  profession: "PROF",
  "job title or project role": "ROLE",
  school: "SCHOOL",
  hospital: "HOSP",
  "family member": "FAM",
  nationality: "NAT",
  disease: "DIS",
  diploma: "DIP",
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
