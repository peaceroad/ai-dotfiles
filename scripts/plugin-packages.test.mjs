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

function assertLocalDocumentation(root) {
  for (const file of markdownFiles(root)) {
    const text = readFileSync(file, 'utf8').replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, '');
    for (const match of text.matchAll(/\[[^\]\n]*\]\(([^\s)]+)\)/g)) {
      const link = match[1];
      if (/^[a-z][a-z0-9+.-]*:/i.test(link) || link.startsWith('#')) continue;
      const target = resolve(dirname(file), decodeURIComponent(link.split('#')[0]));
      const rel = relative(root, target);
      assert.ok(!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`), `${relative(root, file)} escapes the distribution: ${link}`);
      assert.ok(existsSync(target), `${relative(root, file)} has a missing target: ${link}`);
    }
  }
}

for (const name of ['agent-design-tools', 'agent-plugin-tools', 'ai-dotfiles-cli']) {
  test(`${name} keeps local documentation dependencies inside its isolated package`, t => {
    const root = mkdtempSync(join(tmpdir(), 'agent-package-test-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const plugin = join(root, name);
    cpSync(join(repository, 'plugins', name), plugin, { recursive: true });
    assertLocalDocumentation(plugin);
    if (name === 'agent-plugin-tools') {
      const skill = join(plugin, 'skills', 'plugin-creator-agent-plugins');
      for (const script of ['validate-agent-plugin.mjs', 'manage-local-agent-plugin.mjs', 'scaffold-local-agent-plugin.mjs', 'assemble-agent-marketplace.mjs']) {
        const result = spawnSync(process.execPath, [join(skill, 'scripts', script), '--help'], { cwd: root, encoding: 'utf8', env: { ...process.env, PATH: '' } });
        assert.equal(result.status, 0, result.stdout + result.stderr);
      }
    } else if (name === 'ai-dotfiles-cli') {
      assert.deepEqual(readdirSync(join(plugin, 'skills')).sort(), ['ai-dotfiles-cli', 'codex-history']);
    } else {
      assert.deepEqual(readdirSync(join(plugin, 'skills')).sort(), ['agent-workflow-design', 'prompt-design', 'prompt-gemini-reference']);
    }
  });
}

for (const names of [['prompt-design'], ['prompt-design', 'prompt-gemini-reference']]) {
  test(`standalone ${names.join(' + ')} keeps documentation links within the installed skills`, t => {
    const root = mkdtempSync(join(tmpdir(), 'prompt-skill-test-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    for (const name of names) {
      cpSync(join(repository, 'plugins', 'agent-design-tools', 'skills', name), join(root, name), { recursive: true });
    }
    assertLocalDocumentation(root);
  });
}
