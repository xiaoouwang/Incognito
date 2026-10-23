export const GLINER_MODEL_ID = "onnx-community/gliner_multi-v2.1";

/** Browser build: q4f16 ONNX (~472 MB). Avoid model_quantized.onnx — it returns no entities. */
export const GLINER_MODEL_FILE = "model_q4f16.onnx";

export const GLINER_MODEL_URL = `https://huggingface.co/${GLINER_MODEL_ID}/resolve/main/onnx/${GLINER_MODEL_FILE}`;

/** Many French spans score between 0.2 and 0.5 with this model. */
export const GLINER_DEFAULT_THRESHOLD = 0.2;

export const GLINER_RULE_LABELS = ["email", "url", "phone number", "identity document number"];

export const GLINER_LABELS = [
  "person",
  "organization",
  "location",
  "address",
  "email",
  "url",
  "phone number",
  "identity document number",
  "date",
  "age",
  "profession",
  "job title or project role",
  "school",
  "hospital",
  "family member",
  "nationality",
  "disease",
  "diploma",
];

/** CSS suffix after highlight-/chip- (Advanced + Basic shared). */
export const GLINER_LABEL_STYLE_KEYS = {
  person: "person",
  organization: "organization",
  location: "location",
  address: "address",
  email: "email",
  url: "url",
  "phone number": "phone",
  "identity document number": "identity",
  date: "date",
  age: "age",
  profession: "profession",
  "job title or project role": "job-role",
  school: "school",
  hospital: "hospital",
  "family member": "family",
  nationality: "nationality",
  disease: "disease",
  diploma: "diploma",
};

/** Short English descriptions for GLiNER2 schema [DESCRIPTION] prompts. */
export const GLINER_LABEL_DESCRIPTIONS = {
  person: "a person's name",
  organization: "a company, brand or organisation name",
  location: "a place, city, country or region",
  address: "a street address or postal address",
  email: "an email address",
  url: "a web URL or link",
  "phone number": "a telephone or mobile number",
  "identity document number":
    "a passport number, social security number, national ID, French NIR, or similar identity document number",
  date: "a calendar date or day",
  age: "a person's age in years",
  profession: "an occupation or profession",
  "job title or project role": "a job title, role or project responsibility",
  school: "a school, university or educational institution",
  hospital: "a hospital, clinic or medical institution",
  "family member": "a family relation or relative mention",
  nationality: "a nationality or citizenship",
  disease: "a disease, condition or medical diagnosis",
  diploma: "a diploma, degree or academic qualification",
};
