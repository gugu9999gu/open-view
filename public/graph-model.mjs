/** The full graph is the search domain. Canvas windows are only projections. */
export function createGraphIndex(graph) {
  if (!Array.isArray(graph?.nodes) || !Array.isArray(graph?.edges)) throw new TypeError('Invalid graph');
  const byId = new Map(), adjacent = new Map(), searchable = [];
  for (const node of graph.nodes) {
    if (typeof node.id !== 'string' || byId.has(node.id)) throw new TypeError('Duplicate or invalid node ID');
    byId.set(node.id, node);
    adjacent.set(node.id, new Set());
    searchable.push({ node, text: `${node.label ?? ''} ${node.path ?? ''} ${node.kind ?? ''}`.toLowerCase() });
  }
  for (const edge of graph.edges) {
    if (!byId.has(edge.source) || !byId.has(edge.target)) throw new TypeError('Dangling graph edge');
    adjacent.get(edge.source).add(edge.target);
    adjacent.get(edge.target).add(edge.source);
  }
  return { graph, byId, adjacent, searchable };
}
export function searchGraph(index, query, { offset = 0, limit = 30 } = {}) {
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1) throw new TypeError('Invalid search window');
  const text = String(query).trim().toLowerCase();
  const matches = index.searchable.filter(item => item.text.includes(text));
  return { total: matches.length, nodes: matches.slice(offset, offset + limit).map(item => item.node) };
}
export function graphWindow(index, { focusId, limit = 100 } = {}) {
  if (!Number.isInteger(limit) || limit < 1) throw new TypeError('Invalid canvas limit');
  if (focusId && !index.byId.has(focusId)) throw new Error('Unknown focus node');
  const ids = focusId ? [focusId, ...index.adjacent.get(focusId)] : [...index.byId.keys()];
  const selected = new Set(ids.slice(0, limit));
  return {
    nodes: [...selected].map(id => index.byId.get(id)),
    edges: index.graph.edges.filter(edge => selected.has(edge.source) && selected.has(edge.target)),
    totalNodes: index.byId.size, omittedNeighbors: focusId ? Math.max(0, ids.length - limit) : 0,
  };
}
