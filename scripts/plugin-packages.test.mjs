import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function markdownFiles(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? markdownFiles(path) : entry.name.endsWith('.md') ? [path] : [];
  });
}

for (const name of ['agent-plugin-tools', 'ai-dotfiles-cli']) {
  test(`${name} keeps local documentation dependencies inside its isolated package`, t => {
    const root = mkdtempSync(join(tmpdir(), 'agent-package-test-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const plugin = join(root, name);
    cpSync(join(repository, 'plugins', name), plugin, { recursive: true });
    for (const file of markdownFiles(plugin)) {
      const text = readFileSync(file, 'utf8').replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, '');
      for (const match of text.matchAll(/\[[^\]\n]*\]\(([^\s)]+)\)/g)) {
        const link = match[1];
        if (/^[a-z][a-z0-9+.-]*:/i.test(link) || link.startsWith('#')) continue;
        const target = resolve(dirname(file), decodeURIComponent(link.split('#')[0]));
        const rel = relative(plugin, target);
        assert.ok(!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`), `${relative(plugin, file)} escapes the package: ${link}`);
        assert.ok(existsSync(target), `${relative(plugin, file)} has a missing target: ${link}`);
      }
    }
    if (name === 'agent-plugin-tools') {
      const skill = join(plugin, 'skills', 'plugin-creator-agent-plugins');
      for (const script of ['validate-agent-plugin.mjs', 'manage-local-agent-plugin.mjs', 'scaffold-local-agent-plugin.mjs', 'assemble-agent-marketplace.mjs']) {
        const result = spawnSync(process.execPath, [join(skill, 'scripts', script), '--help'], { cwd: root, encoding: 'utf8', env: { ...process.env, PATH: '' } });
        assert.equal(result.status, 0, result.stdout + result.stderr);
      }
    } else {
      assert.deepEqual(readdirSync(join(plugin, 'skills')).sort(), ['ai-dotfiles-cli', 'codex-history']);
    }
  });
}
