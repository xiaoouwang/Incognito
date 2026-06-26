export const GLINER_MODEL_ID = "onnx-community/gliner_multi-v2.1";

/** Browser build: q4f16 ONNX (~472 MB). Avoid model_quantized.onnx — it returns no entities. */
export const GLINER_MODEL_FILE = "model_q4f16.onnx";

export const GLINER_MODEL_URL = `https://huggingface.co/${GLINER_MODEL_ID}/resolve/main/onnx/${GLINER_MODEL_FILE}`;

/** Many French spans score between 0.2 and 0.5 with this model. */
export const GLINER_DEFAULT_THRESHOLD = 0.2;

export const GLINER_RULE_LABELS = ["email", "url", "phone number"];

export const GLINER_LABELS = [
  "person",
  "organization",
  "location",
  "address",
  "email",
  "url",
  "phone number",
  "date",
  "profession",
  "job title or project role",
  "school",
  "hospital",
  "family member",
  "nationality",
  "disease",
  "diploma",
];

export const GLINER_SAMPLE_TEXT = `Bonjour, je m'appelle Jean Dupont. Je suis professeur d'informatique à
l'Université Côte d'Azur depuis septembre 2018, et responsable scientifique du
projet CampusNum sur la transformation numérique des campus. J'ai obtenu un
doctorat en informatique à l'Université Paris-Saclay et l'agrégation de
mathématiques.

J'habite au 15 avenue Jean Médecin, 06000 Nice, en France.

Vous pouvez me joindre par téléphone au 06 12 34 56 78 ou par courriel à
jean.dupont@univ-cotedazur.fr.

Ma femme, Marie Dupont, est médecin au CHU de Nice et titulaire d'un diplôme
de médecine générale de la faculté de médecine de Nice. Elle suit notamment des
patients atteints de diabète de type 2 et d'hypertension artérielle.

Notre fils Paul est actuellement élève au lycée Masséna, où il prépare le
baccalauréat scientifique. Il a été diagnostiqué avec une asthme légère l'année
dernière.

Avant de venir à Nice, j'ai travaillé au CNRS à Paris, puis à l'INRIA
Sophia Antipolis.

Je suis de nationalité française mais ma mère est italienne. Elle vit avec une
maladie d'Alzheimer depuis trois ans.

Mon frère travaille chez Orange en tant que chef de projet réseau 5G, et ma sœur
est chercheuse à l'INSERM, titulaire d'un doctorat en biologie, où elle est
investigatrice principale sur l'étude OncoSud et étudie le cancer du sein.

Nous avons participé à une conférence sur la sclérose en plaques organisée le
12 mai 2023 à Marseille.`;
