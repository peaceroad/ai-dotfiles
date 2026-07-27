import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { TextDecoder } from "node:util";

const usage = `Usage: node check-lf.mjs [--fix] -- <text-file> [...]

Checks the explicitly listed files for CRLF and bare CR line endings.

Options:
  --fix       Normalize CRLF and bare CR to LF, then verify the result.
  -h, --help  Show this help.

Only pass text files changed in the current task. Files are not discovered
automatically. Without --fix, the command never modifies files.`;

const args = process.argv.slice(2);
const pathArgs = [];
let fix = false;
let optionsEnded = false;
let showHelp = false;
let hasInvalidOption = false;

for (const arg of args) {
  if (!optionsEnded && arg === "--") {
    optionsEnded = true;
  } else if (!optionsEnded && arg === "--fix") {
    fix = true;
  } else if (!optionsEnded && (arg === "-h" || arg === "--help")) {
    showHelp = true;
  } else if (!optionsEnded && arg.startsWith("-")) {
    hasInvalidOption = true;
    break;
  } else {
    pathArgs.push(arg);
  }
}

if (showHelp) {
  console.log(usage);
  process.exit(0);
}

if (hasInvalidOption) {
  console.error("Unknown option. Use --help for usage.");
  process.exit(2);
}

if (pathArgs.length === 0) {
  console.error(usage);
  process.exit(2);
}

const currentDirectory = path.resolve(process.cwd());
const homeDirectory = path.resolve(homedir());

const isWithin = (parent, candidate) => {
  const relative = path.relative(parent, candidate);
  return (
    relative === ""
    || (
      relative !== ".."
      && !relative.startsWith(`..${path.sep}`)
      && !path.isAbsolute(relative)
    )
  );
};

const displayPath = (absolutePath) => {
  if (isWithin(currentDirectory, absolutePath)) {
    const relative = path.relative(currentDirectory, absolutePath);
    return relative === "" ? "." : relative.replaceAll(path.sep, "/");
  }

  if (isWithin(homeDirectory, absolutePath)) {
    const relative = path.relative(homeDirectory, absolutePath);
    return relative === ""
      ? "~"
      : `~/${relative.replaceAll(path.sep, "/")}`;
  }

  return `[external]/${path.basename(absolutePath)}`;
};

const files = [
  ...new Set(pathArgs.map((pathArg) => path.resolve(pathArg))),
].map((absolutePath) => ({
  absolutePath,
  displayPath: displayPath(absolutePath),
}));
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

const errorCode = (error) => (
  typeof error?.code === "string" ? error.code : "UNKNOWN"
);

const scanLineEndings = (data) => {
  let crlfCount = 0;
  let bareCrCount = 0;

  for (let index = 0; index < data.length; index += 1) {
    if (data[index] !== 0x0d) {
      continue;
    }

    if (data[index + 1] === 0x0a) {
      crlfCount += 1;
      index += 1;
    } else {
      bareCrCount += 1;
    }
  }

  return { crlfCount, bareCrCount };
};

const validateTextForNormalization = (data) => {
  if (data.includes(0x00)) {
    return "contains NUL bytes";
  }

  try {
    utf8Decoder.decode(data);
  } catch {
    return "is not valid UTF-8";
  }

  return null;
};

const normalizeLineEndings = (data) => {
  const normalized = Buffer.allocUnsafe(data.length);
  let outputIndex = 0;

  for (let index = 0; index < data.length; index += 1) {
    if (data[index] !== 0x0d) {
      normalized[outputIndex] = data[index];
      outputIndex += 1;
      continue;
    }

    normalized[outputIndex] = 0x0a;
    outputIndex += 1;

    if (data[index + 1] === 0x0a) {
      index += 1;
    }
  }

  return normalized.subarray(0, outputIndex);
};

let failedCount = 0;
let normalizedCount = 0;

for (const file of files) {
  let data;

  try {
    data = await readFile(file.absolutePath);
  } catch (error) {
    console.error(
      `${file.displayPath}: could not read file (${errorCode(error)})`,
    );
    failedCount += 1;
    continue;
  }

  const { crlfCount, bareCrCount } = scanLineEndings(data);

  if (crlfCount === 0 && bareCrCount === 0) {
    continue;
  }

  if (!fix) {
    console.error(
      `${file.displayPath}: CRLF=${crlfCount}, bare CR=${bareCrCount}`,
    );
    failedCount += 1;
    continue;
  }

  const validationError = validateTextForNormalization(data);

  if (validationError !== null) {
    console.error(
      `${file.displayPath}: not normalized because it ${validationError}`,
    );
    failedCount += 1;
    continue;
  }

  const normalized = normalizeLineEndings(data);

  try {
    await writeFile(file.absolutePath, normalized);
  } catch (error) {
    console.error(
      `${file.displayPath}: could not normalize file (${errorCode(error)})`,
    );
    failedCount += 1;
    continue;
  }

  let verified;

  try {
    verified = await readFile(file.absolutePath);
  } catch (error) {
    console.error(
      `${file.displayPath}: could not verify normalized file (${errorCode(error)})`,
    );
    failedCount += 1;
    continue;
  }

  const verifiedCounts = scanLineEndings(verified);

  if (
    !verified.equals(normalized)
    || verifiedCounts.crlfCount !== 0
    || verifiedCounts.bareCrCount !== 0
  ) {
    console.error(`${file.displayPath}: normalization verification failed`);
    failedCount += 1;
    continue;
  }

  console.log(`${file.displayPath}: normalized to LF`);
  normalizedCount += 1;
}

if (failedCount > 0) {
  const summary = fix
    ? `LF normalization failed: checked=${files.length}, normalized=${normalizedCount}, failed=${failedCount}`
    : `LF check failed: checked=${files.length}, failed=${failedCount}`;
  console.error(summary);
  process.exitCode = 1;
} else if (fix) {
  console.log(
    `LF check passed: ${files.length} file(s); normalized=${normalizedCount}`,
  );
} else {
  console.log(`LF check passed: ${files.length} file(s)`);
}
