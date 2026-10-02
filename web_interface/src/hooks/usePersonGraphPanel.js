import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyRelationOverrides,
  buildBasicPersonGraph,
  findSurfaceOwnerPlaceholder,
  isPersonLabel,
} from "../lib/basicPersonGraph.js";
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
 */
export function usePersonGraphPanel({ text, entities, t, parseDependencies }) {
  const [persons, setPersons] = useState([]);
  const [excludedPlaceholders, setExcludedPlaceholders] = useState({});
  const [excludedSurfaces, setExcludedSurfaces] = useState({});
  const [personGraphNote, setPersonGraphNote] = useState("");
  const [hoveredPersonPlaceholder, setHoveredPersonPlaceholder] = useState(null);
  const [pinnedPersonPlaceholder, setPinnedPersonPlaceholder] = useState(null);
  const [relationOverrides, setRelationOverrides] = useState({});
  const relationOverridesRef = useRef({});

  const rebuildPersonGraph = useCallback(
    (sourceText, nextEntities, depResult = null, { resetExclusions = true } = {}) => {
      if (resetExclusions) {
        relationOverridesRef.current = {};
        setRelationOverrides({});
        setExcludedPlaceholders({});
        setExcludedSurfaces({});
        setPinnedPersonPlaceholder(null);
        setHoveredPersonPlaceholder(null);
      }
      const graph = buildBasicPersonGraph(sourceText, nextEntities, depResult);
      setPersons(applyRelationOverrides(graph.persons, relationOverridesRef.current));
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
    [parseDependencies, rebuildPersonGraph, t],
  );

  const refreshPersonGraph = useCallback(
    (sourceText, nextEntities, { resetExclusions = true } = {}) => {
      rebuildPersonGraph(sourceText, nextEntities, null, { resetExclusions });
      void enrichWithDependencyGraph(sourceText, nextEntities);
    },
    [rebuildPersonGraph, enrichWithDependencyGraph],
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

  function relateEntityToPerson(entity, personPlaceholder) {
    if (!entity?.text || !personPlaceholder) {
      return null;
    }
    const target = persons.find((person) => person.placeholder === personPlaceholder);
    if (!target) {
      return null;
    }
    const lower = entity.text.toLocaleLowerCase();
    const entry = {
      placeholder: personPlaceholder,
      surface: entity.text,
      entityLabel: entity.label || "misc",
      asAlias: isPersonLabel(entity.label),
    };
    setRelationOverrides((current) => {
      const next = { ...current, [lower]: entry };
      relationOverridesRef.current = next;
      setPersons((currentPersons) => applyRelationOverrides(currentPersons, next));
      return next;
    });
    return target.name;
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
    relationOverridesRef.current = {};
    setRelationOverrides({});
    setPersons([]);
    setExcludedPlaceholders({});
    setExcludedSurfaces({});
    setPersonGraphNote("");
    setPinnedPersonPlaceholder(null);
    setHoveredPersonPlaceholder(null);
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
    clearPersonGraph,
    handleTogglePerson,
    handleToggleGraphSurface,
    syncEntityChipToGraph,
    relateEntityToPerson,
    findOwnerPlaceholder: (surface) => findSurfaceOwnerPlaceholder(persons, surface),
  };
}
