/** Only verified source refs become nodes. Edges mean observed ancestry, not inferred direct calls. */
export function sourceGraph(events, registry) {
  const mappings = events.map(event => ({ spanId: event.spanId, ...registry.resolve(event) }));
  const bySpan = new Map(events.map(event => [event.spanId, event]));
  const mapped = new Map(mappings.filter(item => item.status === 'linked').map(item => [item.spanId, item]));
  const nodes = new Map(), edges = new Map(); let ancestryTruncated = 0;
  for (const event of events) {
    const match = mapped.get(event.spanId); if (!match) continue;
    const id = match.sourceRef.definitionId;
    const node = nodes.get(id) || { id, manifestId: match.manifestId, sourceRef: match.sourceRef,
      label: match.label, line: match.line, basis: 'observed', executions: 0, errors: 0, durationMs: 0, spanIds: [] };
    node.executions++; node.errors += Number(event.status !== 'ok'); node.durationMs += event.durationMs; node.spanIds.push(event.spanId); nodes.set(id, node);
    let parent = event.parentSpanId, skipped = 0; const seen = new Set([event.spanId]);
    while (parent && !seen.has(parent)) {
      if (skipped >= 128) { ancestryTruncated++; break; }
      seen.add(parent);
      const ancestor = mapped.get(parent);
      if (ancestor) {
        const edgeId = `${ancestor.sourceRef.definitionId}:${id}:${skipped}`;
        const edge = edges.get(edgeId) || { id: edgeId, source: ancestor.sourceRef.definitionId, target: id,
          basis: 'observed', kind: 'span-ancestry', intermediateSpans: skipped, executions: 0 };
        edge.executions++; edges.set(edgeId, edge); break;
      }
      const entry = bySpan.get(parent); if (!entry) break;
      parent = entry.parentSpanId; skipped++;
    }
  }
  return { basis: 'observed', mappings, nodes: [...nodes.values()], edges: [...edges.values()],
    ancestryTruncated, linkedSpans: mapped.size, unlinkedSpans: events.length - mapped.size,
    sourceRetention: registry.stats(), note: 'Nodes are immutable source definitions; edges are observed span ancestry, not direct-call proof.' };
}
