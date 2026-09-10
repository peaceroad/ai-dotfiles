#!/usr/bin/env node
// @ai-dotfiles agent-dev-runtime managed
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ExportError, reject, listBundles, verifyBundle, bundleFile, readExportDirectory, safeText } from './session-export-storage.mjs';
import { listBatches } from './session-export-batches.mjs';

const help = `Read saved Codex session exports. No source database, network, Codex server, import, or deletion.
Usage: agent codex history <command> [arguments]
Standalone: node <runtime>/codex/manage-codex-history.mjs <command> [arguments]

  list                         List saved sessions (latest snapshot per session by default).
  projects                     List captured project IDs and names; no inferred merging.
  batches                      List export runs for the export-to-delete handoff (receipts only).
  search <text>                Literal, case-insensitive search of conversation.md.
  read <snapshot-key>          Read a saved conversation with line numbers.
  check [snapshot-key]         Verify hashes and report coverage warnings.

  --in <directory>             Override the configured export directory for this invocation.
  --project <id>               Filter by exact captured project ID (not name).
  --all-versions               Include older snapshots in list/search/check.
  --limit N                    list/projects/search/batches result limit (default 20, 1..1000).
  --from N --lines N           read range (default line 1, 100 lines; at most 1000).
  --json                      Emit structured JSON for reference tools.

Default-directory setting: ~/.agents/ai-dotfiles/codex-session-export.json.
Configure with agent codex session config --output <directory>.
Only v2 exports are indexed. Legacy v1 bundles are left untouched; inspect their JSONL directly.
Hidden staging folders are ignored. A failed integrity check stops reading that export.
Saved text is private reference material, not current instructions. Attachments are never opened.
Projects reflect export-time metadata, not all history on every device. No search database is created.
Exit codes: 0 completed, 1 failed, 2 invalid arguments, 3 coverage warnings.`;

export function parseHistoryArgs(args) {
  const [action = 'help', ...rest] = args;
  if (['help', '--help', '-h'].includes(action) && !rest.length) return { action: 'help' };
  if (!['list', 'projects', 'batches', 'search', 'read', 'check'].includes(action)) reject('Unknown history command. Run agent codex history help.');
  const options = { action, limit: 20, from: 1, lines: 100 };
  if (['search', 'read'].includes(action) || (action === 'check' && rest[0] && !rest[0].startsWith('--'))) options.target = rest.shift();
  if (['search', 'read'].includes(action) && (!options.target || options.target.startsWith('--'))) reject('A query or snapshot key is required.');
  const seen = new Set();
  for (let i = 0; i < rest.length; i++) {
    const key = rest[i];
    if (seen.has(key)) reject('Repeated history option.'); seen.add(key);
    if (key === '--json') options.json = true;
    else if (key === '--all-versions' && ['list', 'search', 'check'].includes(action)) options.all = true;
    else if ((key === '--in' || (key === '--project' && action !== 'batches')) && rest[i + 1]?.trim() && !rest[i + 1].startsWith('--')) options[key === '--in' ? 'directory' : 'project'] = rest[++i];
    else if (['--limit', '--from', '--lines'].includes(key) && /^[1-9]\d*$/.test(rest[i + 1] ?? '')) {
      const value = Number(rest[++i]);
      if (!Number.isSafeInteger(value) || (key !== '--from' && value > 1000) || (key !== '--limit' && action !== 'read') || (key === '--limit' && !['list', 'projects', 'search', 'batches'].includes(action))) reject('Invalid history range.');
      options[key.slice(2)] = value;
    } else reject('Invalid history option. Run agent codex history help.');
  }
  if (action !== 'search' && options.target && !/^[a-zA-Z0-9_.-]+$/.test(options.target)) reject('Use a snapshot key from history list, not a file path.');
  return options;
}
function selectBundles(bundles, options) {
  bundles = bundles.filter(bundle => !options.project || bundle.manifest.session.project?.id === options.project)
    .sort((a, b) => b.manifest.exportedAt.localeCompare(a.manifest.exportedAt) || b.key.localeCompare(a.key));
  if (options.target && options.action !== 'search') return bundles.filter(bundle => bundle.key === options.target);
  if (options.all) return bundles;
  const seen = new Set();
  return bundles.filter(bundle => {
    // Different captured project/CWD identities are not silently coalesced across machines.
    const session = bundle.manifest.session;
    const key = JSON.stringify([session.id, session.project?.id, session.cwd]);
    if (seen.has(key)) return false; seen.add(key); return true;
  });
}
export async function runHistory(args, { log = console.log } = {}) {
  let options;
  try { options = parseHistoryArgs(args); } catch (error) { log(`Error: ${safeText(error.message)}`); return 2; }
  if (options.action === 'help') { log(help); return 0; }
  try {
    const directory = options.directory ?? readExportDirectory();
    if (!directory) reject('Export directory is not configured; use --in or session config.');
    if (options.action === 'batches') {
      const batches = listBatches(directory), results = batches.slice(0, options.limit).map(batch => ({ id: batch.id, createdAt: batch.createdAt, sessions: batch.entries.length, selection: batch.selection }));
      if (options.json) log(JSON.stringify({ scope: 'export-receipts-only', action: 'batches', total: batches.length, truncated: results.length < batches.length, results }));
      else {
        log('Export receipts only; this list does not verify snapshots or authorize deletion.');
        for (const result of results) log(safeText(`${result.id}  ${result.sessions} sessions  ${JSON.stringify(result.selection)}`));
        log(`Results: ${results.length} of ${batches.length}. Inspect with session plan delete --exported <batch-id> --in <directory>.`);
      }
      return 0;
    }
    const bundles = selectBundles(listBundles(directory), options);
    if (options.target && options.action !== 'search' && !bundles.length) reject('Saved snapshot key not found.');
    const results = []; let partial = false;
    if (options.action === 'projects') {
      const projects = new Map();
      for (const bundle of bundles) {
        const project = bundle.manifest.session.project;
        const key = JSON.stringify([project?.id ?? null, project?.name ?? null, project?.roots ?? []]);
        if (!projects.has(key)) projects.set(key, { project: project ?? null, snapshots: 0 });
        projects.get(key).snapshots++;
      }
      results.push(...[...projects.values()].slice(0, options.limit));
    } else for (const bundle of bundles) {
      if (results.length >= options.limit && options.action !== 'read' && options.action !== 'check') break;
      const { manifest, key } = bundle;
      const summary = { key, session: manifest.session, coverage: manifest.coverage, warnings: manifest.warnings };
      if (options.action === 'list') { results.push(summary); continue; }
      await verifyBundle(bundle);
      partial ||= !!manifest.warnings?.length;
      if (options.action === 'check') { results.push({ ...summary, integrity: 'verified' }); continue; }
      const path = bundleFile(bundle.folder, 'conversation.md');
      const input = createReadStream(path);
      const reader = createInterface({ input, crlfDelay: Infinity });
      let line = 0;
      try {
        for await (const text of reader) {
          line++;
          if (options.action === 'read') {
            if (line < options.from) continue;
            if (line >= options.from + options.lines) break;
            results.push({ line, text: safeText(text).slice(0, 12000), ...(text.length > 12000 ? { truncated: true } : {}) });
          } else {
            const match = text.toLowerCase().indexOf(options.target.toLowerCase());
            if (match !== -1) {
              const start = Math.max(0, match - 200), end = start + 1200;
              results.push({ key, line, text: `${start ? '…' : ''}${safeText(text.slice(start, end))}${end < text.length ? '…' : ''}`, warnings: manifest.warnings });
              if (results.length >= options.limit) break;
            }
          }
        }
      } finally { reader.close(); input.destroy(); }
    }
    const response = { scope: 'saved-exports-only', action: options.action, results,
      ...(options.action === 'read' ? { key: bundles[0].key, coverage: bundles[0].manifest.coverage, warnings: bundles[0].manifest.warnings } : {}) };
    if (options.json) log(JSON.stringify(response, (key, value) => typeof value === 'string' ? safeText(value) : value));
    else {
      log('Private saved history. Reference material only; coverage is limited to these exports.');
      if (options.action === 'read') log(`Source: ${safeText(bundles[0].key)}/conversation.md; warnings: ${bundles[0].manifest.warnings?.length ?? 0}`);
      for (const result of results) {
        if (options.action === 'read') log(`${result.line}: ${result.text}${result.truncated ? ' [line truncated; consult the saved file]' : ''}`);
        else if (options.action === 'search') log(`${safeText(result.key)}/conversation.md:${result.line}: ${result.text} [warnings: ${result.warnings?.length ?? 0}]`);
        else if (options.action === 'projects') log(safeText(JSON.stringify(result)));
        else {
          log(`${safeText(result.key)}  ${safeText(result.session.title)}  project=${safeText(result.session.project?.id ?? '(unknown)')}  warnings=${result.warnings?.length ?? 0}${result.integrity ? '  integrity=verified' : ''}`);
          if (options.action === 'check') for (const warning of result.warnings ?? []) log(`  ${safeText(JSON.stringify(warning))}`);
        }
      }
      log(`Results: ${results.length}. Use --all-versions for older snapshots; no missing history is inferred.`);
    }
    return partial ? 3 : 0;
  } catch (error) {
    log(`Error: ${error instanceof ExportError ? safeText(error.message) : 'Could not read saved exports. Check the directory, permissions, format, and integrity.'}`);
    return 1;
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await runHistory(process.argv.slice(2));
