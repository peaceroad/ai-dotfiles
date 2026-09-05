import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";

const homePath = homedir();
const databasePath = join(homePath, ".codex", "logs_2.sqlite");
const databaseDisplayPath = "~/.codex/logs_2.sqlite";
const triggerName = "codex_suppress_trace_logs";
const validCommands = new Set(["status", "suppress", "restore"]);
const standardLevels = ["TRACE", "DEBUG", "INFO", "WARN", "ERROR"];
const suppressedLevelsByMinimum = new Map([
  ["trace", []],
  ["debug", ["TRACE"]],
  ["info", ["TRACE", "DEBUG"]],
  ["warn", ["TRACE", "DEBUG", "INFO"]],
  ["error", ["TRACE", "DEBUG", "INFO", "WARN"]],
  ["none", null],
]);
const defaultMinimumRetainedLevel = "info";
const recentSampleLimit = 500;
const minimumRecentRows = 100;
const minimumRecentTraceRows = 50;
const minimumRecentTraceRatio = 0.25;
const maximumNewestLogAgeSeconds = 24 * 60 * 60;
const expectedLogsSchema = [
  { name: "id", type: "INTEGER", notnull: 0, pk: 1 },
  { name: "ts", type: "INTEGER", notnull: 1, pk: 0 },
  { name: "ts_nanos", type: "INTEGER", notnull: 1, pk: 0 },
  { name: "level", type: "TEXT", notnull: 1, pk: 0 },
  { name: "target", type: "TEXT", notnull: 1, pk: 0 },
  { name: "feedback_log_body", type: "TEXT", notnull: 0, pk: 0 },
  { name: "module_path", type: "TEXT", notnull: 0, pk: 0 },
  { name: "file", type: "TEXT", notnull: 0, pk: 0 },
  { name: "line", type: "INTEGER", notnull: 0, pk: 0 },
  { name: "thread_id", type: "TEXT", notnull: 0, pk: 0 },
  { name: "process_uuid", type: "TEXT", notnull: 0, pk: 0 },
  { name: "estimated_bytes", type: "INTEGER", notnull: 1, pk: 0 },
];
const legacyTriggerSql = `
  CREATE TRIGGER codex_suppress_trace_logs
  BEFORE INSERT ON logs
  WHEN NEW.level = 'TRACE'
  BEGIN
    SELECT RAISE(IGNORE);
  END;
`;

function printHelp() {
  console.log(`Manage retained log levels for the Codex SQLite diagnostic log.

Usage:
  node "$HOME/.agents/scripts/codex/manage-sqlite-trace-log-suppression.mjs" <command> [level]

Commands:
  status
    Read-only inspection of logs_2.sqlite, its schema, managed trigger,
    file sizes, visible levels, and recent TRACE evidence.

  suppress [trace|debug|info|warn|error|none]
    Select the minimum standard level to retain. Without an argument, an
    interactive prompt defaults to "${defaultMinimumRetainedLevel}".
      trace  Retain all standard levels; suppress nothing.
      debug  Suppress TRACE.
      info   Suppress TRACE and DEBUG.
      warn   Suppress TRACE, DEBUG, and INFO.
      error  Retain only ERROR among standard levels.
      none   Suppress every future logs-table row, including ERROR and
             unrecognized levels.
    Existing rows are never deleted. Unrecognized levels are retained unless
    "none" is selected.

  restore
    Remove the recognized managed trigger and retain all future log levels.

  help, --help, -h
    Show this help.

Choosing a level:
  Running "suppress" without a level offers all six choices interactively;
  pressing Enter selects "info".
  - "info" balances useful routine diagnostics with reduced log volume.
  - "warn" suits users who rarely inspect logs but want warnings and errors.
  - "error" keeps only errors among the standard levels.
  - "none" discards all future logs-table rows, including errors.

Target:
  ${databaseDisplayPath}

Safety:
  - Fully exit the ChatGPT app before "suppress" or "restore".
  - Changes require an interactive "y" confirmation.
  - Missing databases are never created; changed schemas block suppression.
  - Existing rows are never deleted; VACUUM and WAL/SHM deletion are never run.
  - A new suppression installation requires fresh data from the newest process:
    at least ${minimumRecentRows} rows, including ${minimumRecentTraceRows} TRACE rows;
    at least ${Math.round(minimumRecentTraceRatio * 100)}% TRACE; and a newest row no older than 24 hours.
  - Recognized active policies can be reconfigured because they hide the TRACE
    evidence that originally justified installation.
  - Managed trigger SQL is verified before and after every change.
  - This is an unsupported workaround for openai/codex issue #29674.

After a Codex app update:
  Run "status" first; reapply "suppress" only after checking whether the
  existing managed policy is still active. An active managed policy means the
  previous setting is still in effect. To observe the updated app's fresh log
  behavior, run "restore", use one normal session, then run "status" again.
  This observation does not by itself prove an upstream fix. Reapply
  "suppress" only if the logs are still too noisy.

What "none" means:
  Future INSERTs into the logs table are ignored. Existing rows and file size
  remain unchanged. logs_2.sqlite and its WAL/SHM files may still be opened,
  created, or updated. Other Codex diagnostics and telemetry are unaffected.

SQLite limitation:
  RAISE(IGNORE) abandons the INSERT statement that fired the trigger. In a
  mixed-level batch, retained rows after the first suppressed row may be lost.

Requirements:
  Node.js 22.5 or newer with the built-in node:sqlite module.

Exit codes:
  0  Success.
  1  Inspection, validation, SQLite, or filesystem failure.
  2  Invalid command or arguments.`);
}

function failUsage(message) {
  console.error(`Error: ${message}\n`);
  printHelp();
  process.exitCode = 2;
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

function assertDatabaseExists() {
  if (!existsSync(databasePath)) {
    throw new Error(
      `Codex log database does not exist; refusing to create it: ${databaseDisplayPath}`,
    );
  }

  if (!statSync(databasePath).isFile()) {
    throw new Error(
      `Codex log database is not a file: ${databaseDisplayPath}`,
    );
  }
}

async function loadDatabaseSync() {
  try {
    const { DatabaseSync } = await import("node:sqlite");
    return DatabaseSync;
  } catch (error) {
    throw new Error(
      `Could not load node:sqlite. Use Node.js 22.5 or newer: ${error.message}`,
    );
  }
}

function openDatabase(DatabaseSync, readOnly) {
  assertDatabaseExists();
  return new DatabaseSync(databasePath, { readOnly });
}

function getLogsSchema(database) {
  return database.prepare("PRAGMA table_info(logs)").all().map((column) => ({
    name: String(column.name),
    type: String(column.type).toUpperCase(),
    notnull: Number(column.notnull),
    pk: Number(column.pk),
  }));
}

function schemasMatch(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function assertExpectedSchema(database) {
  const actualSchema = getLogsSchema(database);

  if (!schemasMatch(actualSchema, expectedLogsSchema)) {
    throw new Error(
      'The "logs" table schema differs from the reviewed schema; refusing to install the workaround until the script is reviewed for the new app version.',
    );
  }
}

function hasRecentMetadataColumns(schema) {
  const names = new Set(schema.map((column) => column.name));
  return ["id", "ts", "level", "process_uuid"]
    .every((name) => names.has(name));
}

function formatSchema(schema) {
  if (schema.length === 0) {
    return "(table missing)";
  }

  return schema
    .map((column) => {
      const constraints = [
        column.notnull ? "NOT NULL" : "nullable",
        column.pk ? "PRIMARY KEY" : null,
      ].filter(Boolean);
      return `${column.name} ${column.type || "(untyped)"} ${constraints.join(" ")}`;
    })
    .join("; ");
}

function getTrigger(database) {
  return database
    .prepare(
      "SELECT name, sql FROM sqlite_schema WHERE type = 'trigger' AND name = ?",
    )
    .get(triggerName);
}

function getLogTableTriggers(database) {
  return database
    .prepare(
      "SELECT name, sql FROM sqlite_schema WHERE type = 'trigger' AND tbl_name = 'logs' ORDER BY name",
    )
    .all();
}

function normalizeSql(sql) {
  return String(sql ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/;$/, "");
}

function createManagedTriggerSql(minimumRetainedLevel) {
  if (!suppressedLevelsByMinimum.has(minimumRetainedLevel)) {
    throw new Error(`Unknown retention level: ${minimumRetainedLevel}`);
  }

  const suppressedLevels = suppressedLevelsByMinimum.get(
    minimumRetainedLevel,
  );

  if (suppressedLevels?.length === 0) {
    return null;
  }

  const whenClause = suppressedLevels === null
    ? ""
    : `\n  WHEN NEW.level IN (${suppressedLevels.map((level) => `'${level}'`).join(", ")})`;

  return `
  CREATE TRIGGER ${triggerName}
  BEFORE INSERT ON logs${whenClause}
  BEGIN
    SELECT RAISE(IGNORE);
  END;
`;
}

function getMinimumRetainedLevel(trigger) {
  if (!trigger) {
    return "trace";
  }

  const normalized = normalizeSql(trigger.sql);

  if (normalized === normalizeSql(legacyTriggerSql)) {
    return "debug";
  }

  for (const level of suppressedLevelsByMinimum.keys()) {
    const sql = createManagedTriggerSql(level);

    if (sql !== null && normalized === normalizeSql(sql)) {
      return level;
    }
  }

  return null;
}

function assertRecognizedTrigger(trigger) {
  const level = getMinimumRetainedLevel(trigger);

  if (trigger && level === null) {
    throw new Error(
      `Trigger "${triggerName}" exists with unrecognized SQL; refusing to modify it.`,
    );
  }

  return level;
}

function formatLevelList(levels) {
  if (levels.length === 0) return "none";
  if (levels.length === 1) return levels[0];
  if (levels.length === 2) return `${levels[0]} and ${levels[1]}`;
  return `${levels.slice(0, -1).join(", ")}, and ${levels.at(-1)}`;
}

function getPolicyDetails(minimumRetainedLevel) {
  const suppressed = suppressedLevelsByMinimum.get(minimumRetainedLevel);

  if (suppressed === null) {
    return {
      retained: "no future log rows",
      suppressed: "every future row, including unrecognized levels",
    };
  }

  return {
    retained: formatLevelList(
      standardLevels.filter((level) => !suppressed.includes(level)),
    ),
    suppressed: formatLevelList(suppressed),
  };
}

function formatPolicyStatus(trigger) {
  const level = getMinimumRetainedLevel(trigger);

  if (level === null) return "UNRECOGNIZED managed trigger SQL";
  if (level === "trace") return "inactive; all levels are retained";
  if (level === "none") return `active; no future rows retained (${triggerName})`;
  return `active; minimum retained level ${level.toUpperCase()} (${triggerName})`;
}

function triggerMarker(trigger) {
  if (trigger.name !== triggerName) return "unrecognized";
  const level = getMinimumRetainedLevel(trigger);
  if (level === null) return "unrecognized";
  if (level === "none") return "managed; suppress all future rows";
  return `managed; retain ${level.toUpperCase()} and above`;
}
function assertInteractive(command) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      `"${command}" requires an interactive terminal so confirmation cannot be bypassed.`,
    );
  }
}

async function promptMinimumRetainedLevel() {
  assertInteractive("suppress");
  const readline = createInterface({ input: process.stdin, output: process.stdout });

  console.log(`Minimum standard log level to retain:
  trace  retain all standard levels; suppress nothing
  debug  suppress TRACE
  info   suppress TRACE and DEBUG
  warn   suppress TRACE, DEBUG, and INFO
  error  retain only ERROR among standard levels
  none   suppress every future logs-table row
         (database and WAL/SHM files may still be updated)`);

  try {
    while (true) {
      const answer = await readline.question(
        `Select a level (Enter = ${defaultMinimumRetainedLevel}): `,
      );
      const level = answer.trim().toLowerCase()
        || defaultMinimumRetainedLevel;

      if (suppressedLevelsByMinimum.has(level)) return level;
      console.log(
        `Invalid level: ${answer.trim() || "(empty)"}. Choose ${[...suppressedLevelsByMinimum.keys()].join(", ")}.`,
      );
    }
  } finally {
    readline.close();
  }
}

async function confirmMutation(command, minimumRetainedLevel) {
  assertInteractive(command);
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  const details = getPolicyDetails(minimumRetainedLevel);
  const lines = [
    "Fully exit the ChatGPT app before continuing.",
    `Retain: ${details.retained}.`,
    `Suppress: ${details.suppressed}.`,
    "Existing log rows will not be changed.",
  ];

  if (minimumRetainedLevel === "none") {
    lines.push("Database and WAL/SHM files may still be created or updated.");
  } else {
    lines.push("Unrecognized log levels will remain retained.");
  }

  try {
    const answer = await readline.question(
      `${lines.join("\n")}\nRun "${command}"? [y/N]: `,
    );

    if (answer.trim().toLowerCase() === "y") return true;
    console.log("Cancelled; no database changes were made.");
    return false;
  } finally {
    readline.close();
  }
}
function runSchemaTransaction(database, operation) {
  database.exec("BEGIN IMMEDIATE;");

  try {
    operation();
    database.exec("COMMIT;");
  } catch (error) {
    try {
      database.exec("ROLLBACK;");
    } catch {
      // Preserve the original error. Closing the connection also ends
      // any transaction that could not be rolled back explicitly.
    }

    throw error;
  }
}

function formatFileSize(path) {
  if (!existsSync(path)) {
    return "missing";
  }

  const bytes = statSync(path).size;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB (${bytes} bytes)`;
}

function printDatabaseFiles() {
  console.log(`Database: ${databaseDisplayPath}`);
  console.log(`  main: ${formatFileSize(databasePath)}`);
  console.log(`  WAL:  ${formatFileSize(`${databasePath}-wal`)}`);
  console.log(`  SHM:  ${formatFileSize(`${databasePath}-shm`)}`);
}

function getRecentEvidence(database) {
  const latestRow = database
    .prepare("SELECT process_uuid FROM logs ORDER BY id DESC LIMIT 1")
    .get();
  const processUuid = latestRow?.process_uuid ?? null;
  const rows = database
    .prepare(
      `SELECT id, ts, level
       FROM logs
       WHERE process_uuid = ?
       ORDER BY id DESC
       LIMIT ${recentSampleLimit}`,
    )
    .all(processUuid);
  const counts = new Map();

  for (const row of rows) {
    const level = String(row.level ?? "(null)");
    counts.set(level, (counts.get(level) ?? 0) + 1);
  }

  const traceCount = counts.get("TRACE") ?? 0;
  const traceRatio = rows.length === 0 ? 0 : traceCount / rows.length;
  const newestTimestamp = rows.length === 0
    ? null
    : Math.max(...rows.map((row) => Number(row.ts)));
  const newestAgeSeconds = Number.isFinite(newestTimestamp)
    ? Math.floor(Date.now() / 1000) - newestTimestamp
    : null;
  const rejectionReasons = [];

  if (processUuid === null) {
    rejectionReasons.push(
      "the newest row has no process UUID, so a current-process sample cannot be isolated",
    );
  }

  if (rows.length < minimumRecentRows) {
    rejectionReasons.push(
      `only ${rows.length} recent rows are available; ${minimumRecentRows} are required`,
    );
  }

  if (traceCount < minimumRecentTraceRows) {
    rejectionReasons.push(
      `only ${traceCount} recent TRACE rows are present; ${minimumRecentTraceRows} are required`,
    );
  }

  if (traceRatio < minimumRecentTraceRatio) {
    rejectionReasons.push(
      `the recent TRACE share is ${(traceRatio * 100).toFixed(1)}%; ${Math.round(minimumRecentTraceRatio * 100)}% is required`,
    );
  }

  if (
    newestAgeSeconds === null
    || newestAgeSeconds < 0
    || newestAgeSeconds > maximumNewestLogAgeSeconds
  ) {
    rejectionReasons.push(
      "the newest sampled row is missing, in the future, or older than 24 hours",
    );
  }

  return {
    counts,
    newestAgeSeconds,
    newestTimestamp,
    qualifies: rejectionReasons.length === 0,
    rejectionReasons,
    rowCount: rows.length,
    traceCount,
    traceRatio,
  };
}

function formatTimestamp(timestamp) {
  if (!Number.isFinite(timestamp)) {
    return "(unavailable)";
  }

  return new Date(timestamp * 1000).toISOString();
}

function printRecentEvidence(evidence) {
  console.log(
    `Latest-process metadata sample (${recentSampleLimit} rows maximum):`,
  );
  console.log(`  rows:        ${evidence.rowCount}`);
  console.log(`  TRACE rows:  ${evidence.traceCount}`);
  console.log(`  TRACE share: ${(evidence.traceRatio * 100).toFixed(1)}%`);
  console.log(`  newest row:  ${formatTimestamp(evidence.newestTimestamp)}`);

  const levels = [...evidence.counts.entries()]
    .sort((left, right) => right[1] - left[1]);

  console.log("  levels:");

  if (levels.length === 0) {
    console.log("    (none)");
  } else {
    for (const [level, count] of levels) {
      console.log(`    ${level.padEnd(8)} ${count}`);
    }
  }

  console.log(
    `  new-suppression evidence: ${evidence.qualifies ? "qualifies" : "does not qualify"}`,
  );

  for (const reason of evidence.rejectionReasons) {
    console.log(`    - ${reason}`);
  }
}

function printStatus(DatabaseSync) {
  const database = openDatabase(DatabaseSync, true);

  try {
    printDatabaseFiles();
    const actualSchema = getLogsSchema(database);
    const schemaIsExpected = schemasMatch(actualSchema, expectedLogsSchema);
    console.log(
      `Logs schema: ${schemaIsExpected ? "matches the reviewed schema" : "CHANGED or missing"}`,
    );

    if (!schemaIsExpected) {
      console.log(`  actual: ${formatSchema(actualSchema)}`);
      console.log(`  expected: ${formatSchema(expectedLogsSchema)}`);
    }

    const trigger = getTrigger(database);
    const minimumRetainedLevel = getMinimumRetainedLevel(trigger);
    console.log(`Log retention: ${formatPolicyStatus(trigger)}`);

    const triggers = getLogTableTriggers(database);
    console.log("Triggers on the logs table:");

    if (triggers.length === 0) {
      console.log("  (none)");
    } else {
      for (const entry of triggers) {
        console.log(`  ${entry.name} (${triggerMarker(entry)})`);
      }
    }

    if (hasRecentMetadataColumns(actualSchema)) {
      const levels = database
        .prepare(
          "SELECT level, COUNT(*) AS count FROM logs GROUP BY level ORDER BY count DESC",
        )
        .all();

      console.log("Visible log rows by level:");

      if (levels.length === 0) {
        console.log("  (none)");
      } else {
        for (const row of levels) {
          const level = String(row.level ?? "(null)").padEnd(8);
          console.log(`  ${level} ${row.count}`);
        }
      }

      const evidence = getRecentEvidence(database);
      printRecentEvidence(evidence);

      if (trigger) {
        console.log(
          "Fresh-log assessment: unknown while suppression is active. Restore it, collect fresh logs from one normal session, then check again.",
        );
      } else if (!schemaIsExpected) {
        console.log(
          "Fresh-log assessment: schema changed; review is required before suppression can be installed.",
        );
      } else if (evidence.qualifies) {
        console.log(
          "Fresh-log assessment: high-frequency TRACE output is still observed in fresh rows.",
        );
      } else {
        console.log(
          "Fresh-log assessment: fresh rows do not show high-frequency TRACE output; this alone does not prove an upstream fix.",
        );
      }
    } else {
      console.log(
        "Recent-log assessment is unavailable because id, ts, level, or process_uuid is missing.",
      );
    }

    if (trigger && minimumRetainedLevel !== null) {
      const details = getPolicyDetails(minimumRetainedLevel);
      console.log(
        minimumRetainedLevel === "none"
          ? "Note: all future logs-table rows are suppressed; database files may still be updated."
          : `Note: future ${details.suppressed} rows are suppressed; existing and unrecognized rows remain.`,
      );
    }
  } finally {
    database.close();
  }
}

function triggerSignature(trigger) {
  return trigger ? normalizeSql(trigger.sql) : null;
}

async function configureLogRetention(
  DatabaseSync,
  minimumRetainedLevel,
  command,
) {
  const preflightDatabase = openDatabase(DatabaseSync, true);
  let preflightTrigger;
  let needsEvidence;

  try {
    preflightTrigger = getTrigger(preflightDatabase);
    const currentLevel = assertRecognizedTrigger(preflightTrigger);

    if (currentLevel === minimumRetainedLevel) {
      console.log(
        currentLevel === "trace"
          ? "All future log levels are already retained; no changes were made."
          : `The selected policy is already active: ${formatPolicyStatus(preflightTrigger)}`,
      );
      return;
    }

    if (minimumRetainedLevel !== "trace") {
      assertExpectedSchema(preflightDatabase);
    }

    needsEvidence = !preflightTrigger && minimumRetainedLevel !== "trace";

    if (needsEvidence) {
      const evidence = getRecentEvidence(preflightDatabase);
      printRecentEvidence(evidence);

      if (!evidence.qualifies) {
        throw new Error(
          "Fresh rows do not show high-frequency TRACE logging; refusing new suppression.",
        );
      }
    }
  } finally {
    preflightDatabase.close();
  }

  if (!(await confirmMutation(command, minimumRetainedLevel))) return;

  const database = openDatabase(DatabaseSync, false);

  try {
    database.exec("PRAGMA busy_timeout = 5000;");

    if (minimumRetainedLevel !== "trace") {
      assertExpectedSchema(database);
    }

    const currentTrigger = getTrigger(database);
    assertRecognizedTrigger(currentTrigger);

    if (triggerSignature(currentTrigger) !== triggerSignature(preflightTrigger)) {
      throw new Error(
        "The managed trigger changed after confirmation; refusing to modify it.",
      );
    }

    if (needsEvidence && !getRecentEvidence(database).qualifies) {
      throw new Error(
        "Recent evidence changed after confirmation; refusing new suppression.",
      );
    }

    runSchemaTransaction(database, () => {
      if (currentTrigger) {
        database.exec(`DROP TRIGGER "${triggerName}";`);
      }

      const triggerSql = createManagedTriggerSql(minimumRetainedLevel);
      if (triggerSql !== null) database.exec(triggerSql);

      const finalLevel = assertRecognizedTrigger(getTrigger(database));
      if (finalLevel !== minimumRetainedLevel) {
        throw new Error(
          "Post-change verification found a different policy; rolling back.",
        );
      }
    });

    if (minimumRetainedLevel === "trace") {
      console.log("Managed suppression removed; all future levels retained.");
    } else if (minimumRetainedLevel === "none") {
      console.log("All future logs-table rows are suppressed.");
      console.log("Database and WAL/SHM files may still be updated.");
    } else {
      const details = getPolicyDetails(minimumRetainedLevel);
      console.log(`Retain ${details.retained}; suppress ${details.suppressed}.`);
      console.log("Unrecognized levels remain retained.");
    }

    console.log("Existing log rows were not changed.");
  } finally {
    database.close();
  }
}

async function suppressLogs(DatabaseSync, levelArgument) {
  const level = levelArgument ?? await promptMinimumRetainedLevel();
  await configureLogRetention(DatabaseSync, level, "suppress");
}

async function restoreLogRetention(DatabaseSync) {
  await configureLogRetention(DatabaseSync, "trace", "restore");
}
function parseRetentionLevel(value) {
  const level = String(value).trim().toLowerCase();

  if (!suppressedLevelsByMinimum.has(level)) {
    throw new Error(
      `Invalid retention level "${value}". Choose ${[...suppressedLevelsByMinimum.keys()].join(", ")}.`,
    );
  }

  return level;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printHelp();
    return;
  }

  if (args.length === 1 && ["help", "--help", "-h"].includes(args[0])) {
    printHelp();
    return;
  }

  const [command, levelArgument, ...extraArguments] = args;

  if (!validCommands.has(command)) {
    failUsage(`Unknown command: ${command}`);
    return;
  }

  if (
    extraArguments.length > 0
    || (command !== "suppress" && levelArgument !== undefined)
  ) {
    failUsage('Only "suppress" accepts one optional level.');
    return;
  }

  let level;

  if (levelArgument !== undefined) {
    try {
      level = parseRetentionLevel(levelArgument);
    } catch (error) {
      failUsage(error.message);
      return;
    }
  }

  const DatabaseSync = await loadDatabaseSync();

  if (command === "status") {
    printStatus(DatabaseSync);
  } else if (command === "suppress") {
    await suppressLogs(DatabaseSync, level);
  } else {
    await restoreLogRetention(DatabaseSync);
  }
}
try {
  await main();
} catch (error) {
  console.error(`Error: ${maskHomePath(error.message)}`);
  process.exitCode = 1;
}
