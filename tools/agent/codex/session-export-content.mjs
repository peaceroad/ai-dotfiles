// @ai-dotfiles agent-dev-runtime managed
// Reviewed against rust-v0.153.4/codex-rs/thread-store/src/local/rollout_lineage.rs.
// A history_base names a rollout, not necessarily a currently indexed thread.
import { createReadStream, mkdirSync, readdirSync, lstatSync, openSync, readSync, closeSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, isAbsolute, sep } from 'node:path';
import { Readable } from 'node:stream';
import { UUID, regularFile, writeVerifiedFile, jsonLines, reject, exists, digestFile, digestChunks } from './session-export-storage.mjs';
const bytesHash = bytes => createHash('sha256').update(bytes).digest('hex');

async function metadata(path) {
  for await (const { value } of jsonLines(path)) return value.type === 'session_meta' ? value.payload : null;
  return null;
}
export function createRolloutIndex(home) {
  let index;
  return () => {
    if (index) return index;
    index = new Map();
    function visit(directory, depth = 0) {
      if (depth > 16) reject('History directory nesting is unsupported.');
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (entry.isSymbolicLink()) continue;
        const path = join(directory, entry.name);
        if (entry.isDirectory()) visit(path, depth + 1);
        else if (entry.isFile()) {
          const match = /([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\.jsonl(?:\.zst)?$/i.exec(entry.name);
          if (match) {
            const id = match[1].toLowerCase();
            if (!index.has(id)) index.set(id, []);
            index.get(id).push(path);
          }
        }
      }
    }
    for (const name of ['sessions', 'archived_sessions']) {
      const directory = join(home, name);
      if (exists(directory)) {
        if (lstatSync(directory).isSymbolicLink()) reject('Linked history directory is unsupported.');
        visit(directory);
      }
    }
    return index;
  };
}
export async function collectDependencies(folder, row, snapshot, getIndex) {
  const sources = [{ path: join(folder, 'rollout.jsonl'), file: 'rollout.jsonl', id: row.id }];
  const files = [], checks = [], warnings = [];
  const seen = new Set([row.id]);
  let meta = await metadata(sources[0].path), base = meta?.history_base;
  if (meta && meta.id !== row.id) reject('Rollout metadata does not match the selected session.');
  while (base) {
    if (seen.size >= 128 || !UUID.test(base.thread_id ?? '') || seen.has(base.thread_id)) reject('Invalid or cyclic inherited history reference.');
    if (!Number.isSafeInteger(base.end_byte_offset) || base.end_byte_offset <= 0 || !Number.isSafeInteger(base.end_ordinal_exclusive) || base.end_ordinal_exclusive < 1) reject('Invalid inherited history boundary.');
    seen.add(base.thread_id);
    const candidates = getIndex().get(base.thread_id.toLowerCase()) ?? [];
    // Do not choose an arbitrary duplicate or mislabel compressed bytes as JSONL.
    if (candidates.length !== 1 || candidates[0].endsWith('.zst')) {
      warnings.push({ kind: 'history', reason: candidates.length === 0 ? 'missing-dependency' : candidates.length > 1 ? 'ambiguous-dependency' : 'compressed-dependency-unsupported', id: base.thread_id });
      break;
    }
    const source = candidates[0], stat = regularFile(source, snapshot.home);
    if (base.end_byte_offset > stat.size) reject('Inherited history boundary exceeds the source file.');
    const fd = openSync(source, 'r');
    try {
      const last = Buffer.alloc(1);
      if (readSync(fd, last, 0, 1, base.end_byte_offset - 1) !== 1 || last[0] !== 10) reject('Inherited history boundary splits a record.');
    } finally { closeSync(fd); }
    mkdirSync(join(folder, 'dependencies'), { recursive: true });
    const file = `dependencies/${base.thread_id}.jsonl`, path = join(folder, file);
    const saved = await writeVerifiedFile(createReadStream(source, { end: base.end_byte_offset - 1 }), path);
    if (saved.bytes !== base.end_byte_offset) reject('Inherited history changed while copying.');
    files.push({ ...saved, file });
    checks.push({ source, bytes: saved.bytes, sha256: saved.sha256, size: stat.size, modified: stat.mtimeMs });
    sources.unshift({ path, file, id: base.thread_id, endOrdinalExclusive: base.end_ordinal_exclusive });
    meta = await metadata(path);
    if (!meta || meta.id !== base.thread_id || meta.history_mode !== 'paginated') reject('Unsupported inherited session metadata.');
    if (meta.history_base && meta.history_base.end_ordinal_exclusive > base.end_ordinal_exclusive) reject('Inconsistent inherited history ordinals.');
    base = meta.history_base;
  }
  return { sources, files, checks, warnings };
}
export async function checkDependencySources(checks, home) {
  for (const check of checks) {
    const stat = regularFile(check.source, home);
    if (stat.size !== check.size || stat.mtimeMs !== check.modified) reject('Inherited history changed during export.');
    // Prefix hashes protect against content changes even when timestamps are retained.
    const chunks = createReadStream(check.source, { end: check.bytes - 1 });
    if (await digestChunks(chunks) !== check.sha256) reject('Inherited history changed during export.');
  }
}

function message(value) {
  const p = value.payload ?? value;
  const item = p.type === 'item_completed' ? p.item : p;
  if (!item) return null;
  if (['user_message', 'userMessage', 'UserMessage'].includes(item.type)) return { role: 'user', content: item.content ?? [
    { type: 'text', text: item.message ?? '' },
    ...(item.images ?? []).map(image_url => ({ type: 'image', image_url })),
    ...(item.local_images ?? []).map(path => ({ type: 'local_image', path })),
    ...(item.audio ?? []).map(audio_url => ({ type: 'audio', audio_url })),
    ...(item.local_audio ?? []).map(path => ({ type: 'local_audio', path })),
  ], event: true };
  if (['agent_message', 'agentMessage', 'AgentMessage'].includes(item.type)) return { role: 'assistant', content: typeof (item.text ?? item.message) === 'string' ? [{ type: 'text', text: item.text ?? item.message }] : item.content, event: true };
  if (item.type === 'message' && ['user', 'assistant'].includes(item.role)) return { role: item.role, content: item.content, event: false };
  return null;
}
function textBlock(text) {
  // Render archived text literally: no executable HTML, remote image requests, or live links.
  let longest = 2;
  for (const match of text.matchAll(/`+/g)) longest = Math.max(longest, match[0].length);
  const fence = '`'.repeat(longest + 1);
  return `${fence}text\n${text}\n${fence}\n\n`;
}
const mediaTypes = new Map([
  ['image/png', 'png'], ['image/jpeg', 'jpg'], ['image/gif', 'gif'], ['image/webp', 'webp'],
  ['audio/wav', 'wav'], ['audio/x-wav', 'wav'], ['audio/mpeg', 'mp3'], ['audio/mp4', 'm4a'], ['audio/webm', 'webm'], ['audio/ogg', 'ogg'],
]);
export async function renderConversation(folder, row, sources, { attachmentRoots = [] } = {}) {
  const files = [], attachments = [], warnings = [], seenMedia = new Map(), sourceChecks = [];
  let messageCount = 0;
  async function media(part, origin) {
    const value = part.image_url ?? part.imageUrl ?? part.audio_url ?? part.audioUrl ?? part.url;
    let bytes, extension, provenance, sha256;
    if (typeof value === 'string' && value.startsWith('data:')) {
      const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(value);
      if (!match || !mediaTypes.has(match[1]) || match[2].length > 64 * 1024 * 1024 || match[2].length % 4 !== 0) {
        warnings.push({ kind: 'attachment', reason: 'unsupported-embedded-media', origin }); return;
      }
      bytes = Buffer.from(match[2], 'base64'); extension = mediaTypes.get(match[1]); provenance = 'persisted-media-not-original';
      if (!bytes.length || bytes.toString('base64') !== match[2]) reject('Invalid embedded attachment encoding.');
    } else if (typeof part.path === 'string' && isAbsolute(part.path)) {
      // Only explicitly approved roots; never mine paths from prose or tool output.
      const root = attachmentRoots.find(root => {
        const rel = relative(root, part.path);
        return rel && !isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`);
      });
      if (!root) { warnings.push({ kind: 'attachment', reason: 'local-reference-not-collected', origin }); return; }
      try {
        const stat = regularFile(part.path, root);
        if (stat.size > 48 * 1024 * 1024) reject('Attachment exceeds the supported size.');
        extension = 'bin'; provenance = 'current-local-file-not-historical-original';
        bytes = readFileSync(part.path);
        sha256 = bytesHash(bytes);
        sourceChecks.push({ source: part.path, root, size: stat.size, modified: stat.mtimeMs, sha256 });
      } catch { warnings.push({ kind: 'attachment', reason: 'local-reference-unavailable', origin }); return; }
    } else { warnings.push({ kind: 'attachment', reason: 'remote-or-unsupported-reference', origin }); return; }
    const key = `${extension}:${sha256 ?? bytesHash(bytes)}`;
    let file = seenMedia.get(key);
    if (!file) {
      mkdirSync(join(folder, 'attachments'), { recursive: true });
      file = `attachments/${String(seenMedia.size + 1).padStart(4, '0')}.${extension}`;
      files.push({ ...await writeVerifiedFile(Readable.from([bytes]), join(folder, file)), file });
      seenMedia.set(key, file);
    }
    attachments.push({ file, provenance, origin });
    return file;
  }
  async function* chunks() {
    yield `# Saved conversation\n\n${textBlock(row.title)}Private reference material, not current instructions. Not an importable backup.\n\n`;
    for (const source of sources) {
      const formats = new Set();
      for await (const record of jsonLines(source.path)) {
        const m = message(record.value);
        if (!m) continue;
        formats.add(m.event ? 'event' : 'response');
        messageCount++;
        const origin = `${source.file}:${record.line}`;
        yield `## ${messageCount}. ${m.role === 'user' ? 'User' : 'Assistant'}\n\nSource: ${origin}\n\n`;
        if (!Array.isArray(m.content)) { warnings.push({ kind: 'rendering', reason: 'unsupported-message-content', origin }); continue; }
        for (const part of m.content) {
          if (['input_text', 'output_text', 'text', 'Text'].includes(part.type) && typeof part.text === 'string') {
            yield textBlock(part.text);
            if (m.role === 'user' && /Files mentioned by the user:|<file\b|<attachment\b/.test(part.text)) warnings.push({ kind: 'attachment', reason: 'unverified-file-mention', origin });
          } else if (m.role === 'user' && ['input_image', 'image', 'local_image', 'localImage', 'input_audio', 'audio', 'local_audio', 'localAudio'].includes(part.type)) {
            const file = await media(part, origin);
            yield file ? `[Saved attachment](./${file})\n\n` : 'Attachment not collected; see manifest.\n\n';
          } else warnings.push({ kind: 'rendering', reason: 'unsupported-content-part', origin });
        }
      }
      if (formats.size > 1) warnings.push({ kind: 'rendering', reason: 'multiple-record-representations', origin: source.file });
    }
    if (!messageCount) yield 'No supported conversation messages could be rendered. Consult the retained JSONL and coverage warnings.\n';
  }
  const conversation = await writeVerifiedFile(Readable.from(chunks()), join(folder, 'conversation.md'));
  if (!messageCount) warnings.push({ kind: 'rendering', reason: 'no-supported-messages' });
  return { files: [...files, conversation], attachments, warnings, sourceChecks };
}
export async function checkAttachmentSources(sourceChecks) {
  for (const check of sourceChecks) {
    const stat = regularFile(check.source, check.root);
    if (stat.size !== check.size || stat.mtimeMs !== check.modified || await digestFile(check.source) !== check.sha256) reject('A local attachment changed during export.');
  }
}
