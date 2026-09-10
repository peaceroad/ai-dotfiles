import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CODEX_TOOLS, runCodex, runTool } from './codex.mjs';

const agent = fileURLToPath(new URL('../agent.mjs', import.meta.url));

test('non-interactive entry and help only describe operations', async () => {
  for (const args of [[], ['--help'], ['help'], ['-h'], ...CODEX_TOOLS.map(tool => [tool.name])]) {
    const output = [];
    assert.equal(await runCodex(args, {
      interactive: false, platform: 'win32', log: line => output.push(line),
      ask: () => assert.fail('Must not prompt'), run: () => assert.fail('Must not run'),
    }), 0);
    assert.match(output.join('\n'), /Usage: agent codex/);
  }
});

test('all registered actions preserve arguments and child exit status', async () => {
  for (const tool of CODEX_TOOLS) {
    for (const [action] of tool.actions) {
      const args = [action, 'space and 日本語', 'literal&value'];
      assert.equal(await runCodex([tool.name, ...args], {
        platform: 'win32',
        run: (selected, forwarded) => {
          assert.equal(selected, tool);
          assert.deepEqual(forwarded, args);
          return 7;
        },
      }), 7);
    }
    for (const help of ['help', '-h', '--help']) {
      assert.equal(await runCodex([tool.name, help], {
        platform: 'win32',
        run: (selected, args) => { assert.equal(selected, tool); assert.deepEqual(args, ['help']); return 0; },
      }), 0);
    }
  }
});

test('unknown commands and excess help arguments do not launch anything', async () => {
  for (const args of [['unknown'], ['log-policy', '--force'], ['git-acl', 'help', 'extra'], ['help', 'extra']]) {
    assert.equal(await runCodex(args, { log() {}, run: () => assert.fail('Must not run') }), 2);
  }
});

test('typo guidance lists local choices and respects platform visibility', async () => {
  for (const platform of ['win32', 'darwin', 'linux']) {
    const output = [];
    const options = { platform, log: line => output.push(line), run: () => assert.fail('Must not run') };
    assert.equal(await runCodex(['sesion'], options), 2);
    assert.match(output.join('\n'), /Available:.*session.*history/);
    assert.equal(output.join('\n').includes('git-acl'), platform === 'win32');
    output.length = 0;
    assert.equal(await runCodex(['session', 'exprot'], options), 2);
    assert.match(output.join('\n'), /Available:.*export/);
    assert.match(output.join('\n'), /agent codex session help/);
  }
});

test('menu supports descriptions, back, cancellation, and explicit operations', async () => {
  const answers = ['invalid', ' G ', '', 'repair', '', ' STATUS ', 'space and 日本語', 'b', 'l', 'suppress', 'help', ' Q '];
  const output = [];
  const calls = [];
  assert.equal(await runCodex([], {
    interactive: true, platform: 'win32', log: line => output.push(line),
    ask: async () => { assert.ok(answers.length); return answers.shift(); },
    run: (tool, args) => { calls.push([tool.name, args]); return calls.length === 1 ? 1 : 0; },
  }), 1);
  assert.deepEqual(calls, [
    ['git-acl', ['status', resolve('space and 日本語')]],
    ['log-policy', ['suppress']], // The child owns level selection and confirmation.
    ['log-policy', ['help']],
  ]);
  assert.equal(answers.length, 0);
  assert.match(output.join('\n'), /no automatic rollback/);
  assert.match(output.join('\n'), /Choose a listed action/);
});

test('menu maps each displayed action without implicit changes', async () => {
  for (const tool of CODEX_TOOLS) {
    for (const [index, [action]] of tool.actions.entries()) {
      const answers = [String(index + 1), ...(tool.repository || (tool.name === 'history' && ['search', 'read'].includes(action)) ? ['fixture'] : []), 'q'];
      let count = 0;
      assert.equal(await runCodex([tool.name], {
        interactive: true, platform: 'win32', log() {}, ask: async () => answers.shift(),
        run: (selected, args) => { count++; assert.equal(selected, tool); assert.equal(args[0], action); return 0; },
      }), 0);
      assert.equal(count, 1);
      assert.equal(answers.length, 0);
    }
  }
});

test('EOF exits without execution and child interruption never retries', async () => {
  for (const args of [[], ['git-acl']]) {
    assert.equal(await runCodex(args, { interactive: true, platform: 'win32', log() {}, ask: async () => null, run: () => assert.fail() }), 0);
  }
  let calls = 0;
  assert.equal(await runCodex(['log-policy'], {
    interactive: true, log() {}, ask: async () => 'status', run: () => { calls++; return 130; },
  }), 130);
  assert.equal(calls, 1);
});

test('children inherit the terminal, bypass the shell, and preserve argument boundaries', () => {
  for (const tool of CODEX_TOOLS) {
    assert.equal(runTool(tool, ['status', 'space & 日本語'], {
      platform: 'win32', spawn: (command, args, options) => {
        const ps = tool.file.endsWith('.ps1');
        assert.equal(command, ps ? 'pwsh' : process.execPath);
        if (ps) assert.deepEqual(args.slice(0, 3), ['-NoLogo', '-NoProfile', '-File']);
        assert.ok(args.at(-3).endsWith(tool.file));
        assert.deepEqual(args.slice(-2), ['status', 'space & 日本語']);
        assert.deepEqual(options, { stdio: 'inherit', shell: false });
        return { status: 5 };
      },
    }), 5);
  }
});

test('platform refusals, missing runtimes, and signals fail safely', () => {
  const output = [];
  const git = CODEX_TOOLS[0];
  for (const platform of ['linux', 'darwin']) {
    assert.equal(runTool(git, ['repair', 'fixture'], { platform, log() {}, spawn: () => assert.fail() }), 1);
  }
  assert.equal(runTool(git, ['help'], { platform: 'win32', log: line => output.push(line),
    spawn: () => ({ error: { code: 'ENOENT', message: 'PRIVATE PATH' } }),
  }), 1);
  assert.doesNotMatch(output.join('\n'), /PRIVATE PATH/);
  assert.match(output.join('\n'), /PowerShell 7/);
  for (const [signal, status] of [['SIGINT', 130], ['SIGTERM', 1]]) {
    assert.equal(runTool(git, ['help'], { platform: 'win32', log() {}, spawn: () => ({ signal }) }), status);
  }
});

test('agent dispatch requires no development config and matches standalone script help', () => {
  const env = { ...process.env, AGENT_DEV_CONFIG: resolve('does-not-exist/config.json') };
  const common = { encoding: 'utf8', env, timeout: 15000 };
  for (const args of [['codex'], ['codex', '--help'], ['codex', 'log-policy']]) {
    const result = spawnSync(process.execPath, [agent, ...args], common);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Codex diagnostics/);
  }
  for (const tool of CODEX_TOOLS) {
    const ps = tool.file.endsWith('.ps1');
    if (ps && process.platform !== 'win32') continue;
    const script = fileURLToPath(new URL(tool.file, import.meta.url));
    const direct = spawnSync(ps ? 'pwsh' : process.execPath, [...(ps ? ['-NoLogo', '-NoProfile', '-File'] : []), script, 'help'], common);
    const routed = spawnSync(process.execPath, [agent, 'codex', tool.name, '--help'], common);
    assert.equal(direct.status, 0, direct.stdout + direct.stderr);
    assert.equal(routed.status, 0, routed.stdout + routed.stderr);
    if (process.platform === 'win32' || !tool.windowsOnly) assert.equal(routed.stdout, direct.stdout);
    else assert.match(routed.stdout, /only on Windows/);
    assert.doesNotMatch(routed.stdout, /\.agents\/scripts\/codex/);
  }
});

test('normal help and root menu list only tools for the current OS', async () => {
  for (const platform of ['win32', 'darwin', 'linux']) {
    for (const args of [[], ['--help']]) {
      const output = [];
      assert.equal(await runCodex(args, { platform, interactive: false, log: line => output.push(line) }), 0);
      const text = output.join('\n');
      assert.match(text, /agent codex log-policy status/);
      for (const name of ['git-acl', 'disk-pressure', 'skill-validator-utf8']) {
        assert.equal(text.includes(`agent codex ${name} status`), platform === 'win32');
      }
      if (platform !== 'win32') assert.match(text, /Not yet validated on macOS\/Linux/);
    }
    const output = [];
    assert.equal(await runCodex([], {
      platform, interactive: true, log: line => output.push(line), ask: async () => 'q', run: () => assert.fail(),
    }), 0);
    const text = output.join('\n');
    if (platform !== 'win32') assert.match(text, /Not yet validated on macOS\/Linux/);
    assert.equal(text.includes('Git write permissions'), platform === 'win32');
    assert.equal(text.includes('Disk-pressure recovery'), platform === 'win32');
    assert.equal(text.includes('Skill validator UTF-8 patch'), platform === 'win32');
    assert.match(text, platform === 'win32' ? /4\/l\. Diagnostic log policy/ : /1\/l\. Diagnostic log policy/);
  }
});

test('filtered menu numbers and keys cannot select hidden tools', async () => {
  for (const platform of ['darwin', 'linux']) {
    for (const selection of ['1', 'l', 'log-policy']) {
      const answers = ['g', '4', 'skill-validator-utf8', selection, 'status', 'b', 'q'];
      let calls = 0;
      assert.equal(await runCodex([], {
        platform, interactive: true, log() {},
        ask: async () => { assert.ok(answers.length); return answers.shift(); },
        run: (tool, args) => { calls++; assert.equal(tool.name, 'log-policy'); assert.deepEqual(args, ['status']); return 0; },
      }), 0);
      assert.equal(calls, 1);
      assert.equal(answers.length, 0);
    }
  }
});

test('unsupported explicit tools stop before prompting or spawning; help needs no runtime', async () => {
  for (const platform of ['darwin', 'linux']) {
    for (const tool of CODEX_TOOLS.filter(tool => tool.windowsOnly)) {
      for (const interactive of [false, true]) {
        for (const args of [[], ...tool.actions.map(([action]) => [action])]) {
          const output = [];
          assert.equal(await runCodex([tool.name, ...args], {
            platform, interactive, log: line => output.push(line), ask: () => assert.fail(), run: () => assert.fail(),
          }), 1);
          assert.match(output.join('\n'), /Windows tool.*No operation was started/);
        }
      }
      for (const help of ['help', '--help', '-h']) {
        const output = [];
        assert.equal(await runCodex([tool.name, help], {
          platform, log: line => output.push(line), ask: () => assert.fail(), run: () => assert.fail(),
        }), 0);
        assert.match(output.join('\n'), /only on Windows/);
        assert.equal(runTool(tool, [help], { platform, log() {}, spawn: () => assert.fail() }), 0);
      }
      assert.equal(await runCodex([tool.name, 'help', 'extra'], { platform, log() {}, run: () => assert.fail() }), 2);
    }
  }
});

test('UTF-8 tool is hidden by default on Unix but explicit access remains available', async () => {
  const tool = CODEX_TOOLS.find(tool => tool.name === 'skill-validator-utf8');
  for (const platform of ['win32', 'darwin', 'linux']) {
    for (const action of [...tool.actions.map(([action]) => action), 'help']) {
      let calls = 0;
      assert.equal(await runCodex([tool.name, action], {
        platform, run: (selected, args) => { calls++; assert.equal(selected, tool); assert.deepEqual(args, [action]); return 7; },
      }), 7);
      assert.equal(calls, 1);
      assert.equal(runTool(tool, [action], {
        platform, spawn: () => ({ status: 7 }), log() {},
      }), 7);
    }
    const output = [];
    assert.equal(await runCodex([tool.name], { platform, interactive: false, log: line => output.push(line) }), 0);
    assert.match(output.join('\n'), /Usually unnecessary when Python already reads UTF-8/);
    const answers = ['status', 'b', 'q'];
    let calls = 0;
    assert.equal(await runCodex([tool.name], {
      platform, interactive: true, log() {},
      ask: async () => { assert.ok(answers.length); return answers.shift(); },
      run: (selected, args) => { calls++; assert.equal(selected, tool); assert.deepEqual(args, ['status']); return 0; },
    }), 0);
    assert.equal(calls, 1);
    assert.equal(answers.length, 0);
  }
});
