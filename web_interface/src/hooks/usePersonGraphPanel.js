import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyEdgeLabelOverrides,
  applyEdgeValueOverrides,
  applyRelationOverrides,
  buildBasicPersonGraph,
  clearSurfaceFromPersons,
  edgeLabelOverrideKey,
  findSurfaceOwnerPlaceholder,
  findSurfaceOwnerPlaceholders,
  isPersonLabel,
  listRelationOverrideEntries,
} from "../lib/basicPersonGraph.js";

const RENAMABLE_EDGE_KINDS = new Set(["attr", "rel", "alias", "coref", "name"]);
import { buildPersonGraphFromRelex } from "../lib/glinerRelexPersonGraph.js";
import { buildPersonFocusRanges } from "../lib/personFocus.js";
import {
  surfaceExcludeKey,
  toggleSurfaceExcluded,
} from "../lib/albertEdit.js";
import { getEntityValueKey } from "../lib/entityUtils.js";

const ATTR_KEY_TO_CATEGORY = {
  loc: "location",
  org: "organization",
  dob: "date",
  age: "age",
  em: "email",
  tel: "phone number",
  addr: "address",
  job: "profession",
  family: "family member",
  nat: "nationality",
  url: "url",
  misc: "misc",
};

export function guessSurfaceCategory(entities, surface, attrKey = "") {
  const lower = String(surface || "").toLocaleLowerCase();
  const hit = entities.find((entity) => entity.text.toLocaleLowerCase() === lower);
  if (hit?.label) {
    return hit.label;
  }
  if (ATTR_KEY_TO_CATEGORY[attrKey]) {
    return ATTR_KEY_TO_CATEGORY[attrKey];
  }
  return "misc";
}

/**
 * Shared person-graph state for Basic (CamemBERT) and Advanced (GLiNER) workflows.
 *
 * @param {object} options
 * @param {(text: string) => Promise<object|null>} [options.parseDependencies] UDPipe (Basic)
 * @param {(text: string, entities: Array) => Promise<Array|{relations:Array,fillProximity?:boolean,noteKey?:string}|null>} [options.extractRelations]
 * @param {() => { fillProximity?: boolean }} [options.resolveRelexOptions]
 */
export function usePersonGraphPanel({
  text,
  entities,
  t,
  parseDependencies,
  extractRelations = null,
  resolveRelexOptions = null,
}) {
  const [persons, setPersons] = useState([]);
  const [excludedPlaceholders, setExcludedPlaceholders] = useState({});
  const [excludedSurfaces, setExcludedSurfaces] = useState({});
  const [personGraphNote, setPersonGraphNote] = useState("");
  const [hoveredPersonPlaceholder, setHoveredPersonPlaceholder] = useState(null);
  const [pinnedPersonPlaceholder, setPinnedPersonPlaceholder] = useState(null);
  const [relationOverrides, setRelationOverrides] = useState({});
  const relationOverridesRef = useRef({});
  const [edgeLabelOverrides, setEdgeLabelOverrides] = useState({});
  const edgeLabelOverridesRef = useRef({});
  const [edgeValueOverrides, setEdgeValueOverrides] = useState({});
  const edgeValueOverridesRef = useRef({});

  function commitPersons(personsList) {
    return applyEdgeLabelOverrides(
      applyEdgeValueOverrides(
        applyRelationOverrides(personsList, relationOverridesRef.current),
        edgeValueOverridesRef.current,
      ),
      edgeLabelOverridesRef.current,
    );
  }

  function resetManualGraphEdits() {
    relationOverridesRef.current = {};
    setRelationOverrides({});
    edgeLabelOverridesRef.current = {};
    setEdgeLabelOverrides({});
    edgeValueOverridesRef.current = {};
    setEdgeValueOverrides({});
    setExcludedPlaceholders({});
    setExcludedSurfaces({});
    setPinnedPersonPlaceholder(null);
    setHoveredPersonPlaceholder(null);
  }

  const rebuildPersonGraph = useCallback(
    (sourceText, nextEntities, depResult = null, { resetExclusions = true } = {}) => {
      if (resetExclusions) {
        resetManualGraphEdits();
      }
      const graph = buildBasicPersonGraph(sourceText, nextEntities, depResult);
      setPersons(commitPersons(graph.persons));
      setPersonGraphNote(
        graph.usedDependencyParse
          ? t("personGraphDepReady")
          : t("personGraphProximityFallback"),
      );
      return graph;
    },
    [t],
  );

  const enrichWithDependencyGraph = useCallback(
    async (sourceText, nextEntities) => {
      if (extractRelations) {
        try {
          setPersonGraphNote(t("personGraphRelexLoading"));
          const extracted = await extractRelations(sourceText, nextEntities);
          // `null` = skip ReLex and use proximity only.
          if (extracted == null) {
            rebuildPersonGraph(sourceText, nextEntities, null, { resetExclusions: false });
            setPersonGraphNote(t("personGraphProximityFallback"));
            return;
          }
          const payload = Array.isArray(extracted)
            ? { relations: extracted }
            : extracted || {};
          const relations = payload.relations || [];
          const defaults = typeof resolveRelexOptions === "function" ? resolveRelexOptions() : {};
          const fillProximity =
            payload.fillProximity !== undefined
              ? Boolean(payload.fillProximity)
              : defaults.fillProximity !== undefined
                ? Boolean(defaults.fillProximity)
                : true;
          const graph = buildPersonGraphFromRelex(sourceText, nextEntities, relations, {
            fillProximity,
          });
          setPersons(commitPersons(graph.persons));
          const noteKey = payload.noteKey || "personGraphRelexReady";
          setPersonGraphNote(
            t(noteKey, {
              count: String(graph.relexRelationCount ?? relations.length ?? 0),
            }),
          );
        } catch (caughtError) {
          rebuildPersonGraph(sourceText, nextEntities, null, { resetExclusions: false });
          setPersonGraphNote(
            `${t("personGraphRelexFallback")} (${
              caughtError instanceof Error ? caughtError.message : String(caughtError)
            })`,
          );
        }
        return;
      }

      if (!parseDependencies) {
        rebuildPersonGraph(sourceText, nextEntities, null, { resetExclusions: false });
        return;
      }
      try {
        setPersonGraphNote(t("personGraphDepLoading"));
        const depResult = await parseDependencies(sourceText);
        rebuildPersonGraph(sourceText, nextEntities, depResult, { resetExclusions: false });
      } catch (caughtError) {
        rebuildPersonGraph(sourceText, nextEntities, null, { resetExclusions: false });
        setPersonGraphNote(
          `${t("personGraphProximityFallback")} (${
            caughtError instanceof Error ? caughtError.message : String(caughtError)
          })`,
        );
      }
    },
    [extractRelations, resolveRelexOptions, parseDependencies, rebuildPersonGraph, t],
  );

  const refreshPersonGraph = useCallback(
    (sourceText, nextEntities, { resetExclusions = true } = {}) => {
      if (resetExclusions) {
        resetManualGraphEdits();
      }
      // When ReLex is available, wait for it instead of flashing a proximity-only graph.
      if (extractRelations) {
        setPersonGraphNote(t("personGraphRelexLoading"));
        void enrichWithDependencyGraph(sourceText, nextEntities);
        return;
      }
      rebuildPersonGraph(sourceText, nextEntities, null, { resetExclusions: false });
      void enrichWithDependencyGraph(sourceText, nextEntities);
    },
    [extractRelations, rebuildPersonGraph, enrichWithDependencyGraph, t],
  );

  /** Apply entities+relations from a single joint ReLex detection (no second inference). */
  const applyRelexPersonGraph = useCallback(
    (
      sourceText,
      nextEntities,
      relations,
      { resetExclusions = true, fillProximity = true, noteKey = "personGraphRelexReady" } = {},
    ) => {
      if (resetExclusions) {
        resetManualGraphEdits();
      }
      const graph = buildPersonGraphFromRelex(sourceText, nextEntities, relations || [], {
        fillProximity: Boolean(fillProximity),
      });
      setPersons(commitPersons(graph.persons));
      setPersonGraphNote(
        t(noteKey, {
          count: String(graph.relexRelationCount ?? relations?.length ?? 0),
        }),
      );
      return graph;
    },
    [t],
  );

  function setEntityKeyExcluded(nextKeys, category, surface, excluded) {
    const key = getEntityValueKey(category, surface);
    if (excluded) {
      nextKeys[key] = true;
    } else {
      delete nextKeys[key];
    }
  }

  function applySurfaceToExcludedKeys(nextKeys, surface, excluding, preferredCategory = null) {
    const lower = String(surface || "").toLocaleLowerCase();
    if (!lower) {
      return;
    }
    let matched = false;
    for (const entity of entities) {
      if (entity.text.toLocaleLowerCase() !== lower) {
        continue;
      }
      matched = true;
      setEntityKeyExcluded(nextKeys, entity.label, entity.text, excluding);
    }
    if (!matched && preferredCategory) {
      setEntityKeyExcluded(nextKeys, preferredCategory, surface, excluding);
    }
  }

  function handleTogglePerson(placeholder, setExcludedEntityKeys) {
    const person = persons.find((item) => item.placeholder === placeholder);
    if (!person) {
      return;
    }
    const excluding = !excludedPlaceholders[placeholder];
    const nameSurfaces = [person.name, ...(person.aliases || []), ...(person.corefs || [])];

    setExcludedPlaceholders((current) => {
      const next = { ...current };
      if (excluding) {
        next[placeholder] = true;
      } else {
        delete next[placeholder];
      }
      return next;
    });

    setExcludedEntityKeys((current) => {
      const next = { ...current };
      for (const surface of nameSurfaces) {
        applySurfaceToExcludedKeys(next, surface, excluding, "person");
      }
      for (const attr of person.attrs || []) {
        applySurfaceToExcludedKeys(
          next,
          attr.value,
          excluding,
          attr.entityLabel || guessSurfaceCategory(entities, attr.value, attr.key),
        );
      }
      return next;
    });

    setExcludedSurfaces((current) => {
      const next = { ...current };
      for (const surface of nameSurfaces) {
        const key = surfaceExcludeKey(placeholder, surface);
        if (excluding) {
          next[key] = true;
        } else {
          delete next[key];
        }
      }
      for (const attr of person.attrs || []) {
        const key = surfaceExcludeKey(attr.placeholder || placeholder, attr.value);
        if (excluding) {
          next[key] = true;
        } else {
          delete next[key];
        }
      }
      return next;
    });
  }

  function handleToggleGraphSurface(
    placeholder,
    surface,
    setExcludedEntityKeys,
    attrKey = "",
    entityLabel = "",
  ) {
    const person = persons.find((item) => item.placeholder === placeholder);
    const isNameSurface =
      Boolean(person) &&
      (person.name === surface ||
        (person.aliases || []).includes(surface) ||
        (person.corefs || []).includes(surface));
    const preferredCategory = isNameSurface
      ? "person"
      : entityLabel || guessSurfaceCategory(entities, surface, attrKey);

    const surfaceKey = surfaceExcludeKey(placeholder, surface);
    const willExclude = !excludedSurfaces[surfaceKey];

    setExcludedSurfaces((current) => toggleSurfaceExcluded(current, placeholder, surface));
    setExcludedEntityKeys((current) => {
      const next = { ...current };
      applySurfaceToExcludedKeys(next, surface, willExclude, preferredCategory);
      return next;
    });
  }

  function syncEntityChipToGraph(category, entityText, excluding) {
    setExcludedSurfaces((current) => {
      const next = { ...current };
      for (const person of persons) {
        const nameMatch =
          person.name === entityText ||
          (person.aliases || []).includes(entityText) ||
          (person.corefs || []).includes(entityText);
        if (category === "person" && nameMatch) {
          const surfaceKey = surfaceExcludeKey(person.placeholder, entityText);
          if (excluding) {
            next[surfaceKey] = true;
          } else {
            delete next[surfaceKey];
          }
        }
        for (const attr of person.attrs || []) {
          if (attr.value !== entityText) {
            continue;
          }
          const surfaceKey = surfaceExcludeKey(
            attr.placeholder || person.placeholder,
            attr.value,
          );
          if (excluding) {
            next[surfaceKey] = true;
          } else {
            delete next[surfaceKey];
          }
        }
      }
      return next;
    });
  }

  /**
   * @param {object} entity
   * @param {string} personPlaceholder
   * @param {{ mode?: "rel" | "alias" | "attr", relLabel?: string }} [options]
   *   Person entities default to mode "rel" (person↔person edge).
   *   Use mode "alias" to merge a person mention into another card.
   */
  function relateEntityToPerson(entity, personPlaceholder, options = {}) {
    if (!entity?.text || !personPlaceholder) {
      return null;
    }
    const target = persons.find((person) => person.placeholder === personPlaceholder);
    if (!target) {
      return null;
    }
    const lower = entity.text.toLocaleLowerCase();
    const personEntity = isPersonLabel(entity.label);
    const mode = options.mode || (personEntity ? "rel" : "attr");
    const existingRaw = relationOverridesRef.current[lower];
    const existing = Array.isArray(existingRaw)
      ? [...existingRaw]
      : existingRaw
        ? [existingRaw]
        : [];
    const matchesMode = (item) => {
      if (item.placeholder !== personPlaceholder) {
        return false;
      }
      if (mode === "rel") {
        return Boolean(item.asRel);
      }
      if (mode === "alias") {
        return Boolean(item.asAlias);
      }
      return !item.asRel && !item.asAlias;
    };
    const inOverrides = existing.some(matchesMode);
    const hasGraphRel =
      mode === "rel" &&
      (target.rels || []).some(
        (rel) => String(rel.target || "").toLocaleLowerCase() === lower,
      );
    const hasGraphAlias =
      mode === "alias" &&
      ((target.aliases || []).some((alias) => String(alias || "").toLocaleLowerCase() === lower) ||
        String(target.name || "").toLocaleLowerCase() === lower);
    const hasGraphAttr =
      mode === "attr" &&
      (target.attrs || []).some(
        (attr) => String(attr.value || "").toLocaleLowerCase() === lower,
      );
    const inGraphOnly =
      !inOverrides &&
      (mode === "rel" ? hasGraphRel : mode === "alias" ? hasGraphAlias : hasGraphAttr);
    const removed = inOverrides || inGraphOnly;
    const entry = {
      placeholder: personPlaceholder,
      surface: entity.text,
      entityLabel: entity.label || "misc",
      asAlias: mode === "alias",
      asRel: mode === "rel",
      relLabel: options.relLabel || "related to",
    };
    let nextList;
    if (inOverrides) {
      nextList = existing.filter((item) => !matchesMode(item));
    } else if (inGraphOnly) {
      // Drop an auto link without adding a manual pin for that person.
      nextList = existing.filter((item) => item.placeholder !== personPlaceholder);
    } else {
      // Replace any other mode for this person+surface, then pin the new mode.
      nextList = [
        ...existing.filter((item) => item.placeholder !== personPlaceholder),
        entry,
      ];
    }

    const next = { ...relationOverridesRef.current };
    if (nextList.length) {
      next[lower] = nextList;
    } else {
      delete next[lower];
    }
    relationOverridesRef.current = next;
    setRelationOverrides(next);
    setPersons((currentPersons) => {
      if (mode === "rel") {
        // Additive: keep every existing relation; only drop this person's link on unrelate.
        const adjusted = currentPersons.map((person) => {
          if (!removed || person.placeholder !== personPlaceholder) {
            return {
              ...person,
              rels: [...(person.rels || [])],
              aliases: [...(person.aliases || [])],
              corefs: [...(person.corefs || [])],
              attrs: [...(person.attrs || [])],
            };
          }
          return {
            ...person,
            aliases: [...(person.aliases || [])],
            corefs: [...(person.corefs || [])],
            attrs: [...(person.attrs || [])],
            rels: (person.rels || []).filter(
              (rel) => String(rel.target || "").toLocaleLowerCase() !== lower,
            ),
          };
        });
        return commitPersons(adjusted);
      }
      const cleared = clearSurfaceFromPersons(currentPersons, entity.text);
      return commitPersons(cleared);
    });

    return {
      name: target.name,
      removed,
      placeholder: personPlaceholder,
      mode,
    };
  }

  /** Link two person cards: fromPerson --related to→ toPerson. */
  function relatePersonToPerson(fromPlaceholder, toPlaceholder, relLabel = "related to") {
    if (!fromPlaceholder || !toPlaceholder || fromPlaceholder === toPlaceholder) {
      return null;
    }
    const other = persons.find((person) => person.placeholder === toPlaceholder);
    if (!other?.name) {
      return null;
    }
    return relateEntityToPerson(
      { text: other.name, label: "person" },
      fromPlaceholder,
      { mode: "rel", relLabel },
    );
  }

  /**
   * Move a surface (attr / alias / coref) from one person to another exclusively.
   * Survives graph rebuilds via relationOverrides.
   */
  function moveSurfaceToPerson(fromPlaceholder, toPlaceholder, surface, meta = {}) {
    if (!surface || !toPlaceholder || fromPlaceholder === toPlaceholder) {
      return null;
    }
    const target = persons.find((person) => person.placeholder === toPlaceholder);
    if (!target) {
      return null;
    }
    const lower = String(surface).toLocaleLowerCase();
    const asAlias =
      meta.kind === "alias" ||
      meta.kind === "coref" ||
      Boolean(meta.asAlias) ||
      isPersonLabel(meta.entityLabel);
    const entry = {
      placeholder: toPlaceholder,
      surface,
      entityLabel: meta.entityLabel || (asAlias ? "person" : "misc"),
      asAlias,
    };
    const next = { ...relationOverridesRef.current, [lower]: [entry] };
    relationOverridesRef.current = next;
    setRelationOverrides(next);
    setPersons((currentPersons) => {
      const cleared = clearSurfaceFromPersons(currentPersons, surface);
      return commitPersons(cleared);
    });

    if (fromPlaceholder) {
      setExcludedSurfaces((current) => {
        const oldKey = surfaceExcludeKey(fromPlaceholder, surface);
        const newKey = surfaceExcludeKey(toPlaceholder, surface);
        if (!current[oldKey]) {
          return current;
        }
        const migrated = { ...current };
        delete migrated[oldKey];
        migrated[newKey] = true;
        return migrated;
      });
      setEdgeLabelOverrides((current) => {
        const nextLabels = { ...current };
        for (const kind of ["attr", "rel"]) {
          const oldKey = edgeLabelOverrideKey(fromPlaceholder, kind, surface);
          if (!nextLabels[oldKey]) {
            continue;
          }
          const newKey = edgeLabelOverrideKey(toPlaceholder, kind, surface);
          nextLabels[newKey] = nextLabels[oldKey];
          delete nextLabels[oldKey];
        }
        edgeLabelOverridesRef.current = nextLabels;
        return nextLabels;
      });
    }

    return { name: target.name, placeholder: toPlaceholder, surface };
  }

  /** Rename an edge type label (âge, alias, related to, …) on a person card. */
  function renameEdgeLabel(placeholder, kind, value, nextLabel) {
    const trimmed = String(nextLabel || "").trim();
    if (
      !placeholder ||
      !value ||
      !trimmed ||
      !RENAMABLE_EDGE_KINDS.has(kind) ||
      kind === "name"
    ) {
      return null;
    }
    const key = edgeLabelOverrideKey(placeholder, kind, value);
    const nextOverrides = { ...edgeLabelOverridesRef.current, [key]: trimmed };
    edgeLabelOverridesRef.current = nextOverrides;
    setEdgeLabelOverrides(nextOverrides);
    setPersons((currentPersons) =>
      applyEdgeLabelOverrides(currentPersons, nextOverrides),
    );
    return { placeholder, kind, value, label: trimmed };
  }

  /**
   * Rename a surface value (alias name, attr value, rel target, or person name).
   * Override keys stay anchored to the original surface so rebuilds still apply.
   */
  function renameEdgeValue(placeholder, kind, currentValue, nextValue) {
    const trimmed = String(nextValue || "").trim();
    const current = String(currentValue || "").trim();
    if (
      !placeholder ||
      !current ||
      !trimmed ||
      trimmed === current ||
      !RENAMABLE_EDGE_KINDS.has(kind)
    ) {
      return null;
    }
    const currentLower = current.toLocaleLowerCase();
    const prefix = `${placeholder}::${kind}::`;
    let sourceKey = null;
    for (const [key, mapped] of Object.entries(edgeValueOverridesRef.current)) {
      if (key.startsWith(prefix) && String(mapped || "").toLocaleLowerCase() === currentLower) {
        sourceKey = key;
        break;
      }
    }
    if (!sourceKey) {
      sourceKey = edgeLabelOverrideKey(placeholder, kind, current);
    }
    const nextValueOverrides = {
      ...edgeValueOverridesRef.current,
      [sourceKey]: trimmed,
    };
    edgeValueOverridesRef.current = nextValueOverrides;
    setEdgeValueOverrides(nextValueOverrides);

    // Keep label overrides keyed to the live surface text.
    const oldLabelKey = edgeLabelOverrideKey(placeholder, kind, current);
    const newLabelKey = edgeLabelOverrideKey(placeholder, kind, trimmed);
    if (edgeLabelOverridesRef.current[oldLabelKey] && oldLabelKey !== newLabelKey) {
      const nextLabelOverrides = { ...edgeLabelOverridesRef.current };
      nextLabelOverrides[newLabelKey] = nextLabelOverrides[oldLabelKey];
      delete nextLabelOverrides[oldLabelKey];
      edgeLabelOverridesRef.current = nextLabelOverrides;
      setEdgeLabelOverrides(nextLabelOverrides);
    }

    setExcludedSurfaces((currentExcluded) => {
      const oldKey = surfaceExcludeKey(placeholder, current);
      if (!currentExcluded[oldKey]) {
        return currentExcluded;
      }
      const migrated = { ...currentExcluded };
      delete migrated[oldKey];
      migrated[surfaceExcludeKey(placeholder, trimmed)] = true;
      return migrated;
    });

    setPersons((currentPersons) =>
      applyEdgeLabelOverrides(
        applyEdgeValueOverrides(currentPersons, nextValueOverrides),
        edgeLabelOverridesRef.current,
      ),
    );
    return { placeholder, kind, value: trimmed, previous: current };
  }

  function getRelatedPlaceholdersForSurface(surface) {
    const lower = String(surface || "").toLocaleLowerCase();
    if (!lower) {
      return [];
    }
    const fromOverrides = listRelationOverrideEntries(relationOverridesRef.current)
      .filter((item) => String(item.surface || "").toLocaleLowerCase() === lower)
      .map((item) => item.placeholder);
    if (fromOverrides.length) {
      return [...new Set(fromOverrides)];
    }
    return findSurfaceOwnerPlaceholders(persons, surface);
  }

  const focusedPersonPlaceholder = pinnedPersonPlaceholder || hoveredPersonPlaceholder;
  const focusedPerson = useMemo(
    () => persons.find((person) => person.placeholder === focusedPersonPlaceholder) || null,
    [persons, focusedPersonPlaceholder],
  );
  const personFocusRanges = useMemo(
    () => buildPersonFocusRanges(text, focusedPerson),
    [text, focusedPerson],
  );

  function clearPersonGraph() {
    resetManualGraphEdits();
    setPersons([]);
    setPersonGraphNote("");
  }

  useEffect(() => {
    if (
      pinnedPersonPlaceholder &&
      !persons.some((person) => person.placeholder === pinnedPersonPlaceholder)
    ) {
      setPinnedPersonPlaceholder(null);
    }
  }, [persons, pinnedPersonPlaceholder]);

  return {
    persons,
    excludedPlaceholders,
    excludedSurfaces,
    personGraphNote,
    hoveredPersonPlaceholder,
    pinnedPersonPlaceholder,
    focusedPersonPlaceholder,
    personFocusRanges,
    relationOverrides,
    setHoveredPersonPlaceholder,
    setPinnedPersonPlaceholder,
    refreshPersonGraph,
    applyRelexPersonGraph,
    clearPersonGraph,
    handleTogglePerson,
    handleToggleGraphSurface,
    syncEntityChipToGraph,
    relateEntityToPerson,
    relatePersonToPerson,
    moveSurfaceToPerson,
    renameEdgeLabel,
    renameEdgeValue,
    getRelatedPlaceholdersForSurface,
    findOwnerPlaceholder: (surface) => findSurfaceOwnerPlaceholder(persons, surface),
    findOwnerPlaceholders: (surface) => findSurfaceOwnerPlaceholders(persons, surface),
  };
}
