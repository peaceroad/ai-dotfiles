// @ai-dotfiles agent-dev-runtime managed

import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  existsSync,
  lstatSync,
  realpathSync,
} from "node:fs";
import {
  mkdir,
  mkdtemp,
  open,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import {
  basename,
  dirname,
  join,
  resolve,
} from "node:path";
import { createInterface } from "node:readline/promises";
import { spawnSync } from "node:child_process";

const homePath = homedir();
const validatorPath = join(
  homePath,
  ".codex",
  "skills",
  ".system",
  "skill-creator",
  "scripts",
  "quick_validate.py",
);
const validatorDisplayPath =
  "~/.codex/skills/.system/skill-creator/scripts/quick_validate.py";
const validCommands = new Set(["status", "apply", "restore"]);
const temporaryDirectoryPrefix = "codex-skill-validator-utf8-";
const originalLine = 'content = skill_md.read_text()';
const patchedLine =
  'content = skill_md.read_text(encoding="utf-8")  # Managed by manage-skill-validator-utf8-patch.mjs';
const reviewedVariants = [
  {
    originalHash:
      "5347a0a09cfb546bba1c0d1a30dae0a233d9a05f57bd4e7877155c588bcdabf7",
    patchedHash:
      "3271802f366bd5bdc3498ac7b2d9805920c0392ca3b6f5f58fa9989448500887",
  },
  {
    originalHash:
      "547af3cec2ae71ac2a4ef606365d23a8c58b586862211e9c7a9be7bfd0e30fbb",
    patchedHash:
      "8467d14095ffec0f1e079fd37c8e5768e0164ee66205ec87c91baaffb49807d8",
  },
  {
    originalHash:
      "6068513d924ed3559e186dfcdead7439129828dcf402167fd925c06dffbf2806",
    patchedHash:
      "60d7a11365c2f3f1ec22e57f749c18aaa50177e62f9e284de2f03fa46e3c2ce7",
  },
];
const explicitUtf8Pattern =
  /^[ \t]+content\s*=\s*skill_md\.read_text\(\s*encoding\s*=\s*(["'])utf-8\1\s*\)\s*(?:#.*)?$/m;

function printHelp() {
  console.log(`Manage the UTF-8 patch for Codex skill validation.

Usage:
  node "$HOME/.agents/ai-dotfiles/runtime/codex/manage-skill-validator-utf8-patch.mjs" <command>

Commands:
  status
    Inspect quick_validate.py without changing it. Reports whether the file is
    a reviewed unpatched version, this script's patched version, an unknown
    version containing UTF-8-related source text, or an unknown version requiring
    review.

  apply
    Change the reviewed line:
      ${originalLine}
    to:
      ${patchedLine}
    The command changes the file only when its complete SHA-256 matches a
    reviewed unpatched version.

  restore
    Restore the original line only when the complete file matches the exact
    version produced by this script.

  help, --help, -h
    Show this help.

Target:
  ${validatorDisplayPath}

When needed:
  The issue depends on Python's default text encoding, not the OS alone.
  UTF-8 skill files can fail to read with a non-UTF-8 default (e.g. cp932).
  Usually unnecessary when Python already reads UTF-8 by default.
  The agent codex menu lists this tool on Windows only; explicit commands
  and this standalone script remain available on macOS/Linux too.

Validation dependency:
  "apply" runs the target quick_validate.py with the "python" command.
  quick_validate.py imports the PyYAML package as "yaml".
  This Node.js manager checks that import but never installs Python packages.
  Check the same Python environment with:
    python -c "import yaml; print(yaml.__version__)"
  If the import fails, install PyYAML manually for that environment:
    python -m pip install PyYAML

Safety:
  - Fully exit the ChatGPT app and other Codex processes before "apply" or
    "restore".
  - Mutating commands require an interactive terminal and a "y" confirmation.
    Pressing Enter or entering any other response cancels without changes.
  - Unknown file versions are never modified.
  - UTF-8-related text in an unknown version is not proof of an upstream fix;
    manual review is required and the file is not modified.
  - Symbolic links, hard links, and changed file identities are rejected.
    Keep clients closed; concurrent external file changes are unsupported.
  - The file is rewritten in place so its existing Windows ACL is retained.
  - The complete file is verified immediately before and after each write.
  - If writing or post-write verification fails, the previous bytes are
    restored before the command reports failure.
  - Before writing, the patched candidate is tested without Python UTF-8 mode
    against a temporary skill containing Japanese text.
  - After writing, the installed validator is tested again. A failed test
    rolls back the patch.
  - Codex updates may replace this managed file. Run "status" after updates.
  - Reapply only when status reports the reviewed unpatched version.
    An exact local patch needs no action; unknown source text must be reviewed
    before considering a different patch.

Requirements:
  Node.js 18 or newer.
  Applying the patch also requires a "python" command with PyYAML available.

Exit codes:
  0  Help displayed or command completed successfully.
  1  File state, validation, Python, or filesystem operation failed.
  2  Unknown command or invalid arguments.`);
}

function failUsage(message) {
  console.error(`Error: ${message}\n`);
  printHelp();
  process.exitCode = 2;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function maskHomePath(value) {
  let masked = String(value);
  const homePathVariants = new Set([
    homePath,
    homePath.replaceAll("\\", "/"),
  ]);

  for (const variant of homePathVariants) {
    masked = masked.replaceAll(variant, "~");
  }

  return masked;
}

function assertValidatorExists(path = validatorPath) {
  if (!existsSync(path)) {
    throw new Error(`Validator does not exist: ${validatorDisplayPath}`);
  }

  const stats = lstatSync(path);

  if (stats.isSymbolicLink()) {
    throw new Error(
      `Validator path is a symbolic link; refusing it: ${validatorDisplayPath}`,
    );
  }

  if (!stats.isFile()) {
    throw new Error(`Validator path is not a file: ${validatorDisplayPath}`);
  }
  if (stats.nlink !== 1) {
    throw new Error(`Validator has multiple hard links; refusing it: ${validatorDisplayPath}`);
  }

  return stats;
}

async function assertTargetIdentity(handle, path, expected) {
  const held = await handle.stat();
  const current = assertValidatorExists(path);
  if (!held.isFile() || held.nlink !== 1
    || held.dev !== expected.dev || held.ino !== expected.ino || held.birthtimeMs !== expected.birthtimeMs
    || current.dev !== held.dev || current.ino !== held.ino || current.birthtimeMs !== held.birthtimeMs) {
    throw new Error("The validator file identity or link count changed; refusing to write it.");
  }
}

function decodeUtf8(buffer) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return null;
  }
}

export function classifyValidator(buffer) {
  const hash = sha256(buffer);
  const unpatchedVariant = reviewedVariants.find(
    (variant) => variant.originalHash === hash,
  );

  if (unpatchedVariant) {
    return {
      description: "reviewed unpatched version",
      hash,
      kind: "known-unpatched",
      variant: unpatchedVariant,
    };
  }

  const patchedVariant = reviewedVariants.find(
    (variant) => variant.patchedHash === hash,
  );

  if (patchedVariant) {
    return {
      description: "exact local UTF-8 patch",
      hash,
      kind: "known-patched",
      variant: patchedVariant,
    };
  }

  const text = decodeUtf8(buffer);

  if (text !== null && explicitUtf8Pattern.test(text)) {
    return {
      description: "unknown version containing UTF-8-related text; manual review required",
      hash,
      kind: "unknown-with-utf8-text",
    };
  }

  return {
    description: "unknown version requiring review",
    hash,
    kind: "unknown",
  };
}

async function readValidator() {
  assertValidatorExists();
  return readFile(validatorPath);
}

async function printStatus() {
  const buffer = await readValidator();
  const state = classifyValidator(buffer);

  console.log(`Validator: ${validatorDisplayPath}`);
  console.log(`SHA-256:   ${state.hash}`);
  console.log(`State:     ${state.description}`);

  if (state.kind === "known-unpatched") {
    console.log("Action:    consider apply only if UTF-8 skill reading fails in this Python environment");
  } else if (state.kind === "known-patched") {
    console.log("Action:    none; the local patch is active");
  } else if (state.kind === "unknown-with-utf8-text") {
    console.log("Action:    do not modify; UTF-8-related text alone does not prove a fix; review the source");
  } else {
    console.log("Action:    do not modify; review the new Codex version");
  }
}

async function confirmMutation(command) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      `"${command}" requires an interactive terminal so confirmation cannot be bypassed.`,
    );
  }

  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let answer;

  try {
    answer = await readline.question(
      `Fully exit the ChatGPT app and other Codex processes before continuing.\nRun "${command}"? [y/N]: `,
    );
  } finally {
    readline.close();
  }

  if (answer.trim().toLowerCase() !== "y") {
    console.log("Cancelled; no files were changed.");
    return false;
  }

  return true;
}

function replaceExactlyOnce(buffer, from, to) {
  const text = decodeUtf8(buffer);

  if (text === null) {
    throw new Error("The reviewed validator is not valid UTF-8.");
  }

  const firstIndex = text.indexOf(from);

  if (firstIndex < 0 || text.indexOf(from, firstIndex + from.length) >= 0) {
    throw new Error("The reviewed source line was not found exactly once.");
  }

  return Buffer.from(
    `${text.slice(0, firstIndex)}${to}${text.slice(firstIndex + from.length)}`,
    "utf-8",
  );
}

async function writeAllAtStart(handle, buffer) {
  let offset = 0;

  while (offset < buffer.length) {
    const { bytesWritten } = await handle.write(
      buffer,
      offset,
      buffer.length - offset,
      offset,
    );

    if (bytesWritten === 0) {
      throw new Error("Writing stopped before the complete file was written.");
    }

    offset += bytesWritten;
  }

  await handle.truncate(buffer.length);
  await handle.sync();
}

async function readAllFromHandle(handle) {
  const stats = await handle.stat();
  const buffer = Buffer.alloc(stats.size);
  let offset = 0;

  while (offset < buffer.length) {
    const { bytesRead } = await handle.read(
      buffer,
      offset,
      buffer.length - offset,
      offset,
    );

    if (bytesRead === 0) {
      throw new Error("Reading stopped before the complete file was read.");
    }

    offset += bytesRead;
  }

  return buffer;
}

export async function replaceKnownFile(expectedHash, nextBuffer, nextHash, {
  path = validatorPath, openFile = open,
} = {}) {
  const expectedIdentity = assertValidatorExists(path);
  const handle = await openFile(path, "r+");
  let previousBuffer;

  try {
    await assertTargetIdentity(handle, path, expectedIdentity);
    previousBuffer = await readAllFromHandle(handle);

    if (sha256(previousBuffer) !== expectedHash) {
      throw new Error(
        "The validator changed after the preflight check; refusing to write it.",
      );
    }

    // Recheck after reading too, before the first byte is written.
    await assertTargetIdentity(handle, path, expectedIdentity);

    try {
      await writeAllAtStart(handle, nextBuffer);
      const writtenBuffer = await readAllFromHandle(handle);

      if (sha256(writtenBuffer) !== nextHash) {
        throw new Error("Post-write SHA-256 verification failed.");
      }
      await assertTargetIdentity(handle, path, expectedIdentity);
    } catch (error) {
      try {
        await writeAllAtStart(handle, previousBuffer);
        const restoredBuffer = await readAllFromHandle(handle);

        if (sha256(restoredBuffer) !== expectedHash) {
          throw new Error("rollback SHA-256 verification failed");
        }
      } catch (rollbackError) {
        throw new Error(
          `${error.message} Automatic rollback also failed: ${rollbackError.message}`,
        );
      }

      throw new Error(`${error.message} The previous bytes were restored.`);
    }
  } finally {
    await handle.close();
  }
}

function assertPythonValidationRuntimeAvailable() {
  const result = spawnSync("python", ["-c", "import yaml"], {
    encoding: "utf8",
    windowsHide: true,
  });

  if (result.error) {
    throw new Error(
      `Could not start Python for the PyYAML check: ${result.error.message}`,
    );
  }

  if (result.status !== 0) {
    throw new Error(
      'The target quick_validate.py requires PyYAML, but the "python" command '
      + 'could not import "yaml". This manager does not install Python '
      + "packages. Install it manually for the same Python environment with: "
      + "python -m pip install PyYAML",
    );
  }
}

function assertSafeTemporaryDirectory(path) {
  const resolvedPath = resolve(path);
  const actualParent = dirname(resolvedPath);
  const expectedParent = resolve(tmpdir());
  const parentMatches = process.platform === "win32"
    ? actualParent.toLowerCase() === expectedParent.toLowerCase()
    : actualParent === expectedParent;

  if (
    !parentMatches
    || !basename(resolvedPath).startsWith(temporaryDirectoryPrefix)
  ) {
    throw new Error(`Unsafe temporary directory path: ${resolvedPath}`);
  }
}

async function testValidatorWithUtf8Disabled(validatorBuffer = null) {
  const temporaryRoot = await mkdtemp(
    join(tmpdir(), temporaryDirectoryPrefix),
  );

  try {
    assertSafeTemporaryDirectory(temporaryRoot);
    const temporarySkill = join(temporaryRoot, "skill");
    await mkdir(temporarySkill);

    let validatorToRun = validatorPath;

    if (validatorBuffer !== null) {
      validatorToRun = join(temporaryRoot, "quick_validate.py");
      await writeFile(validatorToRun, validatorBuffer);
    }

    const skillMd = `---
name: utf8-validation-probe
description: 日本語を含むUTF-8検証用スキル
---

# UTF-8 validation probe
`;
    await writeFile(join(temporarySkill, "SKILL.md"), skillMd, "utf8");

    const result = spawnSync(
      "python",
      ["-X", "utf8=0", validatorToRun, temporarySkill],
      {
        encoding: "utf8",
        windowsHide: true,
      },
    );

    if (result.error) {
      throw new Error(`Could not run the validator: ${result.error.message}`);
    }

    if (result.status !== 0) {
      const details = [result.stdout, result.stderr]
        .filter(Boolean)
        .join("\n")
        .trim();
      throw new Error(
        `UTF-8 validation probe failed with exit code ${result.status}${details ? `: ${details}` : ""}`,
      );
    }
  } finally {
    assertSafeTemporaryDirectory(temporaryRoot);
    await rm(temporaryRoot, { force: true, recursive: true });
  }
}

async function applyPatch() {
  const currentBuffer = await readValidator();
  const state = classifyValidator(currentBuffer);

  if (state.kind === "known-patched") {
    console.log("The exact local UTF-8 patch is already active.");
    return;
  }

  if (state.kind === "unknown-with-utf8-text") {
    throw new Error(
      "Unknown validator with UTF-8-related text; refusing to apply the local patch until the source is reviewed.",
    );
  }

  if (state.kind === "unknown") {
    throw new Error(
      "The validator is an unknown version; refusing to apply the local patch.",
    );
  }

  assertPythonValidationRuntimeAvailable();

  const nextBuffer = replaceExactlyOnce(
    currentBuffer,
    originalLine,
    patchedLine,
  );

  if (sha256(nextBuffer) !== state.variant.patchedHash) {
    throw new Error(
      "The generated patch does not match the reviewed patched SHA-256.",
    );
  }

  await testValidatorWithUtf8Disabled(nextBuffer);

  console.log(`Validator: ${validatorDisplayPath}`);
  console.log(`Current:   ${state.description}`);
  console.log("Preflight: patched candidate passed the UTF-8 validation probe");

  if (!(await confirmMutation("apply"))) {
    return;
  }

  const recheckedBuffer = await readValidator();

  if (sha256(recheckedBuffer) !== state.variant.originalHash) {
    throw new Error(
      "The validator changed after confirmation; refusing to apply the patch.",
    );
  }

  await replaceKnownFile(
    state.variant.originalHash,
    nextBuffer,
    state.variant.patchedHash,
  );

  try {
    await testValidatorWithUtf8Disabled();
  } catch (error) {
    await replaceKnownFile(
      state.variant.patchedHash,
      currentBuffer,
      state.variant.originalHash,
    );
    throw new Error(
      `${error.message} The original validator was restored.`,
    );
  }

  console.log("The local UTF-8 patch is active.");
  console.log("The UTF-8 validation probe passed with Python UTF-8 mode disabled.");
}

async function restorePatch() {
  const currentBuffer = await readValidator();
  const state = classifyValidator(currentBuffer);

  if (state.kind === "known-unpatched") {
    console.log("The validator is already the reviewed unpatched version.");
    return;
  }

  if (state.kind === "unknown-with-utf8-text") {
    throw new Error(
      "Unknown validator with UTF-8-related text; refusing to restore an unreviewed version.",
    );
  }

  if (state.kind === "unknown") {
    throw new Error(
      "The validator is an unknown version; refusing to restore it.",
    );
  }

  const originalBuffer = replaceExactlyOnce(
    currentBuffer,
    patchedLine,
    originalLine,
  );

  if (sha256(originalBuffer) !== state.variant.originalHash) {
    throw new Error(
      "The generated restoration does not match the reviewed original SHA-256.",
    );
  }

  console.log(`Validator: ${validatorDisplayPath}`);
  console.log(`Current:   ${state.description}`);

  if (!(await confirmMutation("restore"))) {
    return;
  }

  const recheckedBuffer = await readValidator();

  if (sha256(recheckedBuffer) !== state.variant.patchedHash) {
    throw new Error(
      "The validator changed after confirmation; refusing to restore it.",
    );
  }

  await replaceKnownFile(
    state.variant.patchedHash,
    originalBuffer,
    state.variant.originalHash,
  );
  console.log("The reviewed original validator was restored.");
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printHelp();
    return;
  }

  if (
    args.length === 1
    && ["help", "--help", "-h"].includes(args[0])
  ) {
    printHelp();
    return;
  }

  if (args.length !== 1) {
    failUsage("Exactly one command is required.");
    return;
  }

  const [command] = args;

  if (!validCommands.has(command)) {
    failUsage(`Unknown command: ${command}`);
    return;
  }

  if (command === "status") {
    await printStatus();
  } else if (command === "apply") {
    await applyPatch();
  } else {
    await restorePatch();
  }
}

if (process.argv[1] && process.argv[1] !== "-" && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try {
    await main();
  } catch (error) {
    console.error(`Error: ${maskHomePath(error.message)}`);
    process.exitCode = 1;
  }
}
