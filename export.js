import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rmdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(REPOSITORY_ROOT, "export.yaml");
const HOME_DIRECTORY = os.homedir();
const LOCAL_USER_NAME = path.basename(HOME_DIRECTORY);
const MAX_SCAN_BYTES = 5 * 1024 * 1024;
const IO_CONCURRENCY = 16;
const UTF16_BE_DECODER = new TextDecoder("utf-16be");
const SHARED_SECTION_START = "# Shared settings start here.";
const SHARED_SECTION_END = "# Shared settings end here.";
const REQUIRE_SHARED_SECTIONS = new Set([".codex/config.toml"]);
const NON_SECRET_VALUE_PREFIX = String.raw`\$\{|\$env:|%[A-Z_][A-Z0-9_]*%|<|your[-_ ]|example|dummy|replace|redacted|xxxx|process\.env\b|import\.meta\.env\b|Deno\.env\b|System\.getenv\b|os\.(?:getenv|environ)\b`;

function credentialAssignmentPattern(namePattern) {
  return new RegExp(
    String.raw`\b(?:${namePattern})\b\s*["']?\s*[:=]\s*["']?(?!${NON_SECRET_VALUE_PREFIX})[^\s"'#]{8,}`,
    "i",
  );
}

const SECRET_PATTERNS = [
  {
    label: "PEM private key",
    pattern: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/,
  },
  {
    label: "PGP private key",
    pattern: /-----BEGIN PGP PRIVATE KEY BLOCK-----/,
  },
  {
    label: "sk-prefixed API key",
    pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/,
  },
  {
    label: "GitHub token",
    pattern: /\b(?:gh[oprsu]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/,
  },
  {
    label: "AWS access credential ID",
    pattern: /\b(?:ABIA|ACCA|AKIA|ASIA)[A-Z0-9]{16}\b/,
  },
  {
    label: "Google API key",
    pattern: /\bAIza[A-Za-z0-9_-]{35}(?![A-Za-z0-9_-])/,
  },
  {
    label: "PuTTY private key",
    pattern: /^PuTTY-User-Key-File-\d+:/,
  },
  {
    label: "Azure Storage account key",
    pattern:
      /\bAccountKey\s*=\s*(?!\$\{|<|your[-_ ]|example|dummy|replace|redacted|xxxx)[A-Za-z0-9+/]{40,}={0,2}/i,
  },
  {
    label: "Azure shared access signature",
    pattern:
      /\bSharedAccessSignature\s*=\s*(?!\$\{|<|your[-_ ]|example|dummy|replace|redacted|xxxx)[^\s"'#]{16,}/i,
  },
  {
    label: "Azure SAS signature",
    pattern:
      /[?&]sig=(?!\$\{|<|your[-_ ]|example|dummy|replace|redacted|xxxx)[A-Za-z0-9%+/]{16,}(?:%3D|=)?/i,
  },
  {
    label: "Azure credential assignment",
    pattern: credentialAssignmentPattern(
      String.raw`AZURE(?:_[A-Z0-9]+)*_(?:CONNECTION_STRING|KEY|SAS|SECRET|TOKEN)`,
    ),
  },
  {
    label: "credential-like assignment",
    pattern: credentialAssignmentPattern(
      String.raw`(?:[A-Za-z][A-Za-z0-9]*[_-])*(?:api[_-]?key|secret[_-]?access[_-]?key|access[_-]?key|access[_-]?token|session[_-]?token|auth[_-]?token|client[_-]?secret|password|passwd|private[_-]?key|secret|token)`,
    ),
  },
  {
    label: "bearer token",
    pattern: new RegExp(
      String.raw`\b(?:authorization\s*[:=]\s*)?bearer\s+(?!${NON_SECRET_VALUE_PREFIX})[A-Za-z0-9._~+/-]{16,}`,
      "i",
    ),
  },
];

const SENSITIVE_FILE_NAMES = [
  /^\.env(?:\.|$)/i,
  /^id_(?:rsa|dsa|ecdsa|ed25519)(?:_sk)?$/i,
  /^(?:credentials?|secrets?)(?:\.|$)/i,
  /\.(?:key|p12|pfx|pem|ppk)$/i,
];

function usage() {
  console.log(`Usage:
  npm run check             Show the export plan and scan source files
  npm run build             Scan and copy source files into this repository

Direct usage:
  node export.js --dry-run
  node export.js --write
  node export.js --help

The scan checks sensitive filenames and text content for the local username,
home-directory paths, and common credential patterns. Files containing paired
Shared settings markers export only those sections and their adjacent comment
blocks. On comments starting with the exact uppercase prefix "# ENV:" or
"# NOTE:", an occurrence of the local username is treated as intentional.
Other checks still apply to those lines. Configured directories are synchronized:
dry runs list obsolete destination entries, and writes remove them.`);
}

function parseArguments(arguments_) {
  const supported = new Set(["--dry-run", "--help", "--write"]);
  const unknown = arguments_.filter((argument) => !supported.has(argument));

  if (unknown.length > 0) {
    throw new Error(`Unknown option: ${unknown.join(", ")}`);
  }

  if (arguments_.length === 0 || arguments_.includes("--help")) {
    usage();
    return null;
  }

  if (
    arguments_.includes("--dry-run") &&
    arguments_.includes("--write")
  ) {
    throw new Error("--dry-run and --write cannot be used together");
  }

  return { write: arguments_.includes("--write") };
}

function parseSimpleYaml(source) {
  const lines = source.replace(/^\uFEFF/, "").split(/\r?\n/);
  const paths = [];
  let inPaths = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (trimmed === "" || trimmed.startsWith("#")) {
      continue;
    }

    if (trimmed === "paths:") {
      if (inPaths) {
        throw new Error(`export.yaml:${index + 1}: duplicate paths section`);
      }
      inPaths = true;
      continue;
    }

    if (!inPaths) {
      throw new Error(
        `export.yaml:${index + 1}: expected \"paths:\" before entries`,
      );
    }

    const match = line.match(/^\s+-\s+(.+?)\s*$/);
    if (!match) {
      throw new Error(
        `export.yaml:${index + 1}: expected \"  - relative/path\"`,
      );
    }

    let value = match[1];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (value === "") {
      throw new Error(`export.yaml:${index + 1}: path must not be empty`);
    }
    paths.push(value);
  }

  if (!inPaths) {
    throw new Error('export.yaml: missing "paths:" section');
  }

  return paths;
}

function normalizeConfiguredPath(configuredPath) {
  const normalized = configuredPath.replaceAll("\\", "/").replace(/^\.\//, "");
  const segments = normalized.split("/");

  if (
    normalized === "" ||
    path.isAbsolute(configuredPath) ||
    /^[A-Za-z]:/.test(normalized) ||
    segments.some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error(`Unsafe configured path: ${configuredPath}`);
  }

  if (
    !normalized.startsWith(".agents/") &&
    !normalized.startsWith(".codex/")
  ) {
    throw new Error(
      `Configured path must be below .agents/ or .codex/: ${configuredPath}`,
    );
  }

  return normalized;
}

function resolveContained(root, relativePath) {
  const resolved = path.resolve(root, ...relativePath.split("/"));
  const relative = path.relative(root, resolved);

  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`Path escapes its root: ${relativePath}`);
  }

  return resolved;
}

function assertNoOverlappingPaths(paths) {
  for (const parent of paths) {
    const parentKey = pathComparisonKey(parent);
    const child = paths.find(
      (candidate) =>
        candidate !== parent &&
        pathComparisonKey(candidate).startsWith(`${parentKey}/`),
    );
    if (child) {
      throw new Error(`Configured paths overlap: ${parent} and ${child}`);
    }
  }
}

function pathComparisonKey(value) {
  return process.platform === "win32" ? value.toLowerCase() : value;
}

async function mapWithConcurrency(items, concurrency, operation) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await operation(items[index]);
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

async function collectFiles(sourcePath, relativePath, directories) {
  const metadata = await lstat(sourcePath);

  if (metadata.isSymbolicLink()) {
    throw new Error(`Symbolic links are not allowed: ${relativePath}`);
  }

  if (metadata.isFile()) {
    return [
      {
        sourcePath,
        relativePath,
        size: metadata.size,
        content: null,
      },
    ];
  }

  if (!metadata.isDirectory()) {
    throw new Error(`Unsupported file type: ${relativePath}`);
  }

  directories.add(relativePath);
  const entries = await readdir(sourcePath);
  const files = [];

  for (const entryName of entries.sort((left, right) => left.localeCompare(right))) {
    const childRelativePath = `${relativePath}/${entryName}`;
    const childSourcePath = path.join(sourcePath, entryName);
    files.push(...(await collectFiles(
      childSourcePath,
      childRelativePath,
      directories,
    )));
  }

  return files;
}

async function collectDestinationDirectory(
  destinationPath,
  relativePath,
  knownMetadata,
) {
  let metadata = knownMetadata;
  if (metadata === undefined) {
    try {
      metadata = await lstat(destinationPath);
    } catch (error) {
      if (error.code === "ENOENT") {
        return { exists: false, files: [], directories: [] };
      }
      throw error;
    }
  }

  if (metadata.isSymbolicLink()) {
    throw new Error(`Destination contains a symbolic link: ${relativePath}`);
  }
  if (!metadata.isDirectory()) {
    throw new Error(
      `Directory export destination is not a directory: ${relativePath}`,
    );
  }

  const files = [];
  const directories = [];
  const entries = await readdir(destinationPath);

  for (const entryName of entries.sort((left, right) => left.localeCompare(right))) {
    const childDestinationPath = path.join(destinationPath, entryName);
    const childRelativePath = `${relativePath}/${entryName}`;
    const childMetadata = await lstat(childDestinationPath);

    if (childMetadata.isSymbolicLink()) {
      throw new Error(
        `Destination contains a symbolic link: ${childRelativePath}`,
      );
    }
    if (childMetadata.isFile()) {
      files.push({
        destinationPath: childDestinationPath,
        relativePath: childRelativePath,
      });
      continue;
    }
    if (!childMetadata.isDirectory()) {
      throw new Error(`Unsupported destination type: ${childRelativePath}`);
    }

    const children = await collectDestinationDirectory(
      childDestinationPath,
      childRelativePath,
      childMetadata,
    );
    files.push(...children.files);
    directories.push(...children.directories, {
      destinationPath: childDestinationPath,
      relativePath: childRelativePath,
    });
  }

  return { exists: true, files, directories };
}

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildPersonalPatterns() {
  const patterns = [];

  if (
    LOCAL_USER_NAME.length >= 3 &&
    !/^(?:user|admin|owner)$/i.test(LOCAL_USER_NAME)
  ) {
    patterns.push({
      label: "local username",
      pattern: new RegExp(escapeRegularExpression(LOCAL_USER_NAME), "i"),
    });
  }

  const homeVariants = new Set([
    HOME_DIRECTORY,
    HOME_DIRECTORY.replaceAll("\\", "/"),
  ]);
  for (const homeVariant of homeVariants) {
    patterns.push({
      label: "absolute home-directory path",
      pattern: new RegExp(escapeRegularExpression(homeVariant), "i"),
    });
  }

  return patterns;
}

const SCAN_PATTERNS = [...buildPersonalPatterns(), ...SECRET_PATTERNS];

function isAllowedUsernameMetadataLine(text, label) {
  if (label !== "local username") {
    return false;
  }

  return /^\s*#\s*(?:ENV|NOTE):\s+\S/.test(text);
}

function decodeText(buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString("utf16le");
  }

  if (buffer[0] === 0xfe && buffer[1] === 0xff) {
    return UTF16_BE_DECODER.decode(buffer.subarray(2));
  }

  if (buffer.includes(0)) {
    return null;
  }

  return buffer.toString("utf8").replace(/^\uFEFF/, "");
}

function oversizedFileResult(file, size, findings) {
  return {
    findings: [
      ...findings,
      {
        relativePath: file.relativePath,
        label: `file is too large to scan (${Math.ceil(size / 1024 / 1024)} MiB)`,
      },
    ],
    content: null,
    ranges: [],
    skippedBinary: false,
  };
}

function selectSharedSections(content, relativePath) {
  const sourceLines = content.split(/\r\n|[\n\r]/);
  const markerPairs = [];
  let startIndex = null;

  for (let index = 0; index < sourceLines.length; index += 1) {
    const trimmed = sourceLines[index].trim();
    const lineNumber = index + 1;

    if (trimmed === SHARED_SECTION_START) {
      if (startIndex !== null) {
        throw new Error(
          `${relativePath}:${lineNumber}: nested Shared settings start marker`,
        );
      }
      startIndex = index;
      continue;
    }

    if (trimmed === SHARED_SECTION_END) {
      if (startIndex === null) {
        throw new Error(
          `${relativePath}:${lineNumber}: Shared settings end marker without a start marker`,
        );
      }
      markerPairs.push({ startIndex, endIndex: index });
      startIndex = null;
    }
  }

  if (startIndex !== null) {
    throw new Error(
      `${relativePath}:${startIndex + 1}: Shared settings start marker without an end marker`,
    );
  }

  if (markerPairs.length === 0) {
    return null;
  }

  const isCommentLine = (line) => line.trimStart().startsWith("#");
  const sections = [];
  let previousEndIndex = -1;

  for (let index = 0; index < markerPairs.length; index += 1) {
    const markerPair = markerPairs[index];
    const nextStartIndex = markerPairs[index + 1]?.startIndex
      ?? sourceLines.length;
    let sectionStartIndex = markerPair.startIndex;
    let sectionEndIndex = markerPair.endIndex;

    while (
      sectionStartIndex > previousEndIndex + 1 &&
      isCommentLine(sourceLines[sectionStartIndex - 1])
    ) {
      sectionStartIndex -= 1;
    }

    while (
      sectionEndIndex + 1 < nextStartIndex &&
      isCommentLine(sourceLines[sectionEndIndex + 1])
    ) {
      sectionEndIndex += 1;
    }

    const lines = sourceLines
      .slice(sectionStartIndex, sectionEndIndex + 1)
      .map((text, lineIndex) => ({
        text,
        lineNumber: sectionStartIndex + lineIndex + 1,
      }));
    sections.push({
      lines,
      startLine: sectionStartIndex + 1,
      endLine: sectionEndIndex + 1,
    });
    previousEndIndex = sectionEndIndex;
  }

  return {
    content: `${sections
      .map((section) => section.lines.map(({ text }) => text).join("\n"))
      .join("\n\n")}\n`,
    lines: sections.flatMap((section) => section.lines),
    ranges: sections.map(({ startLine, endLine }) => ({ startLine, endLine })),
  };
}

async function scanFile(file) {
  const findings = [];
  const fileName = path.basename(file.sourcePath);

  if (SENSITIVE_FILE_NAMES.some((pattern) => pattern.test(fileName))) {
    findings.push({ relativePath: file.relativePath, label: "sensitive filename" });
  }

  if (file.size > MAX_SCAN_BYTES) {
    return oversizedFileResult(file, file.size, findings);
  }

  const buffer = await readFile(file.sourcePath);
  if (buffer.byteLength > MAX_SCAN_BYTES) {
    return oversizedFileResult(file, buffer.byteLength, findings);
  }

  const content = decodeText(buffer);
  if (content === null) {
    if (REQUIRE_SHARED_SECTIONS.has(file.relativePath)) {
      throw new Error(
        `${file.relativePath}: Shared settings markers require a text file`,
      );
    }
    return {
      findings,
      content: buffer,
      ranges: [],
      skippedBinary: true,
    };
  }

  const hasSharedMarker =
    content.includes(SHARED_SECTION_START) ||
    content.includes(SHARED_SECTION_END);
  const sharedSections = hasSharedMarker
    ? selectSharedSections(content, file.relativePath)
    : null;
  if (
    sharedSections === null &&
    REQUIRE_SHARED_SECTIONS.has(file.relativePath)
  ) {
    throw new Error(
      `${file.relativePath}: paired Shared settings markers are required`,
    );
  }
  const lines = sharedSections === null
    ? content
      .split(/\r\n|[\n\r]/)
      .map((text, index) => ({ text, lineNumber: index + 1 }))
    : sharedSections.lines;

  for (const { text, lineNumber } of lines) {
    for (const { label, pattern } of SCAN_PATTERNS) {
      if (
        pattern.test(text) &&
        !isAllowedUsernameMetadataLine(text, label)
      ) {
        findings.push({
          relativePath: file.relativePath,
          line: lineNumber,
          label,
        });
      }
    }
  }

  return {
    findings,
    content: sharedSections === null
      ? buffer
      : Buffer.from(sharedSections.content, "utf8"),
    ranges: sharedSections?.ranges ?? [],
    skippedBinary: false,
  };
}

async function assertNoDestinationSymbolicLinks(destinationPath) {
  const relative = path.relative(REPOSITORY_ROOT, destinationPath);
  let currentPath = REPOSITORY_ROOT;

  for (const segment of relative.split(path.sep)) {
    currentPath = path.join(currentPath, segment);
    try {
      if ((await lstat(currentPath)).isSymbolicLink()) {
        throw new Error(
          `Destination contains a symbolic link: ${path.relative(REPOSITORY_ROOT, currentPath)}`,
        );
      }
    } catch (error) {
      if (error.code === "ENOENT" || error.code === "ENOTDIR") {
        return;
      }
      throw error;
    }
  }
}

async function destinationMatches(destinationPath, content) {
  let metadata;
  try {
    metadata = await lstat(destinationPath);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") {
      return false;
    }
    throw error;
  }

  if (!metadata.isFile() || metadata.size !== content.byteLength) {
    return false;
  }

  return (await readFile(destinationPath)).equals(content);
}

async function buildDirectorySyncPlan(
  destinationPath,
  relativePath,
  sourceFiles,
  sourceDirectories,
) {
  const destination = await collectDestinationDirectory(
    destinationPath,
    relativePath,
  );
  const expectedFiles = new Set(
    sourceFiles.map(({ relativePath: filePath }) => pathComparisonKey(filePath)),
  );
  const expectedDirectories = new Set(
    [...sourceDirectories].map(pathComparisonKey),
  );
  const existingDirectories = new Set([
    ...(destination.exists ? [relativePath] : []),
    ...destination.directories.map(({ relativePath: directoryPath }) =>
      directoryPath),
  ].map(pathComparisonKey));

  return {
    directoriesToCreate: [...sourceDirectories]
      .filter((directoryRelativePath) =>
        !existingDirectories.has(pathComparisonKey(directoryRelativePath)))
      .map((directoryRelativePath) =>
        resolveContained(REPOSITORY_ROOT, directoryRelativePath)),
    obsoleteFiles: destination.files.filter(
      ({ relativePath: filePath }) =>
        !expectedFiles.has(pathComparisonKey(filePath)),
    ),
    obsoleteDirectories: destination.directories.filter(
      ({ relativePath: directoryRelativePath }) =>
        !expectedDirectories.has(pathComparisonKey(directoryRelativePath)),
    ),
  };
}

function combineDirectorySyncPlans(plans) {
  return {
    directoriesToCreate: plans.flatMap(
      ({ directoriesToCreate: entries }) => entries,
    ),
    obsoleteDirectories: plans.flatMap(
      ({ obsoleteDirectories: entries }) => entries,
    ),
    obsoleteFiles: plans.flatMap(({ obsoleteFiles: entries }) => entries),
  };
}

async function validateObsoleteEntries(obsoleteFiles, obsoleteDirectories) {
  await mapWithConcurrency(
    obsoleteFiles,
    IO_CONCURRENCY,
    async ({ destinationPath, relativePath }) => {
      const metadata = await lstat(destinationPath);
      if (!metadata.isFile() || metadata.isSymbolicLink()) {
        throw new Error(`Obsolete destination is not a file: ${relativePath}`);
      }
    },
  );

  await mapWithConcurrency(
    obsoleteDirectories,
    IO_CONCURRENCY,
    async ({ destinationPath, relativePath }) => {
      const metadata = await lstat(destinationPath);
      if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
        throw new Error(
          `Obsolete destination is not a directory: ${relativePath}`,
        );
      }
    },
  );
}

async function removeObsoleteEntries(obsoleteFiles, obsoleteDirectories) {
  await validateObsoleteEntries(obsoleteFiles, obsoleteDirectories);
  await mapWithConcurrency(
    obsoleteFiles,
    IO_CONCURRENCY,
    ({ destinationPath }) => unlink(destinationPath),
  );

  for (const { destinationPath } of obsoleteDirectories) {
    await rmdir(destinationPath);
  }
}

async function writeFiles(files, directorySyncPlan) {
  const plannedWrites = await mapWithConcurrency(
    files,
    IO_CONCURRENCY,
    async (file) => {
      const destinationPath = resolveContained(
        REPOSITORY_ROOT,
        file.relativePath,
      );
      await assertNoDestinationSymbolicLinks(destinationPath);
      return {
        content: file.content,
        destinationPath,
        unchanged: await destinationMatches(destinationPath, file.content),
      };
    },
  );
  const changedFiles = plannedWrites.filter(({ unchanged }) => !unchanged);
  const {
    directoriesToCreate,
    obsoleteDirectories,
    obsoleteFiles,
  } = directorySyncPlan;

  await removeObsoleteEntries(obsoleteFiles, obsoleteDirectories);

  for (const destinationPath of directoriesToCreate) {
    await mkdir(destinationPath, { recursive: true });
  }

  await mapWithConcurrency(changedFiles, IO_CONCURRENCY, async ({
    content,
    destinationPath,
  }) => {
    await mkdir(path.dirname(destinationPath), { recursive: true });
    await writeFile(destinationPath, content);
  });

  return {
    unchangedCount: plannedWrites.length - changedFiles.length,
    updatedCount: changedFiles.length,
    removedDirectoryCount: obsoleteDirectories.length,
    removedFileCount: obsoleteFiles.length,
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options === null) {
    return;
  }
  const { write } = options;
  const configuredPaths = parseSimpleYaml(await readFile(CONFIG_PATH, "utf8"));
  const normalizedPaths = configuredPaths.map(normalizeConfiguredPath);

  if (
    new Set(normalizedPaths.map(pathComparisonKey)).size !==
    normalizedPaths.length
  ) {
    throw new Error("export.yaml contains duplicate paths");
  }
  assertNoOverlappingPaths(normalizedPaths);

  if (normalizedPaths.length === 0) {
    console.log("No paths are configured in export.yaml.");
    return;
  }

  console.log(write ? "Export plan:" : "Dry-run export plan:");

  const exports = await mapWithConcurrency(
    normalizedPaths,
    IO_CONCURRENCY,
    async (relativePath) => {
      const sourcePath = resolveContained(HOME_DIRECTORY, relativePath);
      const destinationPath = resolveContained(REPOSITORY_ROOT, relativePath);
      const sourceDirectories = new Set();
      const files = await collectFiles(
        sourcePath,
        relativePath,
        sourceDirectories,
      );
      const directorySyncPlan = sourceDirectories.size > 0
        ? await buildDirectorySyncPlan(
          destinationPath,
          relativePath,
          files,
          sourceDirectories,
        )
        : null;

      return {
        destinationPath,
        directorySyncPlan,
        files,
        sourcePath,
      };
    },
  );

  for (const { destinationPath, files, sourcePath } of exports) {
    console.log(`  ${sourcePath}`);
    console.log(`    -> ${destinationPath} (${files.length} file(s))`);
  }

  const files = exports.flatMap(({ files: entries }) => entries);
  const directorySyncPlan = combineDirectorySyncPlans(
    exports
      .map(({ directorySyncPlan: plan }) => plan)
      .filter((plan) => plan !== null),
  );
  const { obsoleteDirectories, obsoleteFiles } = directorySyncPlan;
  if (obsoleteFiles.length > 0 || obsoleteDirectories.length > 0) {
    console.log("\nObsolete destination entries to remove:");
    for (const { relativePath } of obsoleteFiles) {
      console.log(`  ${relativePath}`);
    }
    for (const { relativePath } of obsoleteDirectories) {
      console.log(`  ${relativePath}/`);
    }
  }

  console.log("\nChecking for personal and sensitive information...");
  const scanResults = await mapWithConcurrency(files, IO_CONCURRENCY, scanFile);
  for (let index = 0; index < files.length; index += 1) {
    files[index].content = scanResults[index].content;
    if (scanResults[index].ranges.length > 0) {
      const ranges = scanResults[index].ranges
        .map(({ startLine, endLine }) => `${startLine}-${endLine}`)
        .join(", ");
      console.log(
        `  ${files[index].relativePath}: selected ${scanResults[index].ranges.length} Shared settings section(s) (lines ${ranges})`,
      );
    }
  }
  const findings = scanResults.flatMap((result) => result.findings);
  const skippedBinaryCount = scanResults.filter(
    (result) => result.skippedBinary,
  ).length;

  if (findings.length > 0) {
    console.error(`Found ${findings.length} potential issue(s); nothing was changed:`);
    for (const finding of findings) {
      const location = finding.line
        ? `${finding.relativePath}:${finding.line}`
        : finding.relativePath;
      console.error(`  ${location}: ${finding.label}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("No potential issues found.");
  if (skippedBinaryCount > 0) {
    console.log(
      `Skipped content scanning for ${skippedBinaryCount} binary file(s); filenames were still checked.`,
    );
  }

  if (!write) {
    const action = obsoleteFiles.length > 0 || obsoleteDirectories.length > 0
      ? "copy files and remove the obsolete destination entries"
      : "copy files";
    console.log(`\nDry run only. Run "npm run build" to ${action}.`);
    return;
  }

  const {
    removedDirectoryCount,
    removedFileCount,
    unchangedCount,
    updatedCount,
  } = await writeFiles(files, directorySyncPlan);
  if (
    updatedCount === 0 &&
    removedFileCount === 0 &&
    removedDirectoryCount === 0
  ) {
    console.log(`\nAll ${unchangedCount} file(s) are already up to date.`);
    return;
  }

  console.log(`\nUpdated ${updatedCount} file(s); ${unchangedCount} unchanged.`);
  if (removedFileCount > 0 || removedDirectoryCount > 0) {
    console.log(
      `Removed ${removedFileCount} obsolete file(s) and ${removedDirectoryCount} obsolete directory/directories.`,
    );
  }
  console.log(
    'Review the result with "git status --short" and, for tracked files, "git diff".',
  );
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
