// @ai-dotfiles agent-dev-runtime managed
// Conservative subset of rust-v0.159.2 history/rollout and protocol/models.
// Unknown schemas are retained but cannot establish an ordinal boundary.
import { jsonLines, regularFile, reject, UUID, bundleFile } from './session-export-storage.mjs';
import { createHash } from 'node:crypto';

export const LINEAGE_POLICY = 'plain-prefix-v1';
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const string = value => typeof value === 'string';
const optional = (value, check) => value == null || check(value);
const keys = (value, allowed) => object(value) && Object.keys(value).every(key => allowed.includes(key));

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

function content(part) {
  if (!object(part)) return false;
  if (['input_text', 'output_text'].includes(part.type)) return keys(part, ['type', 'text']) && string(part.text);
  if (part.type === 'input_audio') return keys(part, ['type', 'audio_url']) && string(part.audio_url);
  if (part.type === 'input_image') return keys(part, ['type', 'image_url', 'file_id', 'detail'])
    && (string(part.image_url) || string(part.file_id)) && optional(part.image_url, string) && optional(part.file_id, string)
    && optional(part.detail, v => ['auto', 'low', 'high', 'original'].includes(v));
  return false;
}

function knownRecord(value) {
  if (!keys(value, ['timestamp', 'ordinal', 'type', 'payload']) || !string(value.timestamp)) return false;
  const p = value.payload;
  if (value.type !== 'response_item' || !object(p)) return false;
  if (p.type === 'message') return keys(p, ['type', 'id', 'role', 'content', 'phase', 'end_turn'])
    && optional(p.id, string) && string(p.role) && Array.isArray(p.content) && p.content.every(content)
    && optional(p.phase, v => ['commentary', 'final_answer'].includes(v)) && optional(p.end_turn, v => typeof v === 'boolean');
  if (p.type === 'function_call') return keys(p, ['type', 'id', 'call_id', 'name', 'arguments'])
    && optional(p.id, string) && string(p.call_id) && string(p.name) && string(p.arguments);
  // Tool outputs, events and context records need their own complete payload schemas.
  return false;
}

function knownMetadata(value) {
  const meta = value.payload;
  return keys(value, ['timestamp', 'ordinal', 'type', 'payload']) && string(value.timestamp)
    && keys(meta, ['id', 'session_id', 'timestamp', 'cwd', 'originator', 'cli_version', 'source', 'model_provider', 'history_mode', 'history_base', 'forked_from_id'])
    && ['timestamp', 'cwd', 'originator', 'cli_version'].every(key => string(meta[key]))
    && (meta.session_id === undefined || (string(meta.session_id) && UUID.test(meta.session_id)))
    && (meta.source === undefined || ['cli', 'vscode', 'exec', 'mcp', 'unknown'].includes(meta.source))
    && optional(meta.model_provider, string) && optional(meta.forked_from_id, id => UUID.test(id))
    && optional(meta.history_base, base => keys(base, ['thread_id', 'end_byte_offset', 'end_ordinal_exclusive']));
}

// Validate exactly the retained prefix, never count records after its byte boundary.
export async function validateHistoryPrefix(path, { owner, endByte, endOrdinal, progress }) {
  if (!Number.isSafeInteger(endByte) || endByte <= 0 || endByte > regularFile(path).size
    || (endOrdinal !== undefined && (!Number.isSafeInteger(endOrdinal) || endOrdinal < 1))) reject('Invalid inherited history boundary.');
  const digest = createHash('sha256');
  let bytes = 0;
  let expected, baseOrdinal, verified = true, first = true;
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
      if (!knownMetadata(value)) verified = false;
      if (ordinal === null) verified = false;
      else if (ordinal !== baseOrdinal) reject('History metadata ordinal does not match its base.');
    } else {
      // Once unverified, later schemas cannot restore verification. Keep parsing
      // every record and checking integer tokens so invalid data still fails.
      const ordinal = integer(record, value, 'ordinal', false);
      if (verified && (ordinal === null || ordinal !== expected || !knownRecord(value))) verified = false;
      if (verified) {
        if (expected === Number.MAX_SAFE_INTEGER) reject('History ordinal overflow.');
        expected++;
      }
    }
  }
  if (first) reject('Inherited history has no session metadata.');
  if (bytes !== endByte) reject('Inherited history changed while validating.');
  if (verified && endOrdinal !== undefined && expected !== endOrdinal) reject('History byte boundary and ordinal boundary disagree.');
  return { endByte, endOrdinal: endOrdinal ?? (verified ? expected : null), baseOrdinal,
    sha256: digest.digest('hex'), status: verified ? 'verified' : 'unverified' };
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
        const checked = await validateHistoryPrefix(path, { owner: meta.id, endByte: regularFile(path).size, progress });
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
