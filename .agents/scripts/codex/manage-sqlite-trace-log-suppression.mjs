import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";

const homePath = homedir();
const databasePath = join(homePath, ".codex", "logs_2.sqlite");
const databaseDisplayPath = "~/.codex/logs_2.sqlite";
const triggerName = "codex_suppress_trace_logs";
const validCommands = new Set(["status", "suppress", "restore"]);
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
const expectedTriggerSql = `
  CREATE TRIGGER codex_suppress_trace_logs
  BEFORE INSERT ON logs
  WHEN NEW.level = 'TRACE'
  BEGIN
    SELECT RAISE(IGNORE);
  END;
`;

function printHelp() {
  console.log(`Manage TRACE-log suppression for the Codex SQLite diagnostic log.

Usage:
  node "$HOME/.agents/scripts/codex/manage-sqlite-trace-log-suppression.mjs" <command>

Commands:
  status
    Inspect the active logs_2.sqlite database without changing it.
    Reports the database, WAL, and SHM sizes; whether the suppression
    trigger is installed; the exact logs-table schema; log levels; and a
    metadata-only assessment of up to ${recentSampleLimit} rows from the
    latest logged process.

  suppress
    Install an idempotent SQLite trigger that ignores future rows whose
    level is exactly TRACE. Existing TRACE rows are not deleted.
    INFO, WARN, ERROR, and other non-TRACE rows continue to be stored.
    Installation is refused unless the known schema still matches and recent,
    fresh rows provide strong evidence that high-frequency TRACE logging
    continues.

  restore
    Remove the TRACE-suppression trigger if it exists. Existing log rows
    are not changed.

  help, --help, -h
    Show this help.

Target:
  ${databaseDisplayPath}

Safety:
  - Fully exit the ChatGPT app before running "suppress" or "restore".
  - Mutating commands require an interactive terminal and a "y" confirmation.
    Pressing Enter or entering any other response cancels without changes.
  - This script never creates a missing logs_2.sqlite database.
  - This script never deletes log rows, runs VACUUM, or removes WAL/SHM files.
  - If an app update changes any part of the expected "logs" table schema,
    "suppress" stops without changing the database.
  - "suppress" assesses only rows sharing the newest row's process UUID. It
    requires at least ${minimumRecentRows} such rows, at least
    ${minimumRecentTraceRows} TRACE rows, a TRACE share of at least
    ${Math.round(minimumRecentTraceRatio * 100)}%, and a newest row no older
    than 24 hours. These are conservative evidence thresholds, not a claim
    that every TRACE row is erroneous.
  - If a trigger with the expected name has different SQL, this script refuses
    to replace or remove it.
  - The workaround is stored inside logs_2.sqlite. It normally survives a
    computer restart, but it is lost if Codex replaces or recreates the DB.
  - This is an unsupported workaround for openai/codex issue #29674.

Diagnostic-data limitation:
  SQLite RAISE(IGNORE) abandons the INSERT statement that fired the trigger.
  If Codex inserts mixed log levels in one batch, non-TRACE rows after the
  first TRACE row in that same INSERT statement may also be omitted.

Requirements:
  Node.js with the built-in node:sqlite module (Node.js 22.5 or newer).

Recommended manual workflow:
  1. Fully exit the ChatGPT app.
  2. Run "status".
  3. Run "suppress" only when status reports qualifying recent evidence.
  4. Start the ChatGPT app again.
  5. To reassess after an app update, run "restore", use the updated app
     normally for one test session, fully exit it, and run "status" again.
     An active trigger hides the behavior needed to tell whether upstream
     fixed the problem.

Exit codes:
  0  Help displayed or command completed successfully.
  1  Database, schema, SQLite, or filesystem operation failed.
  2  Unknown command or invalid arguments.`);
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

function triggerMatchesExpectedSql(trigger) {
  return (
    trigger
    && normalizeSql(trigger.sql) === normalizeSql(expectedTriggerSql)
  );
}

function assertExpectedTriggerSql(trigger) {
  if (!triggerMatchesExpectedSql(trigger)) {
    throw new Error(
      `Trigger "${triggerName}" exists with unexpected SQL; refusing to modify it.`,
    );
  }
}

async function confirmMutation(command) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      `"${command}" requires an interactive terminal so the app-closed confirmation cannot be bypassed.`,
    );
  }

  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let answer;

  try {
    answer = await readline.question(
      `Fully exit the ChatGPT app before continuing.\nRun "${command}"? [y/N]: `,
    );
  } finally {
    readline.close();
  }

  if (answer.trim().toLowerCase() !== "y") {
    console.log("Cancelled; no database changes were made.");
    return false;
  }

  return true;
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
    `  suppression evidence: ${evidence.qualifies ? "qualifies" : "does not qualify"}`,
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
    let suppressionStatus = "inactive";

    if (triggerMatchesExpectedSql(trigger)) {
      suppressionStatus = `active (${trigger.name})`;
    } else if (trigger) {
      suppressionStatus = `unexpected SQL (${trigger.name})`;
    }

    console.log(`TRACE suppression: ${suppressionStatus}`);

    const triggers = getLogTableTriggers(database);
    console.log("Triggers on the logs table:");

    if (triggers.length === 0) {
      console.log("  (none)");
    } else {
      for (const entry of triggers) {
        const marker = triggerMatchesExpectedSql(entry)
          ? "expected"
          : "unrecognized";
        console.log(`  ${entry.name} (${marker})`);
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
          "Upstream-fix assessment: unknown while suppression is active. Restore it, run one normal session on the updated app, then check again.",
        );
      } else if (!schemaIsExpected) {
        console.log(
          "Upstream-fix assessment: schema changed; review is required before suppression can be installed.",
        );
      } else if (evidence.qualifies) {
        console.log(
          "Upstream-fix assessment: high-frequency TRACE output is still observed in fresh rows.",
        );
      } else {
        console.log(
          "Upstream-fix assessment: insufficient fresh evidence of high-frequency TRACE output; suppression will be refused.",
        );
      }
    } else {
      console.log(
        "Recent-log assessment is unavailable because id, ts, level, or process_uuid is missing.",
      );
    }

    if (trigger) {
      console.log(
        "Note: existing TRACE rows remain visible; the trigger affects only future inserts.",
      );
    }
  } finally {
    database.close();
  }
}

async function suppressTraceLogs(DatabaseSync) {
  const preflightDatabase = openDatabase(DatabaseSync, true);
  let evidence;

  try {
    assertExpectedSchema(preflightDatabase);
    const existingTrigger = getTrigger(preflightDatabase);

    if (existingTrigger) {
      assertExpectedTriggerSql(existingTrigger);
      console.log(
        `TRACE suppression is already active: ${existingTrigger.name}`,
      );
      console.log(
        "Its presence prevents an upstream-fix assessment; restore it before testing an updated app.",
      );
      return;
    }

    evidence = getRecentEvidence(preflightDatabase);
    printRecentEvidence(evidence);

    if (!evidence.qualifies) {
      throw new Error(
        "Recent rows do not provide strong, fresh evidence of high-frequency TRACE logging; refusing to install the workaround.",
      );
    }
  } finally {
    preflightDatabase.close();
  }

  if (!(await confirmMutation("suppress"))) {
    return;
  }

  const database = openDatabase(DatabaseSync, false);

  try {
    database.exec("PRAGMA busy_timeout = 5000;");
    assertExpectedSchema(database);

    const existingTrigger = getTrigger(database);

    if (existingTrigger) {
      assertExpectedTriggerSql(existingTrigger);
      console.log(
        `TRACE suppression became active before this operation: ${existingTrigger.name}`,
      );
      return;
    }

    const currentEvidence = getRecentEvidence(database);

    if (!currentEvidence.qualifies) {
      throw new Error(
        "Recent evidence changed after confirmation; refusing to install the workaround.",
      );
    }

    runSchemaTransaction(database, () => {
      database.exec(expectedTriggerSql);
      const createdTrigger = getTrigger(database);

      if (!createdTrigger) {
        throw new Error(`Trigger creation verification failed: ${triggerName}`);
      }

      assertExpectedTriggerSql(createdTrigger);
    });

    console.log(`TRACE suppression is active: ${triggerName}`);
    console.log("Existing TRACE rows were not deleted.");
  } finally {
    database.close();
  }
}

async function restoreTraceLogs(DatabaseSync) {
  const preflightDatabase = openDatabase(DatabaseSync, true);

  try {
    const existingTrigger = getTrigger(preflightDatabase);

    if (!existingTrigger) {
      console.log("TRACE suppression is already inactive; no changes were made.");
      return;
    }

    assertExpectedTriggerSql(existingTrigger);
  } finally {
    preflightDatabase.close();
  }

  if (!(await confirmMutation("restore"))) {
    return;
  }

  const database = openDatabase(DatabaseSync, false);

  try {
    database.exec("PRAGMA busy_timeout = 5000;");
    const existingTrigger = getTrigger(database);

    if (!existingTrigger) {
      console.log(
        "TRACE suppression became inactive before this operation; no changes were made.",
      );
      return;
    }

    assertExpectedTriggerSql(existingTrigger);

    runSchemaTransaction(database, () => {
      database.exec(`DROP TRIGGER IF EXISTS "${triggerName}";`);

      if (getTrigger(database)) {
        throw new Error(`Trigger removal verification failed: ${triggerName}`);
      }
    });

    console.log(`TRACE suppression was removed: ${triggerName}`);
    console.log("Existing log rows were not changed.");
  } finally {
    database.close();
  }
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

  const DatabaseSync = await loadDatabaseSync();

  if (command === "status") {
    printStatus(DatabaseSync);
  } else if (command === "suppress") {
    await suppressTraceLogs(DatabaseSync);
  } else {
    await restoreTraceLogs(DatabaseSync);
  }
}

try {
  await main();
} catch (error) {
  console.error(`Error: ${maskHomePath(error.message)}`);
  process.exitCode = 1;
}
