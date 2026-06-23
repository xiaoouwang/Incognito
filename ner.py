from transformers import pipeline
from label_studio_ml.model import LabelStudioMLBase

ner = pipeline("ner", model="Jean-Baptiste/camembert-ner", aggregation_strategy="simple")

class MyModel(LabelStudioMLBase):
    def predict(self, tasks, context=None, **kwargs):
        predictions = []
        for task in tasks:
            text = task["data"]["text"]
            ents = ner(text)

            results = []
            for ent in ents:
                results.append({
                    "from_name": "label",
                    "to_name": "text",
                    "type": "labels",
                    "value": {
                        "start": ent["start"],
                        "end": ent["end"],
                        "text": text[ent["start"]:ent["end"]],
                        "labels": [ent["entity_group"]]
                    }
                })

            predictions.append({"result": results})
        return predictions