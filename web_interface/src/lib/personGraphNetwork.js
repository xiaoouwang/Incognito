/**
 * Build network nodes/edges from Incognito person-graph cards
 * (consumed by react-force-graph-2d).
 */

function surfaceKey(placeholder, surface) {
  return `${placeholder}::${String(surface || "").toLocaleLowerCase()}`;
}

function resolvePersonId(persons, target) {
  const needle = String(target || "").trim().toLocaleLowerCase();
  if (!needle) {
    return null;
  }
  const byPlaceholder = persons.find(
    (person) => String(person.placeholder || "").toLocaleLowerCase() === needle,
  );
  if (byPlaceholder?.placeholder) {
    return byPlaceholder.placeholder;
  }
  const byName = persons.find(
    (person) => String(person.name || "").toLocaleLowerCase() === needle,
  );
  return byName?.placeholder || null;
}

/**
 * @param {Array} persons
 * @param {{ excludedPlaceholders?: object, excludedSurfaces?: object }} [options]
 * @returns {{ nodes: Array, edges: Array }}
 */
export function buildPersonGraphNetworkData(
  persons = [],
  { excludedPlaceholders = {}, excludedSurfaces = {} } = {},
) {
  const nodes = [];
  const edges = [];
  const seenNodes = new Set();
  const seenEdges = new Set();

  function addNode(node) {
    if (!node?.id || seenNodes.has(node.id)) {
      return;
    }
    seenNodes.add(node.id);
    nodes.push(node);
  }

  function addEdge(edge) {
    const key = `${edge.from}->${edge.to}:${edge.label || ""}`;
    if (!edge.from || !edge.to || seenEdges.has(key) || edge.from === edge.to) {
      return;
    }
    if (!seenNodes.has(edge.from) || !seenNodes.has(edge.to)) {
      return;
    }
    seenEdges.add(key);
    edges.push(edge);
  }

  for (const person of persons) {
    const personId = person.placeholder || `person:${person.name}`;
    const personExcluded = Boolean(excludedPlaceholders[person.placeholder]);
    addNode({
      id: personId,
      label: String(person.name || person.placeholder || "person"),
      title: person.placeholder
        ? `${person.name}\n${person.placeholder}`
        : String(person.name || ""),
      group: personExcluded ? "personExcluded" : "person",
      shape: "dot",
      size: 22,
    });

    for (const alias of person.aliases || []) {
      const surface = String(alias || "").trim();
      if (!surface) {
        continue;
      }
      const excluded =
        personExcluded ||
        Boolean(excludedSurfaces[surfaceKey(person.placeholder, surface)]);
      const nodeId = `${personId}::alias::${surface.toLocaleLowerCase()}`;
      addNode({
        id: nodeId,
        label: surface,
        title: `alias · ${surface}`,
        group: excluded ? "aliasExcluded" : "alias",
        shape: "box",
        size: 12,
      });
      addEdge({
        from: personId,
        to: nodeId,
        label: "alias",
        dashes: true,
        length: 160,
      });
    }

    for (const coref of person.corefs || []) {
      const surface = String(coref || "").trim();
      if (!surface) {
        continue;
      }
      const excluded =
        personExcluded ||
        Boolean(excludedSurfaces[surfaceKey(person.placeholder, surface)]);
      const nodeId = `${personId}::coref::${surface.toLocaleLowerCase()}`;
      addNode({
        id: nodeId,
        label: surface,
        title: `coref · ${surface}`,
        group: excluded ? "aliasExcluded" : "coref",
        shape: "ellipse",
        size: 12,
      });
      addEdge({
        from: personId,
        to: nodeId,
        label: "coref",
        dashes: true,
        length: 160,
      });
    }

    for (const attr of person.attrs || []) {
      const surface = String(attr.value || "").trim();
      if (!surface) {
        continue;
      }
      const excluded =
        personExcluded ||
        Boolean(excludedSurfaces[surfaceKey(person.placeholder, surface)]) ||
        Boolean(attr.placeholder && excludedPlaceholders[attr.placeholder]);
      const nodeId = `${personId}::attr::${attr.key || "misc"}::${surface.toLocaleLowerCase()}`;
      addNode({
        id: nodeId,
        label: surface,
        title: `${attr.label || attr.key || "attr"} · ${surface}`,
        group: excluded ? "attrExcluded" : "attr",
        shape: "box",
        size: 10,
      });
      addEdge({
        from: personId,
        to: nodeId,
        label: String(attr.label || attr.key || "attr"),
        length: 200,
      });
    }

  }

  // Second pass: person↔person relations (targets must already be nodes).
  for (const person of persons) {
    const personId = person.placeholder || `person:${person.name}`;
    for (const rel of person.rels || []) {
      const targetId =
        resolvePersonId(persons, rel.targetPlaceholder || rel.target) ||
        resolvePersonId(persons, rel.target);
      if (!targetId) {
        continue;
      }
      addEdge({
        from: personId,
        to: targetId,
        label: String(rel.label || rel.key || "related"),
        arrows: "to",
        width: 2,
        length: 320,
      });
    }
  }

  return { nodes, edges };
}
