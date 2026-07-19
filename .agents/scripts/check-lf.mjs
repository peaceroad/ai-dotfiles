import { readFile } from "node:fs/promises";

const paths = [
  ...new Set(
    process.argv
      .slice(2)
      .filter((value) => value !== "--"),
  ),
];

if (paths.length === 0) {
  console.error("Usage: node check-lf.mjs -- <text-file> [...]");
  process.exit(2);
}

let failed = false;

for (const path of paths) {
  let data;

  try {
    data = await readFile(path);
  } catch (error) {
    console.error(`${path}: could not read file: ${error.message}`);
    failed = true;
    continue;
  }

  let crlfCount = 0;
  let bareCrCount = 0;
  const firstCr = data.indexOf(0x0d);

  if (firstCr === -1) {
    continue;
  }

  for (let index = firstCr; index < data.length; index += 1) {
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

  if (crlfCount > 0 || bareCrCount > 0) {
    console.error(
      `${path}: CRLF=${crlfCount}, bare CR=${bareCrCount}`,
    );
    failed = true;
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log(`LF check passed: ${paths.length} file(s)`);
}
