/** Albert API (etalab) — generative anonymization */

export const ALBERT_API_ORIGIN = "https://albert.api.etalab.gouv.fr";

export const ALBERT_DOCS_URL = "https://guides.ia.numerique.gouv.fr/albert-api";

export const ALBERT_KEY_STORAGE_KEY = "incognito-albert-api-key";

/** Fallback chat models when /v1/models is unavailable */
export const ALBERT_DEFAULT_MODELS = [
  "openweight-small",
  "albert-small",
  "albert",
];

export const ALBERT_DEFAULT_MODEL = ALBERT_DEFAULT_MODELS[0];

export const ALBERT_MAX_INPUT_CHARS = 12000;

export const ALBERT_SAMPLE_TEXT = `Le 14 septembre 2026, Claire Martin, née le 3 février 1989 à Grenoble, s’est présentée au service administratif de l’Université de Montfleury afin de mettre à jour son dossier. Elle réside actuellement au 27 rue des Tilleuls, 69003 Lyon et peut être contactée au 06 42 18 73 91 ou à l’adresse claire.martin89@example.fr.

Mme Martin travaille depuis avril 2024 comme ingénieure de recherche au laboratoire LIRIS. Son numéro de dossier est DR-2026-18452. Elle a indiqué que son contrat avait été préparé par Julien Moreau, responsable administratif du laboratoire. Celui-ci est joignable au 04 72 43 81 26.

Claire a également précisé que son ancienne adresse était 8 avenue Jean-Jaurès à Grenoble. Cette adresse figure encore sur certains documents associés à son dossier, notamment celui portant la référence CM-2024-771.

Quelques jours plus tard, Julien Moreau a envoyé un courriel au service RH pour signaler que Mme Martin avait changé de banque. Le nouveau compte communiqué par l’intéressée porte l’IBAN fictif FR76 9999 8888 7777 6666 5555 444. Dans son message, Julien mentionne également Sophie Bernard, collègue de Claire, qui travaille dans la même équipe mais n’est pas concernée par cette modification.

Sophie, née en 1992, habite à Villeurbanne. Elle partage le bureau 312 avec Claire. Le numéro 06 11 22 33 44 mentionné dans un précédent échange appartient à Sophie et non à Mme Martin.`;
