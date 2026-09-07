import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

test('export rejects private agent data, nested paths, and broad parent selections before writing', t => {
  const root = mkdtempSync(join(tmpdir(), 'agent-export-policy-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const exporter = join(root, 'export.mjs');
  copyFileSync(new URL('./export.js', import.meta.url), exporter);
  for (const path of [
    '.agents', '.agents/ai-dotfiles', '.agents/ai-dotfiles/development.json',
    '.agents/ai-dotfiles/state/marketplaces/team.json', '.agents/development.json', '.agents/skill-links.json',
  ]) {
    writeFileSync(join(root, 'export.yaml'), `paths:\n  - ${path}\n`);
    const result = spawnSync(process.execPath, [exporter, '--write'], { encoding: 'utf8' });
    assert.notEqual(result.status, 0, path);
    assert.match(result.stderr, /must not be exported|must be below/, path);
    assert.equal(existsSync(join(root, 'home')), false);
  }
});
