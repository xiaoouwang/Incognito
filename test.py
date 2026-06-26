from gliner import GLiNER

# Load the model (downloads automatically the first time)
model = GLiNER.from_pretrained("urchade/gliner_multi-v2.1")

text = """
Jean Dupont travaille à l'Université Côte d'Azur à Nice.
Vous pouvez le contacter à jean.dupont@univ-cotedazur.fr
ou au 06 12 34 56 78.

Il est professeur en informatique depuis 2018.
Sa collègue Marie Martin travaille au CNRS.
"""
text = """
Claire, ingénieure agronome de formation, doctorat en écologie appliquée, travaille au sein d'un laboratoire commun entre INRAE et l'Université de Montpellier situé sur le campus de Baillarguet. Impliquée dans le projet AgroResilience depuis 2022. Recrutée comme chargée de recherche sur le volet analyse des systèmes agricoles afin d'évaluer les stratégies de réduction des intrants chimiques à l'échelle territoriale.

Julien…

Interviewé : 5 ans chez AgroNova, responsable expérimentation terrain sur les cultures maraîchères (tomate, courgette, poivron), puis coordinateur technique chez Floralis. Travaille avec des coopératives agricoles dans le sud de la France et en Espagne. Assure le suivi des itinéraires techniques et la traçabilité des interventions culturales depuis les semis jusqu'à la commercialisation des produits. Très forte diversité d'exploitations partenaires. Responsable d'une équipe de trois techniciens.

Collaboration avec le domaine de Valmy et plusieurs exploitations du Roussillon. Certains producteurs sont certifiés AB, d'autres sont en conversion.

Quel est le rôle de votre organisation dans la gestion des ravageurs ?

L'objectif principal est de promouvoir des pratiques agricoles durables. Nous privilégions les solutions de biocontrôle et les méthodes préventives. Nous accompagnons les agriculteurs dans la réduction de l'usage des pesticides de synthèse. Cela passe par la formation, le suivi technique et l'évaluation des résultats. Nous réalisons également des diagnostics environnementaux et des bilans carbone sur plusieurs sites de production. À tous les niveaux, nous cherchons à limiter notre impact, que ce soit sur la consommation d'eau, l'utilisation d'engrais ou les émissions liées aux transports.
"""

text = """
Bonjour, je m'appelle Jean Dupont. Je suis professeur d'informatique à
l'Université Côte d'Azur depuis septembre 2018.

J'habite au 15 avenue Jean Médecin, 06000 Nice, en France.

Vous pouvez me joindre par téléphone au 06 12 34 56 78 ou par courriel à
jean.dupont@univ-cotedazur.fr.

Ma femme, Marie Dupont, est médecin au CHU de Nice.
Notre fils Paul est actuellement élève au lycée Masséna.

Avant de venir à Nice, j'ai travaillé au CNRS à Paris, puis à l'INRIA
Sophia Antipolis.

Je suis de nationalité française mais ma mère est italienne.
Mon frère travaille chez Orange et ma sœur est chercheuse à l'INSERM.

Nous avons participé à une conférence organisée le 12 mai 2023
à Marseille.
"""



labels = [
    "person",
    "organization",
    "location",
    "address",
    "email",
    "phone number",
    "profession",
    "school",
    "hospital",
    "family member",
    "date",
    "nationality",
]

entities = model.predict_entities(text, labels)

for entity in entities:
    print(
        f"{entity['label']:15} "
        f"{entity['score']:.3f} "
        f"{entity['text']}"
    )


    