import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const SKIP = new Set(['node_modules', 'dist', 'build', 'coverage', '.next', '.git', '.harness', '.leerness', '.open-view']);
const TYPES = /\.(tsx?|jsx?|mjs|cjs)$/i;
const normalize = value => value.split(path.sep).join('/');
const LIMITS = { maxFiles: 1500, maxBytes: 512 * 1024, maxTotalBytes: 24 * 1024 * 1024,
  maxDepth: 20, maxDirectories: 3000, maxEntries: 30000, maxDurationMs: 10_000, maxNotices: 200 };

/** Reads bounded source snapshots only; project modules and configuration are never executed. */
export async function collectSources(root, options = {}) {
  const limits = { ...LIMITS, ...options };
  for (const key of Object.keys(LIMITS)) {
    if (!Number.isSafeInteger(limits[key]) || limits[key] < 0) throw new TypeError(`Invalid ${key}`);
  }
  const resolvedRoot = await fs.realpath(root);
  if (!(await fs.stat(resolvedRoot)).isDirectory()) throw new Error('Project root must be a directory');
  const clock = options.clock || (() => performance.now());
  const started = clock();
  const files = [], notices = [], reasons = new Set();
  let bytes = 0, directories = 0, entries = 0, suppressedNotices = 0, stopped = false;
  const relative = full => normalize(path.relative(resolvedRoot, full)) || '.';
  const outside = full => { const rel = path.relative(resolvedRoot, full); return rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel); };
  function notice(kind, full, partial = true) {
    if (partial) reasons.add(kind);
    if (notices.length < limits.maxNotices) notices.push({ kind, path: relative(full), partial });
    else suppressedNotices++;
  }
  function deadline(full) {
    if (stopped) return true;
    if (clock() - started >= limits.maxDurationMs) { notice('time-limit', full); stopped = true; }
    return stopped;
  }
  async function readSource(full) {
    if (files.length >= limits.maxFiles) { notice('file-limit', full); stopped = true; return; }
    let handle;
    try {
      const real = await fs.realpath(full);
      if (outside(real)) { notice('outside-root', full); return; }
      handle = await fs.open(full, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
      const stat = await handle.stat();
      if (!stat.isFile()) { notice('not-regular-file', full); return; }
      if (stat.size > limits.maxBytes) { notice('file-size-limit', full); return; }
      if (bytes + stat.size > limits.maxTotalBytes) { notice('total-size-limit', full); return; }
      // Cap the read even if a trusted development file grows after stat().
      const capacity = Math.min(limits.maxBytes, limits.maxTotalBytes - bytes) + 1;
      const buffer = Buffer.alloc(capacity);
      let count = 0;
      while (count < capacity) {
        const result = await handle.read(buffer, count, capacity - count, count);
        if (!result.bytesRead) break;
        count += result.bytesRead;
        if (deadline(full)) return;
      }
      if (count > limits.maxBytes || bytes + count > limits.maxTotalBytes) { notice('size-changed-limit', full); return; }
      bytes += count;
      files.push({ full: real, relative: relative(real), text: buffer.toString('utf8', 0, count) });
    } catch { notice('file-read-error', full); }
    finally { await handle?.close(); }
  }
  async function walk(dir, depth = 0) {
    if (deadline(dir)) return;
    if (depth > limits.maxDepth) { notice('depth-limit', dir); return; }
    if (directories >= limits.maxDirectories) { notice('directory-limit', dir); stopped = true; return; }
    directories++;
    try {
      const real = await fs.realpath(dir);
      if (outside(real)) { notice('outside-root', dir); return; }
      // opendir streams entries: a huge non-code directory cannot allocate an unbounded readdir array.
      for await (const entry of await fs.opendir(dir)) {
        if (deadline(dir)) break;
        const full = path.join(dir, entry.name);
        if (entries >= limits.maxEntries) { notice('entry-limit', full); stopped = true; break; }
        entries++;
        if (entry.name.startsWith('.') || SKIP.has(entry.name)) continue;
        if (entry.isSymbolicLink()) { notice('symlink-skipped', full, false); continue; }
        if (entry.isDirectory()) await walk(full, depth + 1);
        else if (entry.isFile() && TYPES.test(entry.name)) await readSource(full);
      }
    } catch { notice('directory-read-error', dir); }
  }
  await walk(resolvedRoot);
  files.sort((a, b) => a.relative < b.relative ? -1 : a.relative > b.relative ? 1 : 0);
  return { resolvedRoot, files, notices, coverage: {
    status: reasons.size ? 'partial' : 'complete', truncated: reasons.size > 0,
    reasons: [...reasons], files: files.length, bytes, directories, entries, suppressedNotices,
    scope: 'supported-source-files', limits: Object.fromEntries(Object.keys(LIMITS).map(key => [key, limits[key]])),
  } };
}
