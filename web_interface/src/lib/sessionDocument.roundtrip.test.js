/**
 * Round-trip test for Incognito session JSON.
 *
 * Idea: build a session from “live” review state → JSON.stringify → parse again
 * → assert the durable fields survived. If you add a new feature that must be
 * saved, extend the fixture below; if you forget the builder/parser, this fails.
 *
 * Run: npm test
 */

import { describe, expect, it } from "vitest";
import {
  BATCH_SESSION_FORMAT,
  SESSION_FORMAT,
  buildBatchSessionDocument,
  buildSessionDocument,
  fileStateFromSession,
  materializeBatchFromSession,
  parseAnySessionDocument,
} from "./sessionDocument.js";

/** Representative review state — add new durable fields here when features grow. */
function makeReviewFixture() {
  const text =
    "Marie Dupont lives in Nice.\nMarie works at CNRS.\nContact: marie.dupont@example.com";

  return {
    workflow: "advanced",
    text,
    sourceFile: "entretien-marie.txt",
    entities: [
      { start: 0, end: 12, text: "Marie Dupont", label: "person", source: "manual" },
      { start: 29, end: 34, text: "Marie", label: "person", source: "manual" },
      { start: 22, end: 26, text: "Nice", label: "location", source: "manual" },
    ],
    removedEntities: [
      { start: 55, end: 59, text: "CNRS", label: "organization", source: "manual" },
    ],
    modelName: "gliner2-multi-v1",
    nerEngine: "gliner2-multi",
    threshold: 0.45,
    customCategories: { custom_industry: "Industry sector" },
    selectedCategories: { person: true, location: true, organization: false },
    excludedEntityKeys: { "location:nice": true },
    categoryMethods: { person: "placeholder", location: "redact" },
    surfaceOverrides: {
      "person:marie dupont": { kind: "custom", value: "[TEACHER_1]" },
    },
    distinctOccurrenceKeys: { "id:ent-29-34-1": true },
    linkedValueKeys: { "person:marie": "person:marie dupont" },
    anonymizedTextOverride: "Anonymized preview override for resume.",
    activeLabels: ["person", "location", "organization"],
    customDetectionLabels: ["scholarship"],
    relations: [{ head: "Marie", tail: "Nice", label: "lives_in" }],
    personGraph: {
      persons: [
        {
          name: "Marie Dupont",
          placeholder: "PERSON_1",
          aliases: ["Marie"],
          attrs: [{ key: "loc", value: "Nice" }],
        },
      ],
      excludedPlaceholders: {},
      excludedSurfaces: { "surface:cnrs": true },
      relationOverrides: {},
      edgeLabelOverrides: { "PERSON_1|loc|Nice": "city" },
      edgeValueOverrides: {},
      note: "Restored person graph",
    },
  };
}

describe("sessionDocument round-trip", () => {
  it("keeps durable single-document review fields after save → open", () => {
    const live = makeReviewFixture();

    // 1) Save (what “Save session” builds)
    const saved = buildSessionDocument(live);

    // 2) Disk / download boundary
    const raw = JSON.stringify(saved);

    // 3) Open (what “Open session” parses)
    const parsed = parseAnySessionDocument(raw);
    expect(parsed.ok).toBe(true);
    expect(parsed.kind).toBe("single");

    const doc = parsed.session.document;
    const graph = parsed.session.personGraph;

    expect(parsed.session.format).toBe(SESSION_FORMAT);
    expect(parsed.session.workflow).toBe("advanced");

    // Core document
    expect(doc.text).toBe(live.text);
    expect(doc.sourceFile).toBe(live.sourceFile);
    expect(doc.modelName).toBe(live.modelName);
    expect(doc.nerEngine).toBe(live.nerEngine);
    expect(doc.threshold).toBe(live.threshold);
    expect(doc.anonymizedTextOverride).toBe(live.anonymizedTextOverride);

    // Review maps — these are the fields that silently drop if forgotten
    expect(doc.selectedCategories).toEqual(live.selectedCategories);
    expect(doc.excludedEntityKeys).toEqual(live.excludedEntityKeys);
    expect(doc.categoryMethods).toEqual(live.categoryMethods);
    expect(doc.surfaceOverrides).toEqual(live.surfaceOverrides);
    expect(doc.distinctOccurrenceKeys).toEqual(live.distinctOccurrenceKeys);
    expect(doc.linkedValueKeys).toEqual(live.linkedValueKeys);
    expect(doc.customCategories).toEqual(live.customCategories);
    expect(doc.activeLabels).toEqual(live.activeLabels);
    expect(doc.customDetectionLabels).toEqual(live.customDetectionLabels);

    const entitySpan = (e) => [e.start, e.end, e.text, e.label];
    const byOffsets = (a, b) => a[0] - b[0] || a[1] - b[1];
    // build/sanitize sorts entities by start offset
    expect(doc.entities.map(entitySpan).sort(byOffsets)).toEqual(
      live.entities.map(entitySpan).sort(byOffsets),
    );
    expect(doc.removedEntities.map(entitySpan).sort(byOffsets)).toEqual(
      live.removedEntities.map(entitySpan).sort(byOffsets),
    );
    expect(doc.relations).toEqual(live.relations);

    // Person graph snapshot
    expect(graph.persons).toEqual(live.personGraph.persons);
    expect(graph.excludedSurfaces).toEqual(live.personGraph.excludedSurfaces);
    expect(graph.edgeLabelOverrides).toEqual(live.personGraph.edgeLabelOverrides);
    expect(graph.note).toBe(live.personGraph.note);

    // Same path batch mode uses when applying a session onto fileStates
    const fileState = fileStateFromSession(parsed.session);
    expect(fileState.linkedValueKeys).toEqual(live.linkedValueKeys);
    expect(fileState.personGraph.persons[0].placeholder).toBe("PERSON_1");
  });

  it("keeps every file in a batch session after save → open", () => {
    const marie = makeReviewFixture();
    const pierreText = "Pierre Martin teaches in Lyon.";
    const files = [
      { id: "entretien-marie.txt", name: "entretien-marie.txt", text: marie.text },
      { id: "entretien-pierre.txt", name: "entretien-pierre.txt", text: pierreText },
    ];
    const fileStates = {
      "entretien-marie.txt": {
        ...marie,
        text: marie.text,
        entities: marie.entities,
        personGraph: marie.personGraph,
      },
      "entretien-pierre.txt": {
        text: pierreText,
        entities: [
          { start: 0, end: 13, text: "Pierre Martin", label: "person", source: "manual" },
        ],
        selectedCategories: { person: true },
        excludedEntityKeys: {},
        modelName: "gliner2-multi-v1",
        relations: [],
        personGraph: null,
      },
    };

    const batchSaved = buildBatchSessionDocument({
      workflow: "advanced",
      label: "field-notes",
      files,
      fileStates,
      nerEngine: "gliner2-multi",
      threshold: 0.45,
    });

    const parsed = parseAnySessionDocument(JSON.stringify(batchSaved));
    expect(parsed.ok).toBe(true);
    expect(parsed.kind).toBe("batch");
    expect(parsed.batch.format).toBe(BATCH_SESSION_FORMAT);
    expect(parsed.batch.documents).toHaveLength(2);

    const { files: restoredFiles, fileStates: restoredStates } =
      materializeBatchFromSession(parsed.batch);

    expect(restoredFiles.map((f) => f.name)).toEqual([
      "entretien-marie.txt",
      "entretien-pierre.txt",
    ]);
    expect(restoredStates[restoredFiles[0].id].linkedValueKeys).toEqual(
      marie.linkedValueKeys,
    );
    expect(restoredStates[restoredFiles[1].id].entities[0].text).toBe("Pierre Martin");
    // Derived audit Markdown is NOT in the session — export rebuilds it later.
    expect(restoredStates[restoredFiles[0].id].auditReport).toBeUndefined();
  });
});
