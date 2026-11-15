常時規約と、CSV 移行時だけ読み込む手順を分けた案です。各ファイルの本文は英語にしています。

プロジェクト指示の本文:

```markdown
# Public CLI compatibility

Preserve backward compatibility of the public CLI when changing this project. Existing commands, options, positional arguments, defaults, accepted inputs, exit codes, and documented stdout/stderr formats must continue to work for existing users and scripts.

Use the CLI documentation and compatibility tests to establish current behavior. Add functionality in a way that preserves existing invocations. If a requested change conflicts with this requirement, explain the conflict and propose a compatible approach before making the breaking change.

When changing CLI behavior, run the relevant compatibility checks and report any behavior that remains unverified.
```

必要時に呼び出す `csv-schema-migration/SKILL.md` の本文:

```markdown
---
name: csv-schema-migration
description: "Use when asked to migrate an existing CSV file to a new column schema while preserving the source and writing a separate output file. Do not use for read-only CSV analysis or unrelated CLI changes."
---

# CSV Schema Migration

Produce a CSV that matches the requested target schema while leaving the source file unchanged.

## Establish the migration contract

Identify the source file, output path, ordered target columns, and the mapping from source columns to target columns. Obtain the rules for added or omitted columns, default values, and value conversions from the request or the project's schema specification. Ask for missing decisions that affect the result; do not invent a schema or silently discard data.

Use the project's CSV format requirements when available. Otherwise, inspect the source's delimiter, encoding, quoting, and header conventions and retain them where compatible with the target schema.

## Convert and verify

1. Read the source with a CSV-aware parser that handles quoted delimiters and embedded newlines. Check that the required source columns exist and that records can be parsed consistently. Report malformed records or ambiguous headers before proceeding with a lossy interpretation.
2. Resolve the source and output locations. The output must be a different file, including through aliases or links, and must not replace an existing file. If the proposed destination is unsuitable, choose a new available path consistent with the request or ask for one when the location is constrained. Never modify, rename, or delete the source.
3. Apply only the established column mappings and conversion rules. Preserve row order and values unless the migration contract explicitly changes them. Keep identifier strings, leading zeros, and empty values intact unless a defined conversion requires otherwise.
4. Write the result to a new temporary file in the output directory. Reparse it and verify the exact target column order, expected record count, and transformed values against the migration contract. Do not silently skip records that fail conversion.
5. Publish the validated file to the chosen output path using a no-overwrite operation. On failure, report the error and identify any temporary artifact; do not present an incomplete file as a completed migration.

## Report the result

State the source and output locations, the column mappings and conversions applied, the input and output record counts, and the validation results. Clearly identify any unresolved issue and whether a complete output file was produced.
```

配置上の注意は次のとおりです。

- 常時規約は、対象プロジェクトで実際に読み込まれるコンテキストファイルへ置きます。固定資料では既定名は `GEMINI.md` ですが、設定で別名も指定できます。既存の規約がある場合は、重複ファイルを増やさず、その読み込み先へ統合します。`AGENTS.md` が現設定で読み込まれることは未確認なので、名前だけを根拠に配置先と決めないでください。
- スキルはプロジェクト単位なら `.agents/skills/csv-schema-migration/SKILL.md`、または `.gemini/skills/csv-schema-migration/SKILL.md` が候補です。同じ階層では `.agents/skills/` 側が優先されるため、同名のスキルを両方に置くことは避けてください。公開 CLI の互換性規約は、この任意に有効化されるスキルへ移さず、常時コンテキスト側に残します。
- 固定資料の CLI 契約では、セッション開始時に有効なスキルの名前と説明を検出し、該当作業で `activate_skill` を介して同意を得た後に本文と同梱リソースを読み込みます。その同意は、個々のコマンドや外部変更を一括で許可するものではありません。

上記は指定された固定資料に基づく本文案です。設定変更、インストール、実際の CSV 変換、対象 CLI での読み込み・有効化確認は行っていません。
