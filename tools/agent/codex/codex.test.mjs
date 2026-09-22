import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CODEX_TOOLS, runCodex, runTool } from './codex.mjs';
import { applyToCodexTarget, evaluate, launchCodex, parseOptions, waitForCodexRenderer } from './manage-codex-scrollbar.mjs';

const agent = fileURLToPath(new URL('../agent.mjs', import.meta.url));

test('normal scrollbar launch never requests debugging; failures do not retry', async () => {
  for (const debug of [undefined, true]) {
    let detached = false;
    await launchCodex('fixture.exe', { debug, port: 9333, spawnProcess: (exe, args, options) => {
      assert.equal(exe, 'fixture.exe');
      assert.equal(options.windowsHide, false);
      assert.equal(options.stdio, 'ignore');
      assert.equal(options.detached, true);
      if (debug) {
        assert.deepEqual(args, ['--remote-debugging-address=127.0.0.1', '--remote-debugging-port=9333']);
      } else {
        assert.deepEqual(args, ['--enable-blink-features=PreferDefaultScrollbarStyles', '--blink-settings=prefersDefaultScrollbarStyles=true']);
        assert.ok(args.every(arg => !arg.includes('remote-debugging')));
      }
      const child = new EventEmitter();
      child.unref = () => { detached = true; };
      queueMicrotask(() => child.emit('spawn'));
      return child;
    } });
    assert.equal(detached, true);
  }
  let attempts = 0;
  await assert.rejects(launchCodex('fixture.exe', { spawnProcess: () => {
    attempts++;
    const child = new EventEmitter();
    queueMicrotask(() => child.emit('error', new Error('fixture launch failure')));
    return child;
  } }), /Could not start Codex/);
  assert.equal(attempts, 1);
});

test('scrollbar startup applies once per target and shares one deadline across retries', async () => {
  const options = { action: 'debug-launch', width: 24, port: 9222 };
  const targets = [{ webSocketDebuggerUrl: 'fixture' }];
  let time = 0;
  let calls = 0;
  const output = [];
  await waitForCodexRenderer(options, {
    now: () => time,
    get: async () => targets,
    sleep: async ms => { time += ms; },
    apply: (items, settings, timing) => applyToCodexTarget(items, settings, {
      ...timing, log: text => output.push(text),
      run: async () => {
        calls += 1;
        return { success: calls === 2, sidebar: true, width: 24 };
      },
    }),
  });
  assert.equal(calls, 2);
  assert.equal(time, 150);
  assert.equal(output.length, 1);

  time = 0;
  const budgets = [];
  await assert.rejects(waitForCodexRenderer(options, {
    now: () => time,
    get: async (_port, waitMs) => {
      assert.ok(waitMs > 0 && waitMs <= 2000);
      time += waitMs;
      return [...targets, ...targets, ...targets];
    },
    sleep: async ms => { time += ms; },
    apply: (items, settings, timing) => applyToCodexTarget(items, settings, {
      ...timing,
      run: async (_url, _expression, waitMs) => {
        budgets.push(waitMs);
        time += waitMs;
        throw new Error('Simulated unresponsive renderer');
      },
    }),
  }), /before the timeout/);
  assert.equal(time, 45000);
  assert.ok(budgets.at(-1) < 10000);

  time = 0;
  let attempts = 0;
  await waitForCodexRenderer(options, {
    now: () => time,
    get: async () => ++attempts === 1 ? [] : targets,
    sleep: async ms => { time += ms; },
    apply: async items => {
      assert.deepEqual(items, targets, 'Empty discovery must not build or apply a style');
      return true;
    },
  });
  assert.equal(attempts, 2);
});

test('scrollbar evaluation closes connecting sockets on timeout and open sockets on completion', async t => {
  let socket;
  class FakeSocket extends EventTarget {
    static CONNECTING = 0;
    static OPEN = 1;
    readyState = FakeSocket.CONNECTING;
    closed = 0;
    constructor() { super(); socket = this; }
    close() { this.closed += 1; this.readyState = 3; }
    send() {
      this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ id: 1, result: { result: { value: { success: true } } } }) }));
    }
  }
  const original = globalThis.WebSocket;
  t.after(() => { globalThis.WebSocket = original; });
  globalThis.WebSocket = FakeSocket;
  await assert.rejects(evaluate('fixture', 'expression', 10), /timed out/);
  assert.equal(socket.closed, 1);
  const result = evaluate('fixture', 'expression');
  socket.readyState = FakeSocket.OPEN;
  socket.dispatchEvent(new Event('open'));
  assert.deepEqual(await result, { success: true });
  assert.equal(socket.closed, 1);
});

test('scrollbar options are validated per action before execution', () => {
  assert.deepEqual(parseOptions(['launch']), { action: 'launch' });
  assert.deepEqual(parseOptions(['profile']), { action: 'profile' });
  assert.deepEqual(parseOptions(['--action', 'launch']), { action: 'launch' });
  assert.deepEqual(parseOptions(['debug-launch']), { action: 'debug-launch', width: 24, port: 9222 });
  assert.deepEqual(parseOptions(['apply', '--width', '20', '--port', '9333']), { action: 'apply', width: 20, port: 9333 });
  assert.deepEqual(parseOptions(['remove']), { action: 'remove', port: 9222 });
  for (const args of [
    ['launch', '--width', '24'], ['launch', '--port', '9222'], ['debug-launch', '--width', '33'],
    ['apply', '--port', '0'], ['remove', '--width', '24'], ['profile', '--width', '24'],
    ['launch', '--action', 'remove'], ['--width', '24'], ['launch', '--help', 'extra'],
    ['apply', '--width'], ['apply', '--width', '20', '--width', '24'],
    ['apply', '--port', 'NaN'], ['apply', '--width', '12.5'],
  ]) {
    assert.throws(() => parseOptions(args), Error, args.join(' '));
  }
});

test('scrollbar help, profile instructions and CLI argument errors do not contact the app', () => {
  const script = fileURLToPath(new URL('manage-codex-scrollbar.mjs', import.meta.url));
  const run = args => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', timeout: 5000 });
  for (const args of [[], ['help'], ['--help'], ['launch', '--help'], ['debug-launch', '--help']]) {
    const result = run(args);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /default: 24 CSS pixels/);
    assert.match(result.stdout, /no debugging/);
  }
  for (const args of [['launch', '--width', '24'], ['launch', '--port', '9222']]) {
    const result = run(args);
    assert.equal(result.status, 1, result.stdout);
    assert.doesNotMatch(result.stderr, /endpoint|already running|package/);
  }
});

test('app is canonical and scrollbar remains an alias', async () => {
  for (const name of ['app', 'scrollbar']) {
    assert.equal(await runCodex([name, 'launch'], { platform: 'win32', run: (tool, args) => {
      assert.equal(tool.name, 'app');
      assert.deepEqual(args, ['launch']);
      return 0;
    } }), 0);
  }
});

test('profile registration previews, backs up, preserves content and refuses conflicts', { skip: process.platform !== 'win32' }, t => {
  const root = fs.mkdtempSync(join(tmpdir(), 'codexapp-profile-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const script = fileURLToPath(new URL('register-codex-app-profile.ps1', import.meta.url));
  const profile = join(root, 'space 日本語', 'profile.ps1');
  fs.writeFileSync(join(root, 'agent.cmd'), '@echo off\n');
  const env = { ...process.env, PATH: root + ';' + process.env.PATH };
  const run = (...args) => spawnSync('pwsh', ['-NoLogo', '-NoProfile', '-File', script, '-ProfilePath', profile, ...args], { env, encoding: 'utf8', timeout: 10000 });
  let result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Preview only/);
  assert.equal(fs.existsSync(profile), false);
  result = run('-Register', '-WhatIf');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(profile), false);
  fs.mkdirSync(join(root, 'space 日本語'));
  const original = Buffer.from('# unrelated\r\n$fixture = 1\r\n');
  fs.writeFileSync(profile, original);
  result = run('-Register');
  assert.equal(result.status, 0, result.stderr);
  const installed = fs.readFileSync(profile);
  assert.deepEqual(installed.subarray(0, original.length), original);
  const backup = fs.readdirSync(join(root, 'space 日本語')).find(x => x.endsWith('.bak'));
  assert.deepEqual(fs.readFileSync(join(root, 'space 日本語', backup)), original);
  result = run('-Register');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /already present/);
  assert.deepEqual(fs.readFileSync(profile), installed);
  const command = `. '${profile.replaceAll("'", "''")}'\nfunction agent.cmd { ConvertTo-Json -InputObject ([string[]]$args) -Compress }\ncodexapp 'space value' --help`;
  result = spawnSync('pwsh', ['-NoProfile', '-Command', command], { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), ['codex', 'app', 'launch', 'space value', '--help']);
  result = spawnSync('pwsh', ['-NoProfile', '-Command', `function codexapp { 'existing' }; . '${profile.replaceAll("'", "''")}'; codexapp`], { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.stdout.trim(), 'existing');
  for (const content of ['function codexapp { "existing" }', '# >>> ai-dotfiles codexapp >>>', 'function broken {']) {
    fs.writeFileSync(profile, content);
    result = run('-Register');
    assert.equal(result.status, 1);
    assert.doesNotMatch(result.stderr, /At .*line:|register-codex-app-profile\.ps1/);
    assert.ok(!result.stderr.includes(root));
    assert.equal(fs.readFileSync(profile, 'utf8'), content);
  }
  const invalidUtf8 = Buffer.from([0xff, 0xfe, 0x00]);
  fs.writeFileSync(profile, invalidUtf8);
  result = run('-Register');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /check file access and UTF-8 encoding/);
  assert.ok(!result.stderr.includes(root));
  assert.deepEqual(fs.readFileSync(profile), invalidUtf8);
  fs.unlinkSync(profile);
  result = run('-Register');
  assert.equal(result.status, 0, result.stderr);
  assert.match(fs.readFileSync(profile, 'utf8'), /function global:codexapp/);
});

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

test('permission is canonical; permissions aliases commands, help, and the menu', async () => {
  const tool = CODEX_TOOLS.find(entry => entry.name === 'permission');
  for (const name of ['permission', 'permissions']) {
    for (const args of [['status', '--thread', 'fixture'], ['--help']]) {
      assert.equal(await runCodex([name, ...args], {
        run(selected, forwarded) {
          assert.equal(selected, tool);
          assert.deepEqual(forwarded, args[0] === '--help' ? ['help'] : args);
          return 3;
        },
      }), 3);
    }
    const answers = [name, 'status', 'q'];
    assert.equal(await runCodex([], {
      interactive: true, log() {}, ask: async () => answers.shift(),
      run(selected, args) { assert.equal(selected, tool); assert.deepEqual(args, ['status']); return 0; },
    }), 0);
    const output = [];
    await runCodex([name], { interactive: false, log: s => output.push(s) });
    assert.match(output.join('\n'), /agent codex permission status/);
    assert.match(output.join('\n'), /Aliases: permissions/);
    assert.doesNotMatch(output.join('\n'), /agent codex permissions status/);
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
      for (const name of ['git-acl', 'disk-pressure', 'marketplace-staging', 'skill-validator-utf8']) {
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
    assert.equal(text.includes('Marketplace temporary files'), platform === 'win32');
    assert.match(text, platform === 'win32' ? /5\/l\. Diagnostic log policy/ : /1\/l\. Diagnostic log policy/);
  }
});

test('filtered menu numbers and keys cannot select hidden tools', async () => {
  for (const platform of ['darwin', 'linux']) {
    for (const selection of ['1', 'l', 'log-policy']) {
      const answers = ['g', '99', 'skill-validator-utf8', selection, 'status', 'b', 'q'];
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
