import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const MANAGER = join(import.meta.dirname, "manage-skill-links.mjs");

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function run(args, env) {
  return spawnSync(process.execPath, [MANAGER, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

test("validates the public reference manifest explicitly", () => {
  const result = run(["validate"], {
    AGENT_DEV_SKILL_LINKS: resolve(import.meta.dirname, "../../home/.agents/ai-dotfiles/skill-links.json"),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /skill link declaration/u);
});

function fixture(t) {
  const home = mkdtempSync(join(tmpdir(), "skill-link-edit-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const manifest = join(home, ".agents/ai-dotfiles/skill-links.json");
  const link = join(home, ".agents/skills/sample-skill");
  const env = { AGENT_DEV_HOME: home, AGENT_DEV_SKILL_LINKS: "", AGENT_DEV_SKILL_MANAGER: "" };
  const sources = ["old", "new"].map(folder => {
    const target = join(home, folder, "sample-skill");
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, "SKILL.md"), "---\nname: sample-skill\n---\n");
    return target;
  });
  return { home, manifest, link, env, sources };
}

test("registration lifecycle preserves sources and supports empty settings", t => {
  const { manifest, link, env, sources } = fixture(t);
  const ok = args => { const r = run(args, env); assert.equal(r.status, 0, r.stdout + r.stderr); return r; };
  assert.match(ok(["status"]).stdout, /No skill link settings/);
  assert.equal(existsSync(manifest), false);
  assert.equal(run(["check"], env).status, 1);
  assert.equal(run(["add", "sample-skill", sources[0]], env).status, 1);
  assert.equal(existsSync(manifest), false);
  ok(["add", "sample-skill", sources[0], "--yes"]);
  assert.equal(existsSync(link), false);
  assert.equal(run(["add", "sample-skill", sources[1], "--yes"], env).status, 1);
  ok(["sync"]);
  ok(["update", "sample-skill", sources[1], "--yes"]);
  assert.equal(resolve(dirname(link), readlinkSync(link)), sources[1]);
  ok(["check"]);
  ok(["remove", "sample-skill", "--yes"]);
  assert.equal(existsSync(link), false);
  assert.deepEqual(JSON.parse(readFileSync(manifest)).skills, {});
  for (const action of ["validate", "status", "check", "sync"]) ok([action]);
  for (const source of sources) assert.equal(existsSync(join(source, "SKILL.md")), true);
});

test("unmatched paths, invalid sources, and locked or redirected settings are not changed", t => {
  const { home, manifest, link, env, sources } = fixture(t);
  assert.equal(run(["add", "sample-skill", join(home,"absent/sample-skill"), "--yes"], env).status, 1);
  assert.equal(existsSync(manifest), false);
  assert.equal(run(["add", "sample-skill", sources[0], "--yes"], env).status, 0);
  const before = readFileSync(manifest, "utf8");
  mkdirSync(dirname(link), { recursive: true });
  mkdirSync(link);
  for (const args of [["remove","sample-skill","--yes"], ["update","sample-skill",sources[1],"--yes"]]) {
    assert.equal(run(args, env).status, 1);
    assert.equal(readFileSync(manifest,"utf8"), before);
    assert.ok(lstatSync(link).isDirectory());
  }
  rmdirSync(link);
  symlinkSync(sources[1],link,"dir");
  assert.match(run(["remove","sample-skill","--yes"],env).stderr,/does not match/);
  rmSync(link);
  writeFileSync(`${manifest}.lock`, "busy");
  assert.match(run(["remove","sample-skill","--yes"],env).stderr,/locked/);
  assert.equal(readFileSync(manifest,"utf8"),before);
  rmSync(`${manifest}.lock`);
  const external = join(home,"external.json");
  writeFileSync(external,before);
  rmSync(manifest);
  symlinkSync(external,manifest,"file");
  assert.match(run(["remove","sample-skill","--yes"],env).stderr,/regular file/);
  assert.equal(readFileSync(external,"utf8"),before);
});

test("menus cancel without writes and detect concurrent manifest edits", t => {
  const { manifest, env, sources } = fixture(t);
  function menu(answers, change = "") {
    return spawnSync(process.execPath, ["--input-type=module", "-e", `
      import {runLinks} from ${JSON.stringify(pathToFileURL(MANAGER).href)};
      import fs from 'node:fs';
      const answers=${JSON.stringify(answers)};
      await runLinks([], {interactive:true, ask:async prompt=>{
        if(prompt.startsWith('Continue?')) { ${change} }
        return answers.shift() ?? null;
      }});
    `], { encoding:"utf8", env:{...process.env,...env} });
  }
  assert.equal(menu(["a","sample-skill",sources[0],"n","q"]).status,0);
  assert.equal(existsSync(manifest),false);
  assert.equal(menu(["2","sample-skill",sources[0],"y","q"]).status,0);
  const changed=JSON.stringify({schemaVersion:1,linkRoot:"~/.agents/skills",skills:{}});
  const result=menu(["u","sample-skill",sources[1],"y","q"],`fs.writeFileSync(${JSON.stringify(manifest)},${JSON.stringify(changed)});`);
  assert.match(result.stderr,/Manifest changed/);
  assert.equal(readFileSync(manifest,"utf8"),changed);
});

test("agent dispatch exposes link commands without development configuration", t => {
  const {env,sources,manifest}=fixture(t);
  const invoke = (command, args) => spawnSync(process.execPath,
    [join(import.meta.dirname,"agent.mjs"),"dev","skill",command,...args],
    {encoding:"utf8",env:{...process.env,...env,AGENT_DEV_CONFIG:join(env.AGENT_DEV_HOME,"absent.json")}});
  for (const args of [[], ["help"], ["status"], ["unknown"], ["remove"]]) {
    const singular = invoke("link", args);
    const plural = invoke("links", args);
    assert.deepEqual([singular.status, singular.stdout, singular.stderr], [plural.status, plural.stdout, plural.stderr]);
  }
  for (const command of ["link", "links"]) {
    for(const args of [["add","sample-skill",sources[0],"--yes"],["status"],["update","sample-skill",sources[1],"--yes"],["remove","sample-skill","--yes"]]) {
      const result = invoke(command, args);
      assert.equal(result.status,0,result.stdout+result.stderr);
    }
    assert.deepEqual(JSON.parse(readFileSync(manifest)).skills,{});
  }
});

test("manifest write failure restores the previous link", t => {
  const {env,sources,manifest,link}=fixture(t);
  assert.equal(run(["add","sample-skill",sources[0],"--yes"],env).status,0);
  assert.equal(run(["sync"],env).status,0);
  const before=readFileSync(manifest,"utf8");
  for(const args of [["update","sample-skill",sources[1],"--yes"],["remove","sample-skill","--yes"]]) {
    const result=spawnSync(process.execPath,["--input-type=module","-e",`
      import fs from 'node:fs';
      import {syncBuiltinESMExports} from 'node:module';
      fs.promises.rename=async()=>{throw new Error('injected commit failure');};
      syncBuiltinESMExports();
      const {runLinks}=await import(${JSON.stringify(pathToFileURL(MANAGER).href)});
      try {await runLinks(${JSON.stringify(args)});} catch(e) {console.error(e.message);process.exitCode=1;}
    `],{encoding:"utf8",env:{...process.env,...env}});
    assert.equal(result.status,1,result.stdout+result.stderr);
    assert.match(result.stderr,/injected commit failure/);
    assert.equal(readFileSync(manifest,"utf8"),before);
    assert.equal(resolve(dirname(link),readlinkSync(link)),sources[0]);
    assert.equal(existsSync(`${manifest}.lock`),false);
  }
});

test("successful commit does not attempt redundant temporary cleanup or roll back its link", t => {
  const { env, sources, manifest, link } = fixture(t);
  assert.equal(run(["add", "sample-skill", sources[0], "--yes"], env).status, 0);
  assert.equal(run(["sync"], env).status, 0);
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import fs from 'node:fs';
    import {syncBuiltinESMExports} from 'node:module';
    const unlink = fs.promises.unlink;
    fs.promises.unlink = async p => {
      if (p.endsWith('.tmp')) throw new Error('unexpected post-commit cleanup');
      return unlink(p);
    };
    syncBuiltinESMExports();
    const {runLinks} = await import(${JSON.stringify(pathToFileURL(MANAGER).href)});
    process.exitCode = await runLinks(${JSON.stringify(["update", "sample-skill", sources[1], "--yes"])});
  `], { encoding: "utf8", env: { ...process.env, ...env } });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(resolve(dirname(link), readlinkSync(link)), sources[1]);
  assert.equal(JSON.parse(readFileSync(manifest)).skills["sample-skill"], "~/new/sample-skill");
});

test("empty sync performs no filesystem writes", t => {
  const { env, manifest, link } = fixture(t);
  writeJson(manifest, { schemaVersion: 1, linkRoot: "~/.agents/skills", skills: {} });
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import fs from 'node:fs';
    import {syncBuiltinESMExports} from 'node:module';
    for (const name of ['open', 'mkdir', 'symlink', 'unlink', 'rename']) {
      fs.promises[name] = async () => { throw new Error('unexpected write: ' + name); };
    }
    syncBuiltinESMExports();
    const {runLinks} = await import(${JSON.stringify(pathToFileURL(MANAGER).href)});
    process.exitCode = await runLinks(['sync']);
  `], { encoding: "utf8", env: { ...process.env, ...env } });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(existsSync(dirname(link)), false);
});

test("redirected link roots are refused before registration or synchronization", t => {
  const {home,env,sources,manifest,link}=fixture(t);
  mkdirSync(dirname(dirname(link)),{recursive:true});
  const other=join(home,"other-links");
  mkdirSync(other);
  symlinkSync(other,dirname(link),"dir");
  const result=run(["add","sample-skill",sources[0],"--yes"],env);
  assert.equal(result.status,1);
  assert.match(result.stderr,/real directory/);
  assert.equal(existsSync(manifest),false);
  writeJson(manifest,{schemaVersion:1,linkRoot:"~/.agents/skills",skills:{"sample-skill":"~/old/sample-skill"}});
  assert.equal(run(["sync"],env).status,1);
  assert.equal(existsSync(join(other,"sample-skill")),false);
});

test("validates, checks, and safely synchronizes declared skill links", () => {
  const root = join(tmpdir(), `skill-links-${process.pid}-${Date.now()}`);
  const home = join(root, "home");
  const target = join(home, "repos", "sample-skill");
  const manifest = join(home, ".agents", "ai-dotfiles", "skill-links.json");
  const link = join(home, ".agents", "skills", "sample-skill");
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, "SKILL.md"), "---\nname: sample-skill\n---\n", "utf8");
  writeJson(manifest, {
    schemaVersion: 1,
    linkRoot: "~/.agents/skills",
    skills: { "sample-skill": "~/repos/sample-skill" },
  });
  // Resolve the default from the user's home, independently of script placement.
  const env = { AGENT_DEV_HOME: home, AGENT_DEV_SKILL_LINKS: "" };

  try {
    assert.equal(run(["validate"], env).status, 0);
    const status = run(["status"], env);
    assert.equal(status.status, 0);
    assert.match(status.stdout, /^missing\s+sample-skill/mu);
    assert.equal(run(["check"], env).status, 1);

    const synchronized = run(["sync"], env);
    assert.equal(synchronized.status, 0, synchronized.stderr);
    assert.equal(lstatSync(link).isSymbolicLink(), true);
    assert.equal(resolve(dirname(link), readlinkSync(link)), resolve(target));
    assert.equal(run(["check"], env).status, 0);

    rmSync(link);
    mkdirSync(link);
    const refused = run(["sync"], env);
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /sync never replaces an existing path/u);
    assert.equal(lstatSync(link).isDirectory(), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
