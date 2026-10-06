// @ai-dotfiles agent-dev-runtime managed
// Byte/ordinal proof, independent of codec. Payload schemas live in one module.
// Unknown schemas are retained but cannot establish an ordinal boundary.
import { jsonLines, reject, UUID, bundleFile } from './session-export-storage.mjs';
import { createHash } from 'node:crypto';
import { knownHistoryRecord } from './session-record-schema.mjs';

export const LINEAGE_POLICY = 'rollout-prefix-v2';
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function integer(record, owner, key, required = true) {
  const value = owner?.[key];
  if (value == null && !required) return null;
  const token = record.numberTokens?.get(owner)?.[key];
  if (!Number.isSafeInteger(value) || value < 0 || !/^(0|[1-9]\d*)$/.test(token ?? '')) {
    reject(`Invalid history integer (${key}) at line ${record.line}.`);
  }
  return value;
}

function historyMetadata(record, owner) {
  const value = record.value, meta = value?.payload;
  if (value?.type !== 'session_meta' || !object(meta) || !UUID.test(meta.id ?? '') || meta.id.toLowerCase() !== owner.toLowerCase()) {
    reject('History metadata does not match its owner.');
  }
  integer(record, value, 'ordinal', false);
  const base = meta.history_base;
  if (base != null) {
    if (!object(base) || !UUID.test(base.thread_id ?? '') || integer(record, base, 'end_byte_offset') === 0 || integer(record, base, 'end_ordinal_exclusive') === 0) {
      reject('Invalid inherited history boundary.');
    }
  }
  return meta;
}

// Validate exactly the retained prefix, never count records after its byte boundary.
export async function validateHistoryPrefix(path, { owner, endByte, endOrdinal, progress }) {
  if ((endByte !== undefined && (!Number.isSafeInteger(endByte) || endByte <= 0))
    || (endOrdinal !== undefined && (!Number.isSafeInteger(endOrdinal) || endOrdinal < 1))) reject('Invalid inherited history boundary.');
  const digest = createHash('sha256');
  let bytes = 0;
  let expected, baseOrdinal, verified = true, first = true;
  const issues = new Map();
  const unverified = (reason, line) => { verified = false; if (!issues.has(reason)) issues.set(reason, { reason, line }); };
  for await (const record of jsonLines(path, { endByte, numberTokens: true, onChunk(chunk) { bytes += chunk.length; digest.update(chunk); progress?.(bytes, endByte); } })) {
    const value = record.value;
    if (first) {
      first = false;
      const meta = historyMetadata(record, owner);
      if (meta.history_mode !== 'paginated' && !(meta.history_mode === 'legacy' && meta.history_base)) reject('Unsupported inherited session metadata.');
      baseOrdinal = meta.history_base?.end_ordinal_exclusive ?? 0;
      if (baseOrdinal >= Number.MAX_SAFE_INTEGER || (endOrdinal !== undefined && endOrdinal <= baseOrdinal)) reject('Inconsistent inherited history ordinals.');
      expected = baseOrdinal + 1;
      const ordinal = integer(record, value, 'ordinal', false);
      if (!knownHistoryRecord(record)) unverified('unsupported-session-metadata', record.line);
      if (ordinal === null) unverified('missing-ordinal', record.line);
      else if (ordinal !== baseOrdinal) reject('History metadata ordinal does not match its base.');
    } else {
      // Once unverified, later schemas cannot restore verification. Keep parsing
      // every record and checking integer tokens so invalid data still fails.
      const ordinal = integer(record, value, 'ordinal', false);
      if (ordinal === null) unverified('missing-ordinal', record.line);
      else if (verified && ordinal !== expected) unverified('noncontiguous-ordinal', record.line);
      // The first schema issue is sufficient: later payload checks cannot improve
      // either coverage or this bounded diagnostic. JSON/integer checks still run.
      if (!issues.has('unsupported-record-schema') && (!knownHistoryRecord(record) || value.type === 'session_meta')) {
        unverified('unsupported-record-schema', record.line);
      }
      if (verified) {
        if (expected === Number.MAX_SAFE_INTEGER) reject('History ordinal overflow.');
        expected++;
      }
    }
  }
  if (first) reject('Inherited history has no session metadata.');
  if (endByte !== undefined && bytes !== endByte) reject('Inherited history changed while validating.');
  if (verified && endOrdinal !== undefined && expected !== endOrdinal) reject('History byte boundary and ordinal boundary disagree.');
  return { endByte: bytes, endOrdinal: endOrdinal ?? (verified ? expected : null), baseOrdinal,
    sha256: digest.digest('hex'), status: verified ? 'verified' : 'unverified', ...(issues.size ? { issues: [...issues.values()] } : {}) };
}

export async function validateSavedLineage(folder, sources, owner, historyMode = 'legacy', progress) {
  const byId = new Map(), metadata = new Map(), boundaries = [], rollouts = [];
  let currentFile;
  try {
    for (const source of sources) {
      currentFile = source.file;
      if (!UUID.test(source.id ?? '') || source.id !== source.id.toLowerCase() || byId.has(source.id)) reject('Invalid or duplicate saved rollout identity.');
      byId.set(source.id, source);
      for await (const record of jsonLines(bundleFile(folder, source.file), { numberTokens: true })) {
        if (record.value?.type !== 'session_meta' && historyMode === 'legacy' && !source.file.startsWith('dependencies/')) break;
        // The selected/owned files belong to owner; dependencies carry their own metadata.
        const expectedOwner = source.file.startsWith('dependencies/') ? record.value?.payload?.id : owner;
        if (!UUID.test(expectedOwner ?? '')) reject('Invalid saved history owner.');
        const meta = historyMetadata(record, expectedOwner);
        metadata.set(source.id, meta);
        break;
      }
      if (!metadata.has(source.id) && historyMode !== 'legacy') reject('Paginated history has no session metadata.');
    }
    for (const [id, meta] of metadata) {
      const source = byId.get(id);
      currentFile = source.file;
      if (!source.file.startsWith('dependencies/') && (meta.history_mode === 'paginated' || meta.history_base || historyMode === 'paginated')) {
        const path = bundleFile(folder, source.file);
        const checked = await validateHistoryPrefix(path, { owner: meta.id, progress });
        rollouts.push({ id, file: source.file, ...checked });
      } else if (meta.history_mode != null && !['legacy', 'paginated'].includes(meta.history_mode)) reject('Unsupported history mode.');
      const seen = new Set([id]);
      let next = meta.history_base?.thread_id?.toLowerCase();
      while (next && metadata.has(next)) {
        if (seen.has(next) || seen.size >= 128) reject('Invalid or cyclic inherited history reference.');
        seen.add(next); next = metadata.get(next).history_base?.thread_id?.toLowerCase();
      }
      const base = meta.history_base;
      if (!base) continue;
      const target = byId.get(base.thread_id.toLowerCase());
      if (!target) { boundaries.push({ source: id, target: base.thread_id.toLowerCase(), status: 'unverified' }); continue; }
      currentFile = target.file;
      if (!metadata.has(target.id)) reject('Inherited history has no session metadata.');
      const boundary = await validateHistoryPrefix(bundleFile(folder, target.file), {
        owner: metadata.get(target.id)?.id, endByte: base.end_byte_offset, endOrdinal: base.end_ordinal_exclusive, progress,
      });
      boundaries.push({ source: id, target: target.id, file: target.file, ...boundary });
    }
    return { policy: LINEAGE_POLICY, rollouts, boundaries,
      status: rollouts.some(b => b.status !== 'verified') || boundaries.some(b => b.status !== 'verified') ? 'unverified' : 'verified' };
  } catch (error) {
    if (error instanceof Error) error.exportSource = currentFile;
    throw error;
  }
}
