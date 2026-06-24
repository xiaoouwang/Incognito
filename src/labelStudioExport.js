const LABEL_STUDIO_FROM_NAME = "label";
const LABEL_STUDIO_TO_NAME = "text";

const APP_TO_LABEL_STUDIO = {
  person: "Person",
  location: "Location",
  organization: "Organization",
  date: "Date",
  email: "Email",
  phone: "Phone",
  url: "URL",
  misc: "Misc",
};

export const LABEL_STUDIO_NER_CONFIG = `<View>
  <Labels name="${LABEL_STUDIO_FROM_NAME}" toName="${LABEL_STUDIO_TO_NAME}">
    <Label value="Person" background="#c45c26"/>
    <Label value="Location" background="#2f6f4e"/>
    <Label value="Organization" background="#5b4d8a"/>
    <Label value="Date" background="#8a6d3b"/>
    <Label value="Email" background="#3d6f8a"/>
    <Label value="Phone" background="#6b5b4f"/>
    <Label value="URL" background="#4a6fa5"/>
    <Label value="Misc" background="#7a7a7a"/>
  </Labels>
  <Text name="${LABEL_STUDIO_TO_NAME}" value="$text"/>
</View>`;

export function toLabelStudioLabel(category) {
  return APP_TO_LABEL_STUDIO[category] || "Misc";
}

export function entityToLabelStudioResult(entity, index) {
  const spanText = entity.text ?? "";

  return {
    id: `ner-${index}`,
    from_name: LABEL_STUDIO_FROM_NAME,
    to_name: LABEL_STUDIO_TO_NAME,
    type: "labels",
    value: {
      start: entity.start,
      end: entity.end,
      text: spanText,
      labels: [toLabelStudioLabel(entity.label)],
    },
  };
}

export function createLabelStudioTask({ text, entities, modelName, nerBackend, sourceFile = null }) {
  const orderedEntities = [...entities].sort((a, b) => a.start - b.start || a.end - b.end);

  return {
    data: {
      text,
      ...(sourceFile ? { source_file: sourceFile } : {}),
      ner_backend: nerBackend || null,
      ner_model: modelName || null,
      exported_at: new Date().toISOString(),
    },
    predictions: [
      {
        model_version: modelName || nerBackend || "incognito",
        result: orderedEntities.map((entity, index) => entityToLabelStudioResult(entity, index)),
      },
    ],
  };
}

export function createLabelStudioExport(options) {
  return [createLabelStudioTask(options)];
}
