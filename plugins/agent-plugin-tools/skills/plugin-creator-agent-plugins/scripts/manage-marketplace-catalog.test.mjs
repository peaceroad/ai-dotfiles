import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runCatalog, parseCatalogJson, repositoryUrl, CatalogError } from "./manage-marketplace-catalog.mjs";

const sha = "a".repeat(40);
async function fixture(t, format = "codex") {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "catalog-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, format === "codex" ? ".agents/plugins/marketplace.json" : ".claude-plugin/marketplace.json");
  const run = (action, options = {}, deps) => runCatalog({ action, root, format, yes: true, ...options }, deps);
  const read = async () => JSON.parse(await fs.readFile(file, "utf8"));
  const write = async (document) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, typeof document === "string" ? document : JSON.stringify(document)); };
  return { root, file, run, read, write };
}
test("new Codex metadata follows authoring defaults without rewriting existing policy", async (t) => {
  const f = await fixture(t); await f.run("init", { name: "example" });
  const options = { name: "tool", repo: "example-org/tool", ref: "main" };
  const preview = await f.run("add", { ...options, dryRun: true });
  assert.deepEqual(preview.changes.after.policy, { installation: "AVAILABLE", authentication: "ON_INSTALL" });
  assert.equal(preview.changes.after.category, "Productivity");
  await f.run("add", options);
  assert.equal((await f.run("add", options)).status, "unchanged");
  const before = await f.read();
  before.plugins[0].policy = { installation: "NOT_AVAILABLE", authentication: "ON_USE", extra: { keep: true } };
  await f.write(before);
  await f.run("update", { name: "tool", category: "Developer tools" });
  const after = await f.read();
  assert.deepEqual(after.plugins[0].policy, before.plugins[0].policy);
  assert.equal(after.plugins[0].category, "Developer tools");
  const claude = await fixture(t, "claude"); await claude.run("init", { name: "example", owner: "Example Team" });
  await assert.rejects(claude.run("add", { ...options, category: "Productivity" }), /Codex catalogs only/);
  await claude.run("add", options);
  assert.equal(Object.hasOwn((await claude.read()).plugins[0], "policy"), false);
});
test("CLI accepts trailing help, value equals syntax and dash-leading identifiers", async (t) => {
  const f = await fixture(t);
  const cli = (...args) => spawnSync(process.execPath, [fileURLToPath(new URL("./manage-marketplace-catalog.mjs", import.meta.url)), ...args], { encoding: "utf8" });
  const help = cli("add", f.root, "tool", "--help");
  assert.equal(help.status, 0, help.stderr); assert.match(help.stdout, /Usage:/);
  assert.deepEqual(await fs.readdir(f.root), []);
  const init = cli("init", f.root, "--format=codex", "--name=--example", "--yes");
  assert.equal(init.status, 0, init.stderr);
  const add = cli("add", "--format=codex", "--repo=example-org/tool", "--ref=main", "--category=Developer tools", "--yes", "--", f.root, "--help");
  assert.equal(add.status, 0, add.stderr);
  assert.equal((await f.read()).plugins[0].name, "--help");
  assert.equal((await f.read()).plugins[0].category, "Developer tools");
  const before = await fs.readFile(f.file);
  const bad = cli("remove", f.root, "--format=codex", "--yes=false", "--", "--help");
  assert.notEqual(bad.status, 0); assert.deepEqual(await fs.readFile(f.file), before);
  const remove = cli("remove", "--format=codex", "--yes", "--", f.root, "--help");
  assert.equal(remove.status, 0, remove.stderr); assert.deepEqual((await f.read()).plugins, []);
});
test("API confirmation flags and format are strictly typed", async (t) => {
  const f = await fixture(t);
  for (const flag of ["yes", "dryRun"]) {
    for (const value of ["false", 1, null, [], {}]) {
      await assert.rejects(f.run("init", { name: "example", [flag]: value }), /must be a boolean/);
      assert.deepEqual(await fs.readdir(f.root), []);
    }
  }
  await assert.rejects(f.run("init", { name: "example", format: ["codex"] }), /Specify --format/);
  assert.deepEqual(await fs.readdir(f.root), []);
});
test("confirmation requires true and inherited yes does not authorize a write", async (t) => {
  const f = await fixture(t);
  for (const answer of ["false", "yes", 1, [], {}, null, undefined]) {
    const result = await f.run("init", { name: "example", yes: false }, { confirm: async () => answer });
    assert.equal(result.status, "cancelled");
    assert.deepEqual(await fs.readdir(f.root), []);
  }
  const inherited = Object.assign(Object.create({ yes: true }), { action: "init", root: f.root, format: "codex", name: "example" });
  await assert.rejects(runCatalog(inherited), /Confirmation required/);
  assert.deepEqual(await fs.readdir(f.root), []);
});
test("confirmation cannot change the selected format or bypass its held lock", async (t) => {
  const f = await fixture(t); await f.run("init", { name: "example" });
  await f.run("add", { name: "tool", repo: "example-org/tool", ref: "main" });
  const before = await fs.readFile(f.file);
  const lock = path.join(f.root, ".marketplace-catalog-codex.lock");
  await fs.writeFile(lock, "other operation");
  const options = { action: "update", root: f.root, format: "codex", name: "tool", ref: "next", yes: false };
  await assert.rejects(runCatalog(options, { confirm: async () => { options.format = "claude"; return true; } }), /Catalog lock exists/);
  assert.deepEqual(await fs.readFile(f.file), before);
  assert.equal(await fs.readFile(lock, "utf8"), "other operation");
  await assert.rejects(fs.access(path.join(f.root, ".marketplace-catalog-claude.lock")));
});
for (const format of ["codex", "claude"]) test(`${format}: native init, add, update, remove and no dual write`, async (t) => {
  const f = await fixture(t, format);
  await f.run("init", { name: "example-market", ...(format === "claude" ? { owner: "Example Owner" } : {}) });
  const initial = await f.read();
  assert.deepEqual(initial, format === "claude" ? { name: "example-market", owner: { name: "Example Owner" }, plugins: [] } : { name: "example-market", interface: { displayName: "example-market" }, plugins: [] });
  await f.run("add", { name: "example-tool", repo: "example-org/example-plugin", ref: "main", subdir: "plugins/example-tool" });
  let source = (await f.read()).plugins[0].source;
  assert.deepEqual(source, { source: "git-subdir", url: "https://github.com/example-org/example-plugin.git", path: format === "codex" ? "./plugins/example-tool" : "plugins/example-tool", ref: "main" });
  await f.run("update", { name: "example-tool", sha });
  source = (await f.read()).plugins[0].source;
  assert.equal(source.sha, sha); assert.equal(Object.hasOwn(source, "ref"), false);
  await f.run("update", { name: "example-tool", subdir: ".", ref: "release/v2" });
  source = (await f.read()).plugins[0].source;
  assert.deepEqual(source, { source: "url", url: "https://github.com/example-org/example-plugin.git", ref: "release/v2" });
  assert.equal((await f.run("check")).valid, true);
  assert.equal((await f.run("list")).entries[0].tracking, "branch/tag ref");
  await f.run("remove", { name: "example-tool" });
  assert.deepEqual((await f.read()).plugins, []);
  await assert.rejects(fs.access(path.join(f.root, format === "codex" ? ".claude-plugin/marketplace.json" : ".agents/plugins/marketplace.json")));
});
test("dry-run and unconfirmed operations create no files, directories or locks", async (t) => {
  const f = await fixture(t);
  assert.equal((await f.run("init", { name: "example", yes: false, dryRun: true })).status, "preview");
  assert.deepEqual(await fs.readdir(f.root), []);
  await assert.rejects(f.run("init", { name: "example", yes: false }), /Confirmation required/);
  assert.deepEqual(await fs.readdir(f.root), []);
  assert.equal((await f.run("init", { name: "example", yes: false }, { confirm: async () => false })).status, "cancelled");
  assert.deepEqual(await fs.readdir(f.root), []);
});
test("preserve unknown metadata, ordering, unrelated entries; no-op retains bytes and mtime", async (t) => {
  const f = await fixture(t);
  const document = { name: "example", custom: { keep: 1 }, plugins: [
    { name: "first", pluginId: "plugin_example", source: { source: "url", url: "https://github.com/example-org/first.git", ref: "main", extension: { keep: true } }, unknown: [1, 2] },
    { name: "other", source: { source: "command", command: "DO NOT EXECUTE" }, custom: "keep" },
  ] };
  await f.write(document);
  await f.run("update", { name: "first", sha });
  const expected = structuredClone(document); delete expected.plugins[0].source.ref; expected.plugins[0].source.sha = sha;
  assert.deepEqual(await f.read(), expected);
  const before = await fs.readFile(f.file), stat = await fs.stat(f.file);
  assert.equal((await f.run("update", { name: "first", sha })).status, "unchanged");
  assert.deepEqual(await fs.readFile(f.file), before); assert.equal((await fs.stat(f.file)).mtimeMs, stat.mtimeMs);
  await assert.rejects(f.run("update", { name: "first", subdir: "plugins/first" }), /unknown fields/);
  await assert.rejects(f.run("update", { name: "other", description: "Not supported" }), /unsupported/);
  assert.equal((await f.run("check")).valid, false);
});
test("identical add is no-op; differing add conflicts; missing selected entry fails", async (t) => {
  const f = await fixture(t); await f.run("init", { name: "example" });
  const entry = { name: "example-tool", repo: "example-org/example-tool", ref: "main" };
  await f.run("add", entry); const before = await fs.readFile(f.file), stat = await fs.stat(f.file);
  assert.equal((await f.run("add", entry)).status, "unchanged");
  assert.deepEqual(await fs.readFile(f.file), before); assert.equal((await fs.stat(f.file)).mtimeMs, stat.mtimeMs);
  await assert.rejects(f.run("add", { ...entry, ref: "next" }), /different content/);
  await assert.rejects(f.run("update", { name: "missing", ref: "main" }), /not listed/);
  await assert.rejects(f.run("init", { name: "example" }), /already exists/);
});
test("ambiguous existing selectors preserve on description edit, explicit selector resolves", async (t) => {
  const f = await fixture(t);
  await f.write({ name: "example", plugins: [{ name: "example-tool", source: { source: "url", url: "https://github.com/example-org/tool.git", ref: "main", sha } }] });
  assert.equal((await f.run("check")).valid, false);
  await f.run("update", { name: "example-tool", description: "New description" });
  assert.equal((await f.read()).plugins[0].source.sha, sha);
  await assert.rejects(f.run("update", { name: "example-tool", repo: "example-org/new" }), /ambiguous/);
  const resolved = await f.run("update", { name: "example-tool", ref: "next" });
  assert.deepEqual(resolved.warnings, []);
  assert.equal(resolved.entries[0].status, "supported");
  assert.equal(Object.hasOwn((await f.read()).plugins[0].source, "sha"), false);
});
test("JSON duplicate decoded keys, malformed input and numeric rounding are refused", () => {
  for (const raw of ['{"x":1,"x":2}', '{"x":1,"\\u0078":2}', '{"a":{"b":1,"b":2}}', '{', '{"n":9007199254740993}', '{"n":0.10000000000000001}', '{"n":1e999}', '{"n":1e-999}', '{"n":-0}']) assert.throws(() => parseCatalogJson(Buffer.from(raw)), CatalogError);
  assert.deepEqual(parseCatalogJson(Buffer.from('{"n":1.25,"a":[null,true,false,"escaped \\\" key",1e3]}')), { n: 1.25, a: [null, true, false, 'escaped " key', 1000] });
  assert.throws(() => parseCatalogJson(Buffer.from([0xff])), /UTF-8/);
});
test("repository, ref and path injection are rejected without leaking values", async (t) => {
  const f = await fixture(t); await f.run("init", { name: "example" });
  const base = { name: "example-tool", repo: "example-org/tool", ref: "main" };
  for (const repo of ["https://SECRET@github.com/example-org/tool", "https://github.com:443/example-org/tool", "https://github.com/example-org/tool?SECRET", "https://github.com/example-org/tool#SECRET", "https://github.com/example-org/tool/tree/main", "https://elsewhere.invalid/example-org/tool", "git@github.com:example-org/tool", "example-org/../SECRET", "example-org/tool\nSECRET"]) {
    await assert.rejects(f.run("add", { ...base, repo }), (error) => error instanceof CatalogError && !error.message.includes("SECRET"));
  }
  for (const subdir of ["../SECRET", "/SECRET", "C:/SECRET", "\\\\server\\SECRET", "a\\SECRET", "a/../SECRET", "a//SECRET", "a/%2e%2e/SECRET"]) await assert.rejects(f.run("add", { ...base, subdir }), /subdirectory/);
  for (const ref of ["-option", "a..b", "a@{b", "a.lock", "a b", "a\nb", sha]) await assert.rejects(f.run("add", { ...base, ref }), CatalogError);
  await assert.rejects(f.run("add", { ...base, sha }), /exactly one/);
  await assert.rejects(f.run("add", { name: "example-tool", repo: base.repo, sha: "A".repeat(40) }), /lowercase/);
  assert.equal(repositoryUrl("https://github.com/example-org/tool"), "https://github.com/example-org/tool.git");
});
test("managed and legacy roots refuse all writes, including dry-run", async (t) => {
  for (const marker of ["marketplace-development", "plugin-marketplace-development"]) {
    const f = await fixture(t); await fs.mkdir(path.join(f.root, ".agents", marker), { recursive: true });
    await assert.rejects(f.run("init", { name: "example", dryRun: true }), /managed root/);
    assert.deepEqual(await fs.readdir(path.join(f.root, ".agents")), [marker]);
  }
});
test("symlink descendants and selected root redirects are refused", async (t) => {
  const f = await fixture(t), outside = await fixture(t);
  await fs.symlink(outside.root, path.join(f.root, ".agents"), "dir");
  await assert.rejects(f.run("init", { name: "example" }), /Symlink/);
  assert.deepEqual(await fs.readdir(outside.root), []);
  await assert.rejects(runCatalog({ action: "init", root: path.join(f.root, ".agents"), format: "claude", name: "example", owner: "Example", yes: true }), /Symlink/);
});
test("confirmation precedes lock; concurrent change/deletion/creation cannot be overwritten", async (t) => {
  for (const mode of ["change", "delete", "create"]) {
    const f = await fixture(t); if (mode !== "create") await f.run("init", { name: "example" });
    await assert.rejects(f.run(mode === "create" ? "init" : "add", { name: mode === "create" ? "example" : "tool", ...(mode === "create" ? {} : { repo: "example-org/tool", ref: "main" }), yes: false }, { confirm: async () => {
      await assert.rejects(fs.access(path.join(f.root, ".marketplace-catalog-codex.lock")));
      if (mode === "delete") await fs.unlink(f.file); else await f.write({ name: "concurrent", plugins: [] });
      return true;
    } }), /changed during confirmation/);
    if (mode !== "delete") assert.equal((await f.read()).name, "concurrent");
    await assert.rejects(fs.access(path.join(f.root, ".marketplace-catalog-codex.lock")));
  }
});
test("held locks are never stolen; concurrent cooperative writer is rejected", async (t) => {
  const f = await fixture(t); const lock = path.join(f.root, ".marketplace-catalog-codex.lock");
  await fs.writeFile(lock, "other owner");
  await assert.rejects(f.run("init", { name: "example" }), /lock exists/);
  assert.equal(await fs.readFile(lock, "utf8"), "other owner");
  await fs.unlink(lock);
  let release, entered; const enteredPromise = new Promise((resolve) => { entered = resolve; }); const gate = new Promise((resolve) => { release = resolve; });
  const first = f.run("init", { name: "first" }, { io: { ...fs, mkdir: async (...args) => { entered(); await gate; return fs.mkdir(...args); } } });
  await enteredPromise;
  await assert.rejects(f.run("init", { name: "second" }), /lock exists/);
  release(); await first; assert.equal((await f.read()).name, "first");
});
test("write/replace failure preserves original; post-save cleanup failure reports committed", async (t) => {
  const f = await fixture(t); await f.run("init", { name: "example" }); const before = await fs.readFile(f.file);
  const add = { name: "tool", repo: "example-org/tool", ref: "main" };
  await assert.rejects(f.run("add", add, { io: { ...fs, rename: async () => { throw new Error("SECRET"); } } }), (error) => !error.committed && !error.message.includes("SECRET"));
  assert.deepEqual(await fs.readFile(f.file), before);
  assert.deepEqual(await fs.readdir(path.dirname(f.file)), ["marketplace.json"]);
  await assert.rejects(f.run("add", add, { io: { ...fs, unlink: async (target) => { if (target.endsWith(".lock")) throw new Error("SECRET"); return fs.unlink(target); } } }), (error) => error.committed && /saved, but cleanup failed/.test(error.message) && !error.message.includes("SECRET"));
  assert.equal((await f.read()).plugins[0].name, "tool");
});
test("temporary exclusive-open collision is not deleted and original remains", async (t) => {
  const f = await fixture(t); await f.run("init", { name: "example" }); const before = await fs.readFile(f.file); let collision;
  await assert.rejects(f.run("add", { name: "tool", repo: "example-org/tool", ref: "main" }, { io: { ...fs, open: async (target, ...args) => {
    if (target.endsWith(".tmp")) { collision = target; await fs.writeFile(target, "someone else"); }
    return fs.open(target, ...args);
  } } }), CatalogError);
  assert.deepEqual(await fs.readFile(f.file), before);
  assert.equal(await fs.readFile(collision, "utf8"), "someone else");
});
test("invalid native structure and irrelevant options fail without writes", async (t) => {
  const f = await fixture(t);
  for (const document of [{ name: "example", plugins: [{ name: "same", source: "./a" }, { name: "same", source: "./b" }] }, { name: "example", plugins: [{}] }, { name: "example", plugins: {} }]) {
    await f.write(document); const before = await fs.readFile(f.file);
    await assert.rejects(f.run("check"), CatalogError); assert.deepEqual(await fs.readFile(f.file), before);
  }
  await assert.rejects(f.run("list", { repo: "example-org/tool" }), /not supported/);
  await assert.rejects(f.run("check", { format: "guess" }), /Specify --format/);
  const claude = await fixture(t, "claude");
  await assert.rejects(claude.run("init", { name: "example" }), /requires --owner/);
  await claude.write({ name: "example", plugins: [] });
  await assert.rejects(claude.run("check"), /owner.name/);
});
test("staged write failure leaves original intact and removes owned staging/lock", async (t) => {
  const f = await fixture(t); await f.run("init", { name: "example" }); const before = await fs.readFile(f.file);
  await assert.rejects(f.run("add", { name: "tool", repo: "example-org/tool", ref: "main" }, { io: { ...fs, open: async (target, ...args) => {
    const handle = await fs.open(target, ...args);
    if (!target.endsWith(".tmp")) return handle;
    return { stat: () => handle.stat(), chmod: (mode) => handle.chmod(mode), close: () => handle.close(), writeFile: async () => { throw new Error("SECRET"); }, sync: () => handle.sync() };
  } } }), (error) => !error.committed && !error.message.includes("SECRET"));
  assert.deepEqual(await fs.readFile(f.file), before);
  assert.deepEqual(await fs.readdir(path.dirname(f.file)), ["marketplace.json"]);
  assert.deepEqual(await fs.readdir(f.root), [".agents"]);
});
test("read-back failure after replacement reports committed, not safe-to-repeat", async (t) => {
  const f = await fixture(t); await f.run("init", { name: "example" }); let replaced = false;
  await assert.rejects(f.run("add", { name: "tool", repo: "example-org/tool", ref: "main" }, { io: { ...fs,
    rename: async (...args) => { await fs.rename(...args); replaced = true; },
    readFile: async (...args) => { if (replaced) throw new Error("SECRET"); return fs.readFile(...args); },
  } }), (error) => error.committed && /replaced/.test(error.message) && !error.message.includes("SECRET"));
  assert.equal((await f.read()).plugins[0].name, "tool");
});
test("lock ownership replacement is refused and foreign lock is preserved", async (t) => {
  const f = await fixture(t); await f.run("init", { name: "example" }); const before = await fs.readFile(f.file);
  const lock = path.join(f.root, ".marketplace-catalog-codex.lock"); let changed = false;
  await assert.rejects(f.run("add", { name: "tool", repo: "example-org/tool", ref: "main" }, { io: { ...fs,
    readFile: async (target, ...args) => {
      if (!changed && target.endsWith(".tmp")) { changed = true; await fs.rename(lock, `${lock}.old`); await fs.writeFile(lock, "other owner"); }
      return fs.readFile(target, ...args);
    },
  } }), (error) => !error.committed && /cleanup failed/.test(error.message));
  assert.deepEqual(await fs.readFile(f.file), before);
  assert.equal(await fs.readFile(lock, "utf8"), "other owner");
});
test("standalone helper has no network or subprocess dependency", async () => {
  const source = await fs.readFile(new URL("./manage-marketplace-catalog.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /from\s+["'](?:node:)?(?:child_process|https?|net|tls)["']/);
  assert.doesNotMatch(source, /\b(?:fetch|spawn|spawnSync|execFile|execSync)\s*\(/);
});
test("literal Unicode and space subdirectories are preserved and listed", async (t) => {
  const f = await fixture(t); await f.run("init", { name: "example" });
  await f.run("add", { name: "example-tool", repo: "example-org/tool", ref: "main", subdir: "plugins/日本語 tools" });
  assert.equal((await f.read()).plugins[0].source.path, "./plugins/日本語 tools");
  assert.deepEqual((await f.run("list")).entries[0].reference, { url: "https://github.com/example-org/tool.git", path: "./plugins/日本語 tools", ref: "main" });
});

test("large scalar strings retain escapes while decoded duplicate keys still fail", () => {
  const document = { payload: 'x'.repeat(1024 * 1024) + '"\\\n日本語\ud800', values: Array(2000).fill('scalar') };
  assert.deepEqual(parseCatalogJson(Buffer.from(JSON.stringify(document))), document);
  assert.throws(() => parseCatalogJson(Buffer.from('{"nested":{"key":1,"\\u006bey":2}}')), /duplicate JSON keys/);
});

test("long decimal zero tails normalize without changing precision decisions", () => {
  for (const literal of ['1' + '0'.repeat(1000) + 'e-1000', '1.' + '0'.repeat(1000)]) {
    assert.deepEqual(parseCatalogJson(Buffer.from(`{"n":${literal}}`)), { n: 1 });
  }
  assert.throws(() => parseCatalogJson(Buffer.from('{"n":1.' + '0'.repeat(1000) + '1}')), /cannot be preserved safely/);
});

test("valid but altered staged bytes cannot replace the original catalog", async (t) => {
  const f = await fixture(t); await f.run("init", { name: "example" });
  const before = await fs.readFile(f.file);
  await assert.rejects(f.run("add", { name: "tool", repo: "example-org/tool", ref: "main" }, { io: { ...fs,
    readFile: async (target, ...args) => target.endsWith(".tmp") ? Buffer.from('{"name":"altered","plugins":[]}') : fs.readFile(target, ...args),
  } }), (error) => !error.committed && /Staged catalog changed/.test(error.message));
  assert.deepEqual(await fs.readFile(f.file), before);
  assert.deepEqual(await fs.readdir(path.dirname(f.file)), ["marketplace.json"]);
  assert.deepEqual(await fs.readdir(f.root), [".agents"]);
});

test("opaque or invalid listings can be removed without leaking their payloads", async (t) => {
  for (const source of ['./SECRET-local-path', null, { source: 'url', url: 'https://SECRET@github.com/example-org/tool', ref: 'main' }, { source: 'command', command: 'SECRET-command' }]) {
    const f = await fixture(t);
    const retained = { name: 'retained', source: { source: 'url', url: 'https://github.com/example-org/retained.git', ref: 'main' }, unknown: { keep: true } };
    const document = { name: 'example', metadata: { keep: 1 }, plugins: [{ name: 'obsolete', source, description: 'SECRET-description' }, retained] };
    await f.write(document); const before = await fs.readFile(f.file);
    const preview = await f.run('remove', { name: 'obsolete', dryRun: true });
    assert.equal(preview.changes.before.source, '[not displayed]');
    assert.equal(preview.changes.after, null);
    assert.doesNotMatch(JSON.stringify(preview), /SECRET/);
    assert.deepEqual(await fs.readFile(f.file), before);
    const cancelled = await f.run('remove', { name: 'obsolete', yes: false }, { confirm: async (proposal) => {
      assert.doesNotMatch(JSON.stringify(proposal), /SECRET/); return false;
    } });
    assert.equal(cancelled.status, 'cancelled');
    assert.deepEqual(await fs.readFile(f.file), before);
    const cli = spawnSync(process.execPath, [fileURLToPath(new URL('./manage-marketplace-catalog.mjs', import.meta.url)), 'remove', f.root, 'obsolete', '--format', 'codex', '--dry-run'], { encoding: 'utf8' });
    assert.equal(cli.status, 0, cli.stderr);
    assert.doesNotMatch(cli.stdout + cli.stderr, /SECRET/);
    assert.deepEqual(await fs.readFile(f.file), before);
    await f.run('remove', { name: 'obsolete' });
    assert.deepEqual(await f.read(), { ...document, plugins: [retained] });
  }
});

test("replacement preserves existing ordinary permissions despite restrictive umask", { skip: process.platform === "win32" }, async (t) => {
  const f = await fixture(t); await f.run("init", { name: "example" });
  await fs.chmod(f.file, 0o664);
  const previous = process.umask(0o077);
  try { await f.run("add", { name: "tool", repo: "example-org/tool", ref: "main" }); }
  finally { process.umask(previous); }
  assert.equal((await fs.stat(f.file)).mode & 0o777, 0o664);
});

test("rename rejection reports unknown effects whether replacement occurred or not", async (t) => {
  for (const replace of [false, true]) {
    const f = await fixture(t); await f.run("init", { name: "example" });
    await assert.rejects(f.run("add", { name: "tool", repo: "example-org/tool", ref: "main" }, { io: {
      ...fs, rename: async (...args) => { if (replace) await fs.rename(...args); throw new Error("synthetic uncertain response"); },
    } }), (error) => error.committed === null && error.commitStatus === "unknown" && /outcome is unknown/.test(error.message));
    assert.equal((await f.read()).plugins.length, replace ? 1 : 0);
    assert.deepEqual(await fs.readdir(path.dirname(f.file)), ["marketplace.json"]);
    await assert.rejects(fs.access(path.join(f.root, ".marketplace-catalog-codex.lock")));
  }
});

test("failed initial handle stat preserves unidentified created files and reports inspection needed", async (t) => {
  for (const suffix of [".lock", ".tmp"]) {
    const f = await fixture(t); let created, closed = false;
    await assert.rejects(f.run("init", { name: "example" }, { io: { ...fs, open: async (target, ...args) => {
      const handle = await fs.open(target, ...args);
      if (!target.endsWith(suffix)) return handle;
      created = target;
      return { stat: async () => { throw new Error("synthetic stat failure"); }, close: async () => { closed = true; await handle.close(); } };
    } } }), (error) => error.committed === false && error.commitStatus === "not-written" && /cleanup.*Inspect/.test(error.message));
    assert.equal(closed, true);
    assert.equal((await fs.stat(created)).isFile(), true);
    await assert.rejects(fs.access(f.file));
  }
});

test("permission changes during confirmation are not overwritten with stale mode", { skip: process.platform === "win32" }, async (t) => {
  const f = await fixture(t); await f.run("init", { name: "example" });
  await fs.chmod(f.file, 0o664); const before = await fs.readFile(f.file);
  await assert.rejects(f.run("add", { name: "tool", repo: "example-org/tool", ref: "main", yes: false }, {
    confirm: async () => { await fs.chmod(f.file, 0o600); return true; },
  }), /changed during confirmation/);
  assert.equal((await fs.stat(f.file)).mode & 0o777, 0o600);
  assert.deepEqual(await fs.readFile(f.file), before);
});

for (const format of ["codex", "claude"]) test(`${format}: native names retain case and repeated separators during maintenance`, async (t) => {
  const f = await fixture(t, format);
  await f.run("init", { name: "Team--Plugins_", ...(format === "claude" ? { owner: "Example Team" } : {}) });
  await f.run("add", { name: "My--Tool_V2.name", repo: "example-org/tool", ref: "main" });
  await f.run("update", { name: "My--Tool_V2.name", description: "Updated" });
  assert.equal((await f.run("check")).valid, true);
  assert.equal((await f.read()).name, "Team--Plugins_");
  assert.equal((await f.read()).plugins[0].name, "My--Tool_V2.name");
  await f.run("remove", { name: "My--Tool_V2.name" });
  assert.deepEqual((await f.read()).plugins, []);
});

test("catalog and plugin names use distinct native grammars", async (t) => {
  const codex = await fixture(t);
  await assert.rejects(codex.run("init", { name: "team.plugins" }), /Codex catalog name/);
  assert.deepEqual(await fs.readdir(codex.root), []);
  await codex.run("init", { name: "_Team--" });
  for (const name of ["Tool.V2", "_Tool--"]) await codex.run("add", { name, repo: "example-org/tool", ref: "main" });
  for (const name of [".Tool", "Tool.", "Tool..V2"]) await assert.rejects(codex.run("add", { name, repo: "example-org/tool", ref: "main" }), /Codex plugin name/);
  const claude = await fixture(t, "claude");
  for (const name of ["_Team", "Team..Plugins"]) await assert.rejects(claude.run("init", { name, owner: "Example Team" }), /Claude catalog name/);
  await claude.run("init", { name: "Team.Plugins", owner: "Example Team" });
  for (const name of ["Tool..V2", "Tool."]) await claude.run("add", { name, repo: "example-org/tool", ref: "main" });
  await assert.rejects(claude.run("add", { name: "_Tool", repo: "example-org/tool", ref: "main" }), /Claude plugin name/);
  assert.equal((await claude.run("check")).valid, true);
});

for (const format of ["codex", "claude"]) test(`${format}: new reserved catalogs fail but existing catalogs remain editable with a warning`, async (t) => {
  const names = format === "claude" ? ["npm", "NPM", "claudeai-demo", "claude-plugins-official", "hasOwnProperty"] : ["openai-curated", "workspace-directory"];
  for (const name of names) {
    const f = await fixture(t, format);
    await assert.rejects(f.run("init", { name, ...(format === "claude" ? { owner: "Example Team" } : {}) }), /Catalog name is reserved/);
    assert.deepEqual(await fs.readdir(f.root), []);
    const document = { name, ...(format === "claude" ? { owner: { name: "Example Team" } } : {}), plugins: [{ name: "Tool", source: { source: "url", url: "https://github.com/example-org/tool.git", ref: "main" } }] };
    await f.write(document); const before = await fs.readFile(f.file);
    for (const action of ["list", "check"]) {
      const result = await f.run(action);
      assert.equal(result.valid, false);
      assert.deepEqual(result.warnings, ["Catalog name is reserved by the native host; source-dependent exception not verified."]);
      assert.deepEqual(await fs.readFile(f.file), before);
    }
    const updated = await f.run("update", { name: "Tool", description: "Updated" });
    assert.equal(updated.warnings.length, 1);
    assert.deepEqual(await f.read(), { ...document, plugins: [{ ...document.plugins[0], description: "Updated" }] });
    const removed = await f.run("remove", { name: "Tool" });
    assert.equal(removed.warnings.length, 1);
    assert.equal((await f.read()).name, name);
  }
});

test("marketplace reservations do not restrict plugin names or invent case folding", async (t) => {
  const f = await fixture(t, "claude"); await f.run("init", { name: "CLAUDEAI-Demo", owner: "Example Team" });
  for (const name of ["npm", "claudeai-demo", "constructor"]) await f.run("add", { name, repo: "example-org/tool", ref: "main" });
  assert.equal((await f.run("check")).valid, true);
});
